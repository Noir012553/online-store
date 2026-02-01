import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/context/AuthContext';
import { orderAPI } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ChevronRight, Package, Wallet, Calendar, AlertCircle, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { onPaymentSuccess, onOrderUpdated, offEvent } from '../lib/socket';

interface OrderItem {
  _id: string;
  product: string;
  name: string;
  qty: number;
  image: string;
  price: number;
}

interface Order {
  _id: string;
  orderItems: OrderItem[];
  itemsPrice: number;
  taxPrice: number;
  shippingFee: number;
  totalPrice: number;
  isPaid: boolean;
  paidAt?: string;
  paymentMethod?: string;
  isDelivered: boolean;
  deliveredAt?: string;
  shippingProvider?: string;
  shippingService?: string;
  createdAt: string;
  updatedAt: string;
}

const getDeliveryStatusBadgeColor = (isDelivered: boolean) => {
  if (isDelivered) return 'bg-green-100 text-green-800';
  return 'bg-blue-100 text-blue-800';
};

const getDeliveryStatusText = (isDelivered: boolean) => {
  if (isDelivered) return 'Đã giao';
  return 'Đang giao';
};

const getPaymentStatusBadgeColor = (isPaid: boolean) => {
  if (isPaid) return 'bg-green-100 text-green-800';
  return 'bg-orange-100 text-orange-800';
};

const getPaymentStatusText = (isPaid: boolean, paymentMethod?: string) => {
  if (isPaid) return 'Đã thanh toán';
  if (paymentMethod === 'cod') return 'Chưa thanh toán (COD)';
  return 'Chưa thanh toán';
};

const getPaymentMethodLabel = (method?: string) => {
  switch (method) {
    case 'cod':
      return 'Thanh toán khi nhận hàng (COD)';
    case 'vnpay':
      return 'Thanh toán qua VNPAY';
    case 'card':
      return 'Thanh toán bằng thẻ';
    default:
      return 'Chưa xác định';
  }
};

export default function MyOrders() {
  const router = useRouter();
  const { user } = useAuth();
  const { newOrder } = router.query;
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(newOrder as string || null);

  const fetchOrders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await orderAPI.getMyOrders();
      const orderList = Array.isArray(data) ? data : data?.data || data?.orders || [];
      setOrders(orderList.sort((a: Order, b: Order) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Không thể tải danh sách đơn hàng';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    fetchOrders();
  }, [user, router]);

  // Socket.io realtime updates for user orders
  useEffect(() => {
    // Listen for payment success events
    const handlePaymentSuccess = (data: any) => {
      // Auto-refresh orders when payment succeeds
      fetchOrders();
      toast.success(`Đơn hàng vừa được thanh toán!`);
    };

    // Listen for order update events
    const handleOrderUpdated = (data: any) => {
      // Auto-refresh orders when order is updated
      fetchOrders();
    };

    onPaymentSuccess(handlePaymentSuccess);
    onOrderUpdated(handleOrderUpdated);

    // Cleanup on unmount
    return () => {
      offEvent('payment-success');
      offEvent('order-updated');
    };
  }, []);

  // Auto-refresh when page regains focus
  useEffect(() => {
    const handleFocus = () => {
      fetchOrders();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  if (!user) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 animate-in fade-in duration-300">
      <div className="container mx-auto px-4">
        <Breadcrumbs
          links={[
            { label: 'Trang chủ', href: '/' },
            { label: 'Đơn hàng của tôi' },
          ]}
        />

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Đơn hàng của tôi</h1>
          <p className="text-gray-600">
            {orders.length > 0
              ? `Bạn có ${orders.length} đơn hàng`
              : 'Bạn chưa có đơn hàng nào'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">Lỗi</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        {orders.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
            <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Chưa có đơn hàng</h2>
            <p className="text-gray-600 mb-6">Bạn chưa tạo đơn hàng nào. Hãy bắt đầu mua sắm ngay!</p>
            <Button
              onClick={() => router.push('/')}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2 h-10"
            >
              Tiếp tục mua hàng
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order._id}
                className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                {/* Order Header */}
                <div
                  className="p-4 sm:p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() =>
                    setExpandedOrderId(expandedOrderId === order._id ? null : order._id)
                  }
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <h3 className="font-semibold text-gray-900 text-lg">
                          Đơn hàng #{order._id.slice(-8).toUpperCase()}
                        </h3>
                        <Badge className={getDeliveryStatusBadgeColor(order.isDelivered)}>
                          {getDeliveryStatusText(order.isDelivered)}
                        </Badge>
                        <Badge className={getPaymentStatusBadgeColor(order.isPaid)}>
                          {getPaymentStatusText(order.isPaid, order.paymentMethod)}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-4 h-4 shrink-0" />
                          <span>{formatDate(new Date(order.createdAt))}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Wallet className="w-4 h-4 shrink-0" />
                          <span className="font-semibold text-red-600">{formatCurrency(order.totalPrice)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Package className="w-4 h-4 shrink-0" />
                          <span>{order.orderItems.reduce((sum, item) => sum + item.qty, 0)} sản phẩm</span>
                        </div>
                      </div>
                    </div>

                    <ChevronRight
                      className={`w-6 h-6 text-gray-400 shrink-0 transition-transform ${
                        expandedOrderId === order._id ? 'rotate-90' : ''
                      }`}
                    />
                  </div>
                </div>

                {/* Order Details (Expanded) */}
                {expandedOrderId === order._id && (
                  <div className="border-t border-gray-200 p-4 sm:p-6 bg-gray-50 space-y-6">
                    {/* Order Items */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Sản phẩm</h4>
                      <div className="space-y-2">
                        {order.orderItems.map((item, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-3 p-3 bg-white rounded border border-gray-200"
                          >
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-12 h-12 object-cover rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 line-clamp-2">{item.name}</p>
                              <p className="text-sm text-gray-600">Số lượng: {item.qty}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-semibold text-red-600">
                                {formatCurrency(item.price * item.qty)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pricing Details */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Chi tiết giá</h4>
                      <div className="bg-white rounded border border-gray-200 overflow-hidden">
                        <div className="divide-y divide-gray-200">
                          <div className="flex justify-between p-3 text-sm">
                            <span className="text-gray-700">Tạm tính:</span>
                            <span className="font-medium text-gray-900">{formatCurrency(order.itemsPrice)}</span>
                          </div>
                          {(order.shippingFee || 0) > 0 && (
                            <div className="flex justify-between p-3 text-sm bg-blue-50">
                              <span className="text-gray-700">Phí vận chuyển:</span>
                              <span className="font-medium text-blue-600">{formatCurrency(order.shippingFee)}</span>
                            </div>
                          )}
                          {(order.taxPrice || 0) > 0 && (
                            <div className="flex justify-between p-3 text-sm">
                              <span className="text-gray-700">Thuế:</span>
                              <span className="font-medium text-gray-900">{formatCurrency(order.taxPrice)}</span>
                            </div>
                          )}
                          <div className="flex justify-between p-3 font-semibold bg-linear-to-r from-red-50 to-orange-50">
                            <span className="text-gray-900">Tổng cộng:</span>
                            <span className="text-red-600 text-lg">{formatCurrency(order.totalPrice)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Payment & Shipping Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Payment Info */}
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2 text-sm">Thông tin thanh toán</h4>
                        <div className="bg-white rounded border border-gray-200 p-3 space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Phương thức:</span>
                            <span className="font-medium text-gray-900">{getPaymentMethodLabel(order.paymentMethod)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Trạng thái:</span>
                            <Badge className={getPaymentStatusBadgeColor(order.isPaid)}>
                              {getPaymentStatusText(order.isPaid, order.paymentMethod)}
                            </Badge>
                          </div>
                          {order.isPaid && order.paidAt && (
                            <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                              <span className="text-gray-600">Thanh toán lúc:</span>
                              <span className="text-xs text-gray-600">{formatDate(new Date(order.paidAt))}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Shipping Info */}
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2 text-sm">Thông tin vận chuyển</h4>
                        <div className="bg-white rounded border border-gray-200 p-3 space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Nhà vận chuyển:</span>
                            <span className="font-medium text-gray-900">{order.shippingProvider ? order.shippingProvider.toUpperCase() : 'Chưa xác định'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Trạng thái:</span>
                            <Badge className={getDeliveryStatusBadgeColor(order.isDelivered)}>
                              {getDeliveryStatusText(order.isDelivered)}
                            </Badge>
                          </div>
                          {order.isDelivered && order.deliveredAt && (
                            <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                              <span className="text-gray-600">Giao vào:</span>
                              <span className="text-xs text-gray-600">{formatDate(new Date(order.deliveredAt))}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                      <Button
                        onClick={() => router.push(`/orders/${order._id}`)}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 h-10"
                      >
                        Xem chi tiết
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
