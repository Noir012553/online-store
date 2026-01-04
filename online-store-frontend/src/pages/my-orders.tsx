import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/context/AuthContext';
import { orderAPI } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ChevronRight, Package, MapPin, DollarSign, Calendar, AlertCircle, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';

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
  shippingAddress: {
    address: string;
    city: string;
    postalCode: string;
    country: string;
  };
  paymentMethod: string;
  itemsPrice: number;
  shippingPrice: number;
  taxPrice: number;
  totalPrice: number;
  isPaid: boolean;
  isDelivered: boolean;
  paidAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

const getStatusBadgeColor = (isPaid: boolean, isDelivered: boolean) => {
  if (isDelivered) return 'bg-green-100 text-green-800';
  if (isPaid) return 'bg-blue-100 text-blue-800';
  return 'bg-orange-100 text-orange-800';
};

const getStatusText = (isPaid: boolean, isDelivered: boolean) => {
  if (isDelivered) return 'Đã giao';
  if (isPaid) return 'Đã thanh toán';
  return 'Chờ thanh toán';
};

const getPaymentMethodName = (method: string) => {
  const methodMap: Record<string, string> = {
    cod: 'Thanh toán khi nhận hàng',
    vnpay: 'Thanh toán VNPay',
    bank: 'Chuyển khoản ngân hàng',
    card: 'Thanh toán bằng thẻ',
    momo: 'Ví MoMo',
    zalopay: 'ZaloPay',
  };
  return methodMap[method] || method;
};

export default function MyOrders() {
  const router = useRouter();
  const { user } = useAuth();
  const { newOrder } = router.query;
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(newOrder as string || null);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

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

    fetchOrders();
  }, [user, router]);

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
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
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
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-gray-900 text-lg">
                          Đơn hàng #{order._id.slice(-8).toUpperCase()}
                        </h3>
                        <Badge className={getStatusBadgeColor(order.isPaid, order.isDelivered)}>
                          {getStatusText(order.isPaid, order.isDelivered)}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
                        <div className="flex items-center gap-2 text-gray-600 text-sm">
                          <Calendar className="w-4 h-4" />
                          {formatDate(order.createdAt)}
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 text-sm">
                          <DollarSign className="w-4 h-4" />
                          {formatCurrency(order.totalPrice)}
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 text-sm">
                          <Package className="w-4 h-4" />
                          {order.orderItems.reduce((sum, item) => sum + item.qty, 0)} sản phẩm
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 text-sm">
                          <MapPin className="w-4 h-4" />
                          {order.shippingAddress.city}
                        </div>
                      </div>
                    </div>

                    <ChevronRight
                      className={`w-6 h-6 text-gray-400 flex-shrink-0 transition-transform ${
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
                            <div className="text-right flex-shrink-0">
                              <p className="font-semibold text-red-600">
                                {formatCurrency(item.price * item.qty)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Shipping Address */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Địa chỉ giao hàng</h4>
                      <div className="p-3 bg-white rounded border border-gray-200 text-gray-700 text-sm">
                        <p className="font-medium text-gray-900 mb-1">{order.shippingAddress.address}</p>
                        <p>
                          {order.shippingAddress.city}, {order.shippingAddress.postalCode},{' '}
                          {order.shippingAddress.country}
                        </p>
                      </div>
                    </div>

                    {/* Payment & Pricing */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Thanh toán</h4>
                        <div className="p-3 bg-white rounded border border-gray-200 space-y-1 text-sm text-gray-700">
                          <p>
                            <span className="font-medium">Phương thức:</span>{' '}
                            {getPaymentMethodName(order.paymentMethod)}
                          </p>
                          {order.isPaid ? (
                            <p className="text-green-600 font-semibold">
                              ✓ Đã thanh toán {order.paidAt ? `(${formatDate(order.paidAt)})` : ''}
                            </p>
                          ) : (
                            <p className="text-orange-600 font-semibold">⏳ Chờ thanh toán</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Chi tiết giá</h4>
                        <div className="p-3 bg-white rounded border border-gray-200 space-y-1 text-sm">
                          <div className="flex justify-between text-gray-700">
                            <span>Tạm tính:</span>
                            <span>{formatCurrency(order.itemsPrice)}</span>
                          </div>
                          <div className="flex justify-between text-gray-700">
                            <span>Phí vận chuyển:</span>
                            <span>{formatCurrency(order.shippingPrice)}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-gray-900 border-t pt-1">
                            <span>Tổng cộng:</span>
                            <span className="text-red-600">{formatCurrency(order.totalPrice)}</span>
                          </div>
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
                      {!order.isPaid && order.paymentMethod === 'vnpay' && (
                        <Button
                          onClick={() => {
                            toast.info('Tính năng thanh toán lại sẽ sớm được cập nhật');
                          }}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 h-10"
                        >
                          Thanh toán lại
                        </Button>
                      )}
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
