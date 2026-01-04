/**
 * Shipping Service
 * Handles all shipping-related operations
 */

const ghnService = require('./ghnService');

class ShippingService {
  /**
   * Get shipping options with real GHN fees
   */
  static async getShippingOptionsWithFee(toDistrictId, toWardCode, weight = 1000) {
    try {
      const services = await ghnService.getAvailableServices(1442, toDistrictId);

      if (!services || services.length === 0) {
        console.warn('No available GHN services for district:', toDistrictId);
        return [];
      }

      const shippingOptions = [];

      for (const service of services) {
        const feeResult = await ghnService.calculateShippingFee({
          serviceId: service.service_id,
          toDistrictId,
          toWardCode,
          weight
        });

        if (feeResult.success) {
          const option = {
            id: `ghn_${service.service_id}`,
            name: this.mapServiceName(service.short_name),
            description: 'Giao hàng bằng GHN',
            basePrice: feeResult.fee,
            freeThreshold: null,
            carrier: 'GHN',
            logo: 'https://api.nhathuoclongchau.com.vn/master/product/2024/01/17/0f893f8f-c1f4-44af-9d76-eb9eac9f66fe.png',
            estimatedDays: this.estimateDays(service.service_type_id),
            icon: '📦',
            serviceId: service.service_id,
            ghnServiceId: service.service_id
          };

          shippingOptions.push(option);
        }
      }

      return shippingOptions;
    } catch (error) {
      console.error('getShippingOptionsWithFee error:', error.message);
      return [];
    }
  }

  /**
   * Create shipping order
   */
  static async createShippingOrder(orderData) {
    try {
      const {
        clientOrderCode,
        customerName,
        customerPhone,
        address,
        districtId,
        wardCode,
        weight = 1000,
        ghnServiceId = 0,
        codAmount = 0
      } = orderData;

      const paymentTypeId = codAmount > 0 ? 2 : 1; // 1: Shop trả, 2: Khách trả (COD)

      const shippingResult = await ghnService.createShippingOrder({
        clientOrderCode,
        toName: customerName,
        toPhone: customerPhone,
        toAddress: address,
        toDistrictId: districtId,
        toWardCode: wardCode,
        weight,
        serviceId: ghnServiceId,
        paymentTypeId,
        codAmount,
        note: ''
      });

      return shippingResult;
    } catch (error) {
      console.error('createShippingOrder error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Helper: Map GHN service names
   */
  static mapServiceName(shortName) {
    const mapping = {
      'Nhanh': 'Giao hàng nhanh',
      'Chuẩn': 'Giao hàng chuẩn',
      'Tiết kiệm': 'Giao hàng tiết kiệm'
    };
    return mapping[shortName] || `Giao hàng ${shortName}`;
  }

  /**
   * Helper: Estimate delivery days based on service type
   */
  static estimateDays(serviceTypeId) {
    const mapping = {
      1: '24 giờ',
      2: '2-3 ngày',
      3: '3-5 ngày',
      0: 'Không xác định'
    };
    return mapping[serviceTypeId] || '1-3 ngày';
  }
}

module.exports = ShippingService;
