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

  // Determine the WebSocket URL based on current environment
  // In production: connect directly to secure backend via WSS
  // In development: connect to localhost backend
  let socketURL = 'http://localhost:5000';

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const host = window.location.host;

    // Production environment (detected by https protocol or manln.online domain)
    if (protocol === 'https:' && host.includes('manln.online')) {
      socketURL = 'https://backend.manln.online';
    } else if (protocol === 'https:') {
      // Other HTTPS environments
      socketURL = 'https://backend.manln.online';
    }
    // For localhost development, use http://localhost:5000 (default)
  }

  socket = io(socketURL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    transports: ['websocket', 'polling'],
    credentials: true,
  });

  socket.on('connect', () => {
    // Connected
  });

  socket.on('disconnect', (reason) => {
    // Disconnected
  });

  socket.on('connect_error', (error: any) => {
    // Connection error
  });

  socket.on('error', (error: any) => {
    // Error
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
 * Gửi user info để backend có thể tracking admin nào đang online
 *
 * @param userData Optional user data { userId, role } để tracking
 * @example
 * joinAdminRoom({ userId: 'user123', role: 'admin' });
 */
export const joinAdminRoom = (userData?: { userId: string; role?: string }) => {
  const s = getSocket();
  if (s) {
    s.emit('join-admin', userData || {});
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
