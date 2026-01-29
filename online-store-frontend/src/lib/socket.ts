import io, { Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Initialize Socket.io connection
 * Kết nối tới server WebSocket
 */
export const initSocket = (): Socket => {
  if (socket?.connected) {
    return socket;
  }

  const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';
  
  socket = io(baseURL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('✅ Socket connected:', socket?.id);
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected');
  });

  socket.on('connect_error', (error: any) => {
    console.error('Socket connection error:', error);
  });

  return socket;
};

/**
 * Get current socket instance
 */
export const getSocket = (): Socket | null => {
  if (!socket?.connected) {
    return initSocket();
  }
  return socket;
};

/**
 * Join admin room (cho admin dashboard)
 */
export const joinAdminRoom = () => {
  const s = getSocket();
  if (s) {
    s.emit('join-admin');
  }
};

/**
 * Leave admin room
 */
export const leaveAdminRoom = () => {
  const s = getSocket();
  if (s) {
    s.emit('leave-admin');
  }
};

/**
 * Subscribe to payment success events
 * @param callback Function được gọi khi có thanh toán mới
 */
export const onPaymentSuccess = (callback: (data: any) => void) => {
  const s = getSocket();
  if (s) {
    s.on('payment-success', callback);
  }
};

/**
 * Subscribe to order updated events
 * @param callback Function được gọi khi order được cập nhật
 */
export const onOrderUpdated = (callback: (data: any) => void) => {
  const s = getSocket();
  if (s) {
    s.on('order-updated', callback);
  }
};

/**
 * Subscribe to order created events
 * @param callback Function được gọi khi order được tạo
 */
export const onOrderCreated = (callback: (data: any) => void) => {
  const s = getSocket();
  if (s) {
    s.on('order-created', callback);
  }
};

/**
 * Unsubscribe from an event
 */
export const offEvent = (eventName: string) => {
  const s = getSocket();
  if (s) {
    s.off(eventName);
  }
};

/**
 * Disconnect socket
 */
export const disconnectSocket = () => {
  if (socket?.connected) {
    socket.disconnect();
    socket = null;
  }
};
