/**
 * Socket.io Event Handlers
 * Quản lý WebSocket connections và events cho real-time updates
 */

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    const connectionTime = new Date().toISOString().replace('T', ' ');
    const clientIP = socket.handshake.address;


    // Lưu user info vào socket metadata (để track sau này)
    socket.userData = {
      socketId: socket.id,
      connectedAt: connectionTime,
      clientIP: clientIP,
      userId: null, // Sẽ được set khi user join-admin
      role: null,
    };

    // Join admin room (để broadcast order updates cho tất cả admin)
    socket.on('join-admin', (data) => {
      socket.join('admin-room');

      const adminInfo = {
        socketId: socket.id,
        userId: data?.userId || 'unknown',
        role: data?.role || 'admin',
        clientIP: clientIP,
      };

      // Update user info từ data nếu có
      if (data?.userId) {
        socket.userData.userId = data.userId;
        socket.userData.role = data.role || 'admin';
      }

    });

    // Leave admin room
    socket.on('leave-admin', () => {
      socket.leave('admin-room');
    });

    // Disconnect - bắt được disconnect reason
    socket.on('disconnect', (reason) => {
      const now = new Date();
      const disconnectTime = now.toISOString().replace('T', ' ');
      const connectionStart = new Date(socket.userData.connectedAt);
      const connectionDuration = now - connectionStart;
      const durationSeconds = Math.round(connectionDuration / 1000);

      // Disconnect handler - log removed for production
    });
  });
};

/**
 * Broadcast events
 */
const broadcastNewOrder = (io, orderData) => {

  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('order-created', {
    type: 'order-created',
    data: orderData,
    timestamp: new Date(),
  });

  // Also broadcast to all users for real-time updates (e.g., my-orders page)
  io.emit('order-created', {
    type: 'order-created',
    data: orderData,
    timestamp: new Date(),
  });
};

const broadcastPaymentSuccess = (io, paymentData) => {

  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('payment-success', {
    type: 'payment-success',
    data: paymentData,
    timestamp: new Date(),
  });

  // Also broadcast to all users for real-time updates (e.g., my-orders page)
  io.emit('payment-success', {
    type: 'payment-success',
    data: paymentData,
    timestamp: new Date(),
  });
};

const broadcastOrderStatusUpdate = (io, orderData) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('order-updated', {
    type: 'order-updated',
    data: orderData,
    timestamp: new Date(),
  });

  // Also broadcast to all users for real-time updates (e.g., my-orders page)
  io.emit('order-updated', {
    type: 'order-updated',
    data: orderData,
    timestamp: new Date(),
  });
};

/**
 * Broadcast new customer created event
 */
const broadcastNewCustomer = (io, customerData) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('customer-created', {
    type: 'customer-created',
    data: customerData,
    timestamp: new Date(),
  });
};

/**
 * Broadcast customer updated event
 */
const broadcastCustomerUpdated = (io, customerData) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('customer-updated', {
    type: 'customer-updated',
    data: customerData,
    timestamp: new Date(),
  });
};

/**
 * Broadcast new product created event
 */
const broadcastNewProduct = (io, productData) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('product-created', {
    type: 'product-created',
    data: productData,
    timestamp: new Date(),
  });
};

/**
 * Broadcast product updated event
 */
const broadcastProductUpdated = (io, productData) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('product-updated', {
    type: 'product-updated',
    data: productData,
    timestamp: new Date(),
  });
};

/**
 * Broadcast customer deleted event (soft delete)
 */
const broadcastCustomerDeleted = (io, customerId) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('customer-deleted', {
    type: 'customer-deleted',
    customerId,
    timestamp: new Date(),
  });
};

/**
 * Broadcast customer restored event
 */
const broadcastCustomerRestored = (io, customerData) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('customer-restored', {
    type: 'customer-restored',
    data: customerData,
    timestamp: new Date(),
  });
};

/**
 * Broadcast coupon created event
 */
const broadcastCouponCreated = (io, couponData) => {
  io.to('admin-room').emit('coupon-created', {
    type: 'coupon-created',
    data: couponData,
    timestamp: new Date(),
  });
};

const broadcastBannerCreated = (io, bannerData) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('banner-created', {
    type: 'banner-created',
    data: bannerData,
    timestamp: new Date(),
  });

  // Also broadcast to all clients for real-time updates (e.g., homepage carousel)
  io.emit('banner-created', {
    type: 'banner-created',
    data: bannerData,
    timestamp: new Date(),
  });
};

/**
 * Broadcast coupon updated event
 */
const broadcastCouponUpdated = (io, couponData) => {
  io.to('admin-room').emit('coupon-updated', {
    type: 'coupon-updated',
    data: couponData,
    timestamp: new Date(),
  });
};

/**
 * Broadcast coupon deleted event
 */
const broadcastCouponDeleted = (io, couponId) => {
  io.to('admin-room').emit('coupon-deleted', {
    type: 'coupon-deleted',
    couponId,
    timestamp: new Date(),
  });
};

/**
 * Broadcast coupon restored event
 */
const broadcastCouponRestored = (io, couponData) => {
  io.to('admin-room').emit('coupon-restored', {
    type: 'coupon-restored',
    data: couponData,
    timestamp: new Date(),
  });
};

const broadcastBannerUpdated = (io, bannerData) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('banner-updated', {
    type: 'banner-updated',
    data: bannerData,
    timestamp: new Date(),
  });

  // Also broadcast to all clients for real-time updates (e.g., homepage carousel)
  io.emit('banner-updated', {
    type: 'banner-updated',
    data: bannerData,
    timestamp: new Date(),
  });
};

/**
 * Broadcast product deleted event (soft delete)
 */
const broadcastProductDeleted = (io, productId) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('product-deleted', {
    type: 'product-deleted',
    productId,
    timestamp: new Date(),
  });
};

const broadcastBannerDeleted = (io, bannerId) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('banner-deleted', {
    type: 'banner-deleted',
    bannerId,
    timestamp: new Date(),
  });

  // Also broadcast to all clients for real-time updates (e.g., homepage carousel)
  io.emit('banner-deleted', {
    type: 'banner-deleted',
    bannerId,
    timestamp: new Date(),
  });
};

/**
 * Broadcast product restored event
 */
const broadcastProductRestored = (io, productData) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('product-restored', {
    type: 'product-restored',
    data: productData,
    timestamp: new Date(),
  });
};

/**
 * Broadcast order deleted event (soft delete)
 */
const broadcastOrderDeleted = (io, orderId) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('order-deleted', {
    type: 'order-deleted',
    orderId,
    timestamp: new Date(),
  });
};

/**
 * Broadcast order restored event
 */
const broadcastOrderRestored = (io, orderData) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('order-restored', {
    type: 'order-restored',
    data: orderData,
    timestamp: new Date(),
  });
};

const broadcastBannerRestored = (io, bannerData) => {
  // Broadcast to admin room for admin dashboard
  io.to('admin-room').emit('banner-restored', {
    type: 'banner-restored',
    data: bannerData,
    timestamp: new Date(),
  });

  // Also broadcast to all clients for real-time updates (e.g., homepage carousel)
  io.emit('banner-restored', {
    type: 'banner-restored',
    data: bannerData,
    timestamp: new Date(),
  });
};

module.exports = {
  socketHandler,
  broadcastNewOrder,
  broadcastPaymentSuccess,
  broadcastOrderStatusUpdate,
  broadcastNewCustomer,
  broadcastCustomerUpdated,
  broadcastCustomerDeleted,
  broadcastCustomerRestored,
  broadcastCouponCreated,
  broadcastBannerCreated,
  broadcastCouponUpdated,
  broadcastBannerUpdated,
  broadcastCouponDeleted,
  broadcastBannerDeleted,
  broadcastCouponRestored,
  broadcastBannerRestored,
  broadcastNewProduct,
  broadcastProductUpdated,
  broadcastProductDeleted,
  broadcastProductRestored,
  broadcastOrderDeleted,
  broadcastOrderRestored,
};
