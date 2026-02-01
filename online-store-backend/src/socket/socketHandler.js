/**
 * Socket.io Event Handlers
 * Quản lý WebSocket connections và events cho real-time updates
 */

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    const connectionTime = new Date().toISOString().replace('T', ' ');
    const clientIP = socket.handshake.address;

    console.log(`✅ User connected: ${socket.id}`);
    console.log(`   📍 IP: ${clientIP}`);
    console.log(`   🕐 Time: ${connectionTime}`);

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

      // Update user info từ data nếu có
      if (data?.userId) {
        socket.userData.userId = data.userId;
        socket.userData.role = data.role || 'admin';
      }

      console.log(`✅ Admin joined: ${socket.id}`);
      if (socket.userData.userId) {
        console.log(`   👤 User: ${socket.userData.userId}`);
        console.log(`   🔐 Role: ${socket.userData.role}`);
      }
    });

    // Leave admin room
    socket.on('leave-admin', () => {
      socket.leave('admin-room');
      console.log(`❌ Admin left: ${socket.id}`);
    });

    // Disconnect - bắt được disconnect reason
    socket.on('disconnect', (reason) => {
      const now = new Date();
      const disconnectTime = now.toISOString().replace('T', ' ');
      const connectionStart = new Date(socket.userData.connectedAt);
      const connectionDuration = now - connectionStart;
      const durationSeconds = Math.round(connectionDuration / 1000);

      console.log(`❌ User disconnected: ${socket.id}`);
      console.log(`   ⏱️  Duration: ${durationSeconds}s`);
      console.log(`   📤 Reason: ${reason}`);

      // Log chi tiết nếu có user info
      if (socket.userData.userId) {
        console.log(`   👤 User: ${socket.userData.userId}`);
        console.log(`   🔐 Role: ${socket.userData.role}`);
      }

      // Các disconnect reason phổ biến:
      // - "transport close": Client đóng tab/chuyển trang
      // - "server namespace disconnect": Server chủ động ngắt
      // - "ping timeout": Mất mạng hoặc client bị treo
      // - "client namespace disconnect": Client gọi socket.disconnect()
      if (reason === 'ping timeout') {
        console.warn(`   ⚠️  [PING_TIMEOUT] Có thể mất kết nối mạng hoặc client bị treo`);
      }
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

module.exports = {
  socketHandler,
  broadcastNewOrder,
  broadcastPaymentSuccess,
  broadcastOrderStatusUpdate,
};
