const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');

const HOLD_DURATION_MS = 30 * 60 * 1000;
const EXPIRY_POLL_INTERVAL_MS = 60 * 1000;
const EXPIRY_BATCH_SIZE = 100;
let expiryTimer = null;
let isProcessingExpiredReservations = false;

const createInventoryError = (code) => {
  const error = new Error(code);
  error.errorCode = code;
  error.statusCode = code === 'ORDER_INSUFFICIENT_STOCK' ? 400 : 503;
  return error;
};

const reserveOrderInventory = async (order, products, shouldExpire) => {
  const session = await mongoose.startSession();
  const orderData = order.toObject();
  let reservedOrder;
  try {
    await session.withTransaction(async () => {
      for (const { product, quantity } of products) {
        const result = await Product.updateOne(
          { _id: product._id, isDeleted: false, countInStock: { $gte: quantity } },
          { $inc: { countInStock: -quantity } },
          { session },
        );
        if (!result.matchedCount) throw createInventoryError('ORDER_INSUFFICIENT_STOCK');
      }

      orderData.inventoryStatus = shouldExpire ? 'reserved' : 'committed';
      orderData.inventoryHoldExpiresAt = shouldExpire ? new Date(Date.now() + HOLD_DURATION_MS) : null;
      [reservedOrder] = await Order.create([orderData], { session });
    });
    return reservedOrder;
  } finally {
    await session.endSession();
  }
};

const releaseReservedOrderInventory = async (orderId, expiredBefore = null) => {
  const session = await mongoose.startSession();
  try {
    let releasedOrder = null;
    await session.withTransaction(async () => {
      const filter = { _id: orderId, inventoryStatus: 'reserved' };
      if (expiredBefore) filter.inventoryHoldExpiresAt = { $lte: expiredBefore };

      releasedOrder = await Order.findOneAndUpdate(
        filter,
        {
          $set: {
            inventoryStatus: 'released',
            inventoryHoldExpiresAt: null,
            inventoryReleasedAt: new Date(),
          },
        },
        { returnDocument: 'after', session },
      );
      if (!releasedOrder) return;

      for (const item of releasedOrder.orderItems) {
        await Product.updateOne(
          { _id: item.product },
          { $inc: { countInStock: item.qty } },
          { session },
        );
      }
    });
    return releasedOrder;
  } finally {
    await session.endSession();
  }
};

const markOrderPaid = async (orderId, paymentMethod) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw createInventoryError('PAYMENT_ORDER_NOT_FOUND');
      if (order.isPaid) {
        result = { order, needsReview: order.inventoryStatus === 'needs_review' };
        return;
      }

      if (order.inventoryStatus === 'released') {
        order.inventoryStatus = 'needs_review';
        order.inventoryHoldExpiresAt = null;
      } else if (order.inventoryStatus === 'reserved') {
        order.inventoryStatus = 'committed';
        order.inventoryHoldExpiresAt = null;
      }
      order.isPaid = true;
      order.paidAt = new Date();
      order.paymentMethod = paymentMethod;
      await order.save({ session });
      result = { order, needsReview: order.inventoryStatus === 'needs_review' };
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const processExpiredReservations = async () => {
  if (mongoose.connection.readyState !== 1 || isProcessingExpiredReservations) return;
  isProcessingExpiredReservations = true;
  try {
    const expiredOrders = await Order.find({
      inventoryStatus: 'reserved',
      inventoryHoldExpiresAt: { $lte: new Date() },
    }).select('_id').limit(EXPIRY_BATCH_SIZE).lean();

    for (const order of expiredOrders) {
      await releaseReservedOrderInventory(order._id, new Date());
    }
  } finally {
    isProcessingExpiredReservations = false;
  }
};

const startInventoryReservationWorker = () => {
  if (expiryTimer) return;
  processExpiredReservations().catch(error => console.error('[INVENTORY_WORKER]', error));
  expiryTimer = setInterval(() => {
    processExpiredReservations().catch(error => console.error('[INVENTORY_WORKER]', error));
  }, EXPIRY_POLL_INTERVAL_MS);
};

module.exports = {
  HOLD_DURATION_MS,
  markOrderPaid,
  processExpiredReservations,
  releaseReservedOrderInventory,
  reserveOrderInventory,
  startInventoryReservationWorker,
};
