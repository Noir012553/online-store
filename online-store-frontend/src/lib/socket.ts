import io, { Socket } from 'socket.io-client';
import { BACKEND_URL } from '../config';

let socket: Socket | null = null;
let isConnecting = false;

// Store callbacks for each event - Map<eventName, Set<callback>>
// This allows us to manage listeners and prevent duplicates
const eventCallbacks = new Map<string, Set<Function>>();

// Events that have been attached to socket (to prevent re-attaching)
const attachedEvents = new Set<string>();

const getSocketURL = (): string =>
  process.env.NEXT_PUBLIC_SOCKET_URL?.trim() || BACKEND_URL;

/**
 * Initialize Socket.io connection
 */
export const initSocket = (): Socket => {
  // If socket exists and is connected or currently connecting, return it
  if (socket && (socket.connected || isConnecting)) {
    return socket;
  }

  const socketURL = getSocketURL();

  isConnecting = true;

  socket = io(socketURL, {
    // Socket.io configuration for cross-origin connection to backend
    // Use both websocket and polling for better compatibility with Cloudflare Tunnel
    transports: ['websocket', 'polling'],

    // Reconnection settings
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,

    // Default path for Socket.io
    path: '/socket.io/',

    // Additional options for reliability
    autoConnect: true,
    forceNew: false,
  });

  socket.on('connect', () => {
    isConnecting = false;
    // Connection successful - Socket.io auto-reconnects on failures
  });

  socket.on('disconnect', (reason) => {
    // Auto reconnect is handled by socket.io
  });

  socket.on('connect_error', (error: any) => {
    // Connection error - socket.io handles auto-reconnect
  });

  socket.on('error', (error: any) => {
    // Socket error - socket.io handles auto-reconnect
  });

  return socket;
};

/**
 * Get current socket instance
 */
export const getSocket = (): Socket | null => {
  if (!socket) {
    return initSocket();
  }
  return socket;
};

/**
 * Attach socket listener for an event
 * This is called ONCE per event to set up the socket.on() handler
 * The handler will then call all registered callbacks for that event
 */
const attachSocketListener = (eventName: string) => {
  if (attachedEvents.has(eventName)) {
    return; // Already attached
  }

  const s = getSocket();
  if (!s) {
    return;
  }

  // Attach ONCE to socket
  s.on(eventName, (data) => {
    // Call all registered callbacks for this event
    const callbacks = eventCallbacks.get(eventName);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error(`[Socket] Error in callback for event "${eventName}":`, error);
          }
        }
      });
    }
  });

  attachedEvents.add(eventName);
};

/**
 * Register a callback for an event
 * @param eventName Event name
 * @param callback Callback function
 */
const addEventCallback = (eventName: string, callback: Function) => {
  if (!eventCallbacks.has(eventName)) {
    eventCallbacks.set(eventName, new Set());
  }

  const callbacks = eventCallbacks.get(eventName)!;

  if (!callbacks.has(callback)) {
    callbacks.add(callback);
  }

  attachSocketListener(eventName);

  return () => removeEventCallback(eventName, callback);
};

/**
 * Remove a callback for an event
 * @param eventName Event name
 * @param callback Callback function (if null, removes all)
 */
const removeEventCallback = (eventName: string, callback?: Function) => {
  if (!eventCallbacks.has(eventName)) {
    return;
  }

  const callbacks = eventCallbacks.get(eventName)!;

  if (callback) {
    callbacks.delete(callback);
  } else {
    callbacks.clear();
  }

  // If no more callbacks for this event, detach socket listener and mark as unattached
  if (callbacks.size === 0 && socket && attachedEvents.has(eventName)) {
    socket.off(eventName);
    attachedEvents.delete(eventName);
  }
};

/**
 * Join admin room
 */
export const joinAdminRoom = (userData?: { userId: string; role?: string }) => {
  const s = getSocket();
  if (s) {
    if (s.connected) {
      s.emit('join-admin', userData || {});
    } else {
      // Wait for connection before joining
      s.once('connect', () => {
        s.emit('join-admin', userData || {});
      });
    }
  }
};

/**
 * Leave admin room
 */
export const leaveAdminRoom = () => {
  const s = getSocket();
  if (s && s.connected) {
    s.emit('leave-admin');
  }
};

export interface PaymentSuccessEvent {
  type: 'payment-success';
  data: {
    orderId: string;
    isPaid: boolean;
    createdAt: string;
  };
  timestamp: string;
}

/**
 * Subscribe to payment success events
 */
export const onPaymentSuccess = (callback: (data: PaymentSuccessEvent) => void) =>
  addEventCallback('payment-success', callback);

/**
 * Subscribe to order updated events
 */
export const onOrderUpdated = (callback: (data: any) => void) =>
  addEventCallback('order-updated', callback);

/**
 * Subscribe to order created events
 */
export const onOrderCreated = (callback: (data: any) => void) => {
  addEventCallback('order-created', callback);
};

/**
 * Subscribe to customer created events
 */
export const onCustomerCreated = (callback: (data: any) => void) => {
  addEventCallback('customer-created', callback);
};

/**
 * Subscribe to customer updated events
 */
export const onCustomerUpdated = (callback: (data: any) => void) => {
  addEventCallback('customer-updated', callback);
};

/**
 * Subscribe to product created events
 */
export const onProductCreated = (callback: (data: any) => void) => {
  addEventCallback('product-created', callback);
};

/**
 * Subscribe to product updated events
 */
export const onProductUpdated = (callback: (data: any) => void) => {
  addEventCallback('product-updated', callback);
};

/**
 * Subscribe to customer deleted events
 */
export const onCustomerDeleted = (callback: (data: any) => void) => {
  addEventCallback('customer-deleted', callback);
};

/**
 * Subscribe to customer restored events
 */
export const onCustomerRestored = (callback: (data: any) => void) => {
  addEventCallback('customer-restored', callback);
};

/**
 * Subscribe to product deleted events
 */
export const onProductDeleted = (callback: (data: any) => void) => {
  addEventCallback('product-deleted', callback);
};

/**
 * Subscribe to product restored events
 */
export const onProductRestored = (callback: (data: any) => void) => {
  addEventCallback('product-restored', callback);
};

/**
 * Subscribe to order deleted events
 */
export const onOrderDeleted = (callback: (data: any) => void) => {
  addEventCallback('order-deleted', callback);
};

/**
 * Subscribe to order restored events
 */
export const onOrderRestored = (callback: (data: any) => void) => {
  addEventCallback('order-restored', callback);
};

/**
 * Subscribe to coupon created events
 */
export const onCouponCreated = (callback: (data: any) => void) => {
  addEventCallback('coupon-created', callback);
};

/**
 * Subscribe to banner created events
 */
export const onBannerCreated = (callback: (data: any) => void) => {
  addEventCallback('banner-created', callback);
};

/**
 * Subscribe to coupon updated events
 */
export const onCouponUpdated = (callback: (data: any) => void) => {
  addEventCallback('coupon-updated', callback);
};

/**
 * Subscribe to banner updated events
 */
export const onBannerUpdated = (callback: (data: any) => void) => {
  addEventCallback('banner-updated', callback);
};

/**
 * Subscribe to coupon deleted events
 */
export const onCouponDeleted = (callback: (data: any) => void) => {
  addEventCallback('coupon-deleted', callback);
};

/**
 * Subscribe to banner deleted events
 */
export const onBannerDeleted = (callback: (data: any) => void) => {
  addEventCallback('banner-deleted', callback);
};

/**
 * Subscribe to coupon restored events
 */
export const onCouponRestored = (callback: (data: any) => void) => {
  addEventCallback('coupon-restored', callback);
};

/**
 * Subscribe to banner restored events
 */
export const onBannerRestored = (callback: (data: any) => void) => {
  addEventCallback('banner-restored', callback);
};

/**
 * Unsubscribe from an event
 * Removes ALL callbacks for that event
 */
export const offEvent = (eventName: string, callback?: Function) => {
  removeEventCallback(eventName, callback);
};

/**
 * Disconnect socket
 */
export const disconnectSocket = () => {
  if (socket?.connected) {
    socket.disconnect();
  }
  socket = null;
  eventCallbacks.clear();
  attachedEvents.clear();
};
