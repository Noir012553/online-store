/**
 * Controller quản lý vận đơn (shipments)
 * Xử lý: tạo vận đơn, lấy thông tin, lấy link in nhãn, hủy vận đơn
 */

const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Currency = require('../models/Currency');
const ShippingProvider = require('../models/ShippingProvider');
const ghnService = require('../services/ghnService');
const { GHNAdapter } = require('../adapters/carrierAdapters');
const { withTimeout } = require('../utils/mongooseUtils');
const { getMessage } = require('../i18n/messages');
const { convertOrderAmount, getActiveExchangeRates } = require('../utils/orderRevenue');

/**
 * Tạo vận đơn cho một đơn hàng
 * @route POST /api/shipments
 * @body {
 *   orderId: string,
 *   shippingProvider: "ghn",
 *   shippingService: "standard" | "express",
 *   to_name?: string,
 *   to_phone?: string,
 *   to_address?: string,
 *   to_district_id: number,
 *   to_ward_code: string,
 *   required_note?: string
 * }
 * @access Private
 */
const createShipment = asyncHandler(async (req, res) => {
  const {
    orderId,
    shippingProvider,
    shippingService,
    to_name,
    to_phone,
    to_address,
    to_district_id,
    to_ward_code,
    required_note,
  } = req.body;


  // Validate input
  if (!orderId || !shippingProvider || !shippingService) {
    res.status(400);
    throw new Error(getMessage(req.lang, 'shipment.requiredFields'));
  }

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    res.status(400);
    throw new Error(getMessage(req.lang, 'order.notFound'));
  }

  // Get order
  const order = await withTimeout(Order.findById(orderId).populate('customer'), 8000);
  if (!order) {
    res.status(404);
    throw new Error(getMessage(req.lang, 'order.notFound'));
  }

  if (order.ghnOrderCode) {
    res.status(400);
    throw new Error(getMessage(req.lang, 'shipment.alreadyCreated'));
  }

  // Get shipping provider config
  const provider = await withTimeout(
    ShippingProvider.getByCode(shippingProvider),
    8000
  );
  if (!provider) {
    res.status(404);
    throw new Error(getMessage(req.lang, 'shipment.invalidProvider'));
  }

  const providerCurrencyCode = provider.currencyCode || 'VND';
  const orderCurrency = await Currency.findOne(
    { code: order.currencyCode },
    { decimalPlaces: 1, _id: 0 }
  ).lean();
  if (!orderCurrency) {
    res.status(503);
    throw new Error(`Currency metadata is missing for ${order.currencyCode}`);
  }

  let insuranceValue;
  try {
    const activeRates = await getActiveExchangeRates();
    const convertedInsuranceValue = convertOrderAmount(
      order.baseItemsPrice,
      order.baseCurrencyCode,
      providerCurrencyCode,
      order.exchangeRates || [],
      activeRates
    );

    if (!Number.isFinite(convertedInsuranceValue)) {
      throw new Error('Invalid insurance value');
    }

    insuranceValue = Math.max(0, Math.round(convertedInsuranceValue));
  } catch {
    res.status(503);
    throw new Error('Currency exchange rates are temporarily unavailable');
  }

  // Prepare shipment data

  const recipientName = to_name || order.shippingAddress?.name || order.customer?.name || '';
  const recipientPhone = to_phone || order.shippingAddress?.phone || order.customer?.phone || '';
  const recipientAddress = to_address || order.shippingAddress?.address || '';
  const districtId = to_district_id || order.shippingAddress?.districtId;
  const wardCode = to_ward_code || order.shippingAddress?.wardCode;


  if (!recipientName || !recipientPhone || !recipientAddress || !districtId || !wardCode) {
    res.status(400);
    throw new Error(getMessage(req.lang, 'shipment.missingInfo'));
  }

  if (!Number.isInteger(Number(districtId)) || Number(districtId) <= 0) {
    res.status(400);
    throw new Error(getMessage(req.lang, 'shipment.missingInfo'));
  }

  // Calculate total weight (grams) from order items
  // Tạm thời set weight = 1000g per item, có thể update khi có thông tin chi tiết
  const weight = order.orderItems.length * 1000;

  // Prepare items for shipment
  const items = order.orderItems.map((item) => ({
    name: String(item.name),
    quantity: item.qty,
  }));

  // Get available services from GHN for the specific route
  // This ensures we only use service_id that GHN actually supports for this route
  const FROM_WAREHOUSE_DISTRICT_ID = Number(process.env.GHN_WAREHOUSE_DISTRICT_ID) || 1458;

  let availableServices;
  try {
    availableServices = await ghnService.getAvailableServices({
      from_district_id: FROM_WAREHOUSE_DISTRICT_ID,
      to_district_id: districtId,
    });
  } catch (error) {
    // Fallback: if getAvailableServices fails, use hardcoded service IDs as before
    availableServices = [
      { service_id: 53321, service_type_id: 2, service_code: 'standard' },
      { service_id: 53322, service_type_id: 2, service_code: 'express' },
    ];
  }

  if (!availableServices || availableServices.length === 0) {
    res.status(400);
    throw new Error(getMessage(req.lang, 'shipment.noServiceAvailable'));
  }

  // Smart Service Selection Logic (3-tier strategy)

  let selectedServiceId = null;

  if (availableServices && availableServices.length > 0) {
    // 1️⃣ Tier 1: Tìm service khớp với yêu cầu người dùng (match by short_name)
    const preferredService = availableServices.find((s) =>
      s.short_name?.toLowerCase().includes(shippingService?.toLowerCase())
    );

    // 2️⃣ Tier 2: Nếu không có, ưu tiên loại dịch vụ "Chuẩn" (service_type_id = 2)
    // Vì tính ổn định cao, được hỗ trợ rộng rãi
    const standardService = availableServices.find((s) => s.service_type_id === 2);

    // Chọn theo thứ tự ưu tiên
    selectedServiceId =
      preferredService?.service_id || standardService?.service_id || availableServices[0].service_id;

  } else {
    // 3️⃣ Tier 3: Fallback nếu availableServices mảy rỗng
    // Lấy service ID đầu tiên từ hardcoded fallback list (từ line 109-112)
    selectedServiceId = availableServices[0]?.service_id;
    if (process.env.NODE_ENV === 'development') {
      console.warn(`⚠️ Using fallback service from empty availableServices: ${selectedServiceId}`);
    }
  }


  if (shippingProvider !== 'ghn') {
    res.status(400);
    throw new Error(getMessage(req.lang, 'shipment.unsupportedCarrier'));
  }

  const adapter = new GHNAdapter(provider);

  const shipmentPayload = {
    from_district_id: FROM_WAREHOUSE_DISTRICT_ID,
    from_ward_code: process.env.GHN_WAREHOUSE_WARD_CODE || '21905',
    to_name: recipientName,
    to_phone: recipientPhone,
    to_address: recipientAddress,
    to_district_id: Number(districtId),
    to_ward_code: String(wardCode),
    weight,
    length: 10,
    width: 10,
    height: 10,
    service_id: selectedServiceId,
    insurance_value: insuranceValue,
    items,
    required_note: required_note || 'CHOXEMHANGKHONGTHU',
    payment_type_id: 2,
  };

  const shipmentResult = await adapter.createShipment(shipmentPayload);

  if (!shipmentResult.success) {
    res.status(502);
    throw new Error(shipmentResult.error);
  }

  const shipmentData = shipmentResult.data;
  const orderCode = shipmentData.order_code || shipmentData.orderCode;
  const orderCodeNorm = shipmentData.order_code_norm || shipmentData.orderCodeNorm || orderCode;
  const totalFee = Number(shipmentData.total_fee || shipmentData.totalFee || 0);
  if (!Number.isFinite(totalFee) || totalFee < 0) {
    res.status(502);
    throw new Error('GHN returned an invalid shipping fee');
  }

  let convertedShippingFee;
  try {
    const multiplier = 10 ** orderCurrency.decimalPlaces;
    const activeRates = await getActiveExchangeRates();
    const convertedFee = convertOrderAmount(
      totalFee,
      providerCurrencyCode,
      order.currencyCode,
      order.exchangeRates || [],
      activeRates
    );

    if (!Number.isFinite(convertedFee)) {
      throw new Error('Invalid shipping fee conversion');
    }

    convertedShippingFee = Math.round(convertedFee * multiplier) / multiplier;
  } catch {
    res.status(503);
    throw new Error('Currency exchange rates are temporarily unavailable');
  }

  const utcDeliveryTime = shipmentData.expected_delivery_time || shipmentData.expectedDeliveryTime;
  const expectedDeliveryDate = utcDeliveryTime ? new Date(utcDeliveryTime) : null;

  const previousBaseShippingFee = order.baseShippingFee;
  order.shippingProvider = shippingProvider;
  order.shippingService = shippingService;
  order.providerShippingFee = totalFee;
  order.providerInsuranceValue = insuranceValue;
  order.providerCurrencyCode = providerCurrencyCode;
  order.ghnOrderCode = orderCode;
  order.ghnOrderCodeNorm = orderCodeNorm;
  order.shipmentStatus = 'ready';
  order.shipmentCreatedAt = new Date();
  order.expectedDeliveryTime = expectedDeliveryDate && !Number.isNaN(expectedDeliveryDate.getTime())
    ? expectedDeliveryDate
    : null;
  order.shippingFee = convertedShippingFee;
  order.baseShippingFee = totalFee;
  order.baseTotalPrice = Math.max(0, order.baseTotalPrice - previousBaseShippingFee + totalFee);
  order.totalPrice = Math.max(0, order.itemsPrice + convertedShippingFee - (order.appliedCoupon?.discountAmount || 0));

  if (!Number.isFinite(order.baseTotalPrice) || !Number.isFinite(order.totalPrice)) {
    res.status(503);
    throw new Error('Order currency data is unavailable');
  }

  await order.save();

  res.status(201).json({
    success: true,
    message: getMessage(req.lang, 'shipment.createSuccess'),
    shipment: {
      orderId: order._id,
      ghnOrderCode: order.ghnOrderCode,
      ghnOrderCodeNorm: order.ghnOrderCodeNorm,
      provider: shippingProvider,
      service: shippingService,
      status: order.shipmentStatus,
      totalFee,
      expectedDeliveryTime: order.expectedDeliveryTime,
    },
    order,
  });
});

/**
 * Lấy thông tin vận đơn
 * @route GET /api/shipments/:orderId
 * @access Private
 */
const getShipmentInfo = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await withTimeout(Order.findById(orderId), 8000);
  if (!order) {
    res.status(404);
    throw new Error(getMessage(req.lang, 'order.notFound'));
  }

  if (!order.ghnOrderCode) {
    res.status(400);
    throw new Error(getMessage(req.lang, 'shipment.notFound'));
  }

  res.json({
    success: true,
    shipment: {
      orderId: order._id,
      ghnOrderCode: order.ghnOrderCode,
      ghnOrderCodeNorm: order.ghnOrderCodeNorm,
      provider: order.shippingProvider,
      service: order.shippingService,
      status: order.shipmentStatus,
      shipmentCreatedAt: order.shipmentCreatedAt,
      expectedDeliveryTime: order.expectedDeliveryTime,
      shippingAddress: order.shippingAddress,
    },
  });
});

/**
 * Lấy link in nhãn vận đơn
 * @route GET /api/shipments/:orderId/print-label
 * @access Private
 */
const getPrintLabel = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await withTimeout(Order.findById(orderId), 8000);
  if (!order) {
    res.status(404);
    throw new Error(getMessage(req.lang, 'order.notFound'));
  }

  if (!order.ghnOrderCode) {
    res.status(400);
    throw new Error(getMessage(req.lang, 'shipment.notFound'));
  }

  // Get provider
  const provider = await withTimeout(
    ShippingProvider.getByCode(order.shippingProvider),
    8000
  );
  if (!provider) {
    res.status(404);
    throw new Error(getMessage(req.lang, 'shipment.invalidProvider'));
  }

  try {
    let adapter;
    if (order.shippingProvider === 'ghn') {
      adapter = new GHNAdapter(provider);
    } else {
      res.status(400);
      throw new Error(getMessage(req.lang, 'shipment.unsupportedCarrier'));
    }

    const tokenResult = await adapter.getPrintToken([order.ghnOrderCode]);
    if (!tokenResult.success) {
      res.status(400);
      throw new Error(tokenResult.error);
    }

    // Save token and URL to order
    order.printLabelToken = tokenResult.data.token;
    order.printLabelUrl = `https://dev-online-gateway.ghn.vn/a5/public-api/printA5?token=${tokenResult.data.token}`;
    
    await order.save();

    res.json({
      success: true,
      printLabel: {
        token: tokenResult.data.token,
        url: order.printLabelUrl,
      },
    });
  } catch (error) {
    res.status(500);
    throw error;
  }
});

/**
 * Hủy vận đơn (soft cancel)
 * @route DELETE /api/shipments/:orderId
 * @access Private
 */
const cancelShipment = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await withTimeout(Order.findById(orderId), 8000);
  if (!order) {
    res.status(404);
    throw new Error(getMessage(req.lang, 'order.notFound'));
  }

  if (!order.ghnOrderCode) {
    res.status(400);
    throw new Error(getMessage(req.lang, 'shipment.notFound'));
  }

  if (order.shipmentStatus === 'delivered' || order.shipmentStatus === 'cancelled') {
    res.status(400);
    throw new Error(getMessage(req.lang, 'shipment.invalidStatus').replace('{status}', order.shipmentStatus));
  }

  // TODO: Implement GHN cancel shipment API
  // For now, just update status locally
  order.shipmentStatus = 'cancelled';
  await order.save();

  res.json({
    success: true,
    message: getMessage(req.lang, 'shipment.cancelSuccess'),
    shipment: {
      orderId: order._id,
      status: order.shipmentStatus,
    },
  });
});

module.exports = {
  createShipment,
  getShipmentInfo,
  getPrintLabel,
  cancelShipment,
};
