/**
 * Socket.io Event Handlers
 * Quản lý WebSocket connections và events cho real-time updates
 */

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    // Join admin room (để broadcast order updates cho tất cả admin)
    socket.on('join-admin', (data) => {
      socket.join('admin-room');
      console.log(`✅ Admin joined: ${socket.id}`);
    });

    // Leave admin room
    socket.on('leave-admin', () => {
      socket.leave('admin-room');
      console.log(`❌ Admin left: ${socket.id}`);
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.id}`);
    });
  });
};

/**
 * Broadcast events
 */
const broadcastNewOrder = (io, orderData) => {
  io.to('admin-room').emit('order-created', {
    type: 'order-created',
    data: orderData,
    timestamp: new Date(),
  });
};

const broadcastPaymentSuccess = (io, paymentData) => {
  io.to('admin-room').emit('payment-success', {
    type: 'payment-success',
    data: paymentData,
    timestamp: new Date(),
  });
};

const broadcastOrderStatusUpdate = (io, orderData) => {
  io.to('admin-room').emit('order-updated', {
    type: 'order-updated',
    data: orderData,
    timestamp: new Date(),
  });
};

module.exports = {
  socketHandler,
  broadcastNewOrder,
  broadcastPaymentSuccess,
  broadcastOrderStatusUpdate,
};
