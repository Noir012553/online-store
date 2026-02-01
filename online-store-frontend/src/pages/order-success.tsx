import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { CheckCircle, ShoppingBag, Wallet, Package, Truck } from 'lucide-react';
import { formatCurrency, formatDate } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { orderAPI } from '../lib/api';
import { useAuth } from '../lib/context/AuthContext';
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
  itemsPrice: number;
  taxPrice: number;
  totalPrice: number;
  isDelivered: boolean;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

const getStatusBadgeColor = (isDelivered: boolean) => {
  if (isDelivered) return 'bg-green-100 text-green-800';
  return 'bg-orange-100 text-orange-800';
};

const getStatusText = (isDelivered: boolean) => {
  if (isDelivered) return 'Đã giao';
  return 'Đang xử lý';
};

export default function OrderSuccess() {
  const router = useRouter();
  const { user } = useAuth();
  const { orderId } = router.query;
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Tính toán thống kê
  const totalOrders = orders.length;
  const totalSpent = orders.reduce((sum, order) => sum + order.totalPrice, 0);
  const deliveredOrders = orders.filter(order => order.isDelivered).length;
  const pendingOrders = orders.filter(order => !order.isDelivered).length;

  // Lấy đơn hàng vừa tạo từ sessionStorage
  const [newOrder, setNewOrder] = useState<Order | null>(null);

  useEffect(() => {
    const storedOrder = sessionStorage.getItem('lastOrder') || sessionStorage.getItem('checkoutOrder');
    if (storedOrder) {
      try {
        setNewOrder(JSON.parse(storedOrder));
      } catch (error) {
        // Error parsing stored order
      }
    }
  }, []);

  // Lấy 5 đơn hàng gần đây (không bao gồm đơn vừa tạo nếu đã được thêm)
  const recentOrders = orders.slice(0, 5);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Đang tải thông tin...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 animate-in fade-in duration-300">
      <Breadcrumbs
        links={[
          { label: 'Trang chủ', href: '/' },
          { label: 'Xác nhận thành công' },
        ]}
      />

      {/* Success Header */}
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-green-100 rounded-full p-4">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-green-600 mb-2">
            Đặt hàng thành công!
          </h1>
          <p className="text-gray-600">
            Cảm ơn bạn đã tin tưởng LaptopStore. Dưới đây là thông tin chi tiết về đơn hàng của bạn.
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {/* Total Orders */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-600 text-sm font-medium">Tổng số đơn</span>
              <ShoppingBag className="w-5 h-5 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{totalOrders}</p>
            <p className="text-xs text-gray-500 mt-1">Đơn hàng</p>
          </div>

          {/* Total Spent */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-600 text-sm font-medium">Tổng chi tiêu</span>
              <Wallet className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSpent)}</p>
            <p className="text-xs text-gray-500 mt-1">Tất cả đơn</p>
          </div>

          {/* Delivered Orders */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-600 text-sm font-medium">Đã giao</span>
              <Truck className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{deliveredOrders}</p>
            <p className="text-xs text-gray-500 mt-1">Đơn hàng</p>
          </div>

          {/* Pending Orders */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-600 text-sm font-medium">Chờ xử lý</span>
              <Package className="w-5 h-5 text-orange-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{pendingOrders}</p>
            <p className="text-xs text-gray-500 mt-1">Đơn hàng</p>
          </div>
        </div>

        {/* New Order Details */}
        {newOrder && (
          <div className="bg-linear-to-r from-green-50 to-blue-50 rounded-lg border border-green-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Đơn hàng vừa tạo</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-600 mb-1">Mã đơn hàng</p>
                <p className="text-lg font-bold text-red-600 font-mono mb-4">{newOrder._id}</p>

                <p className="text-sm text-gray-600 mb-1">Ngày đặt</p>
                <p className="text-base font-semibold text-gray-900 mb-4">
                  {formatDate(new Date(newOrder.createdAt))}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">Trạng thái</p>
                <div className="mb-4">
                  <Badge className={`${getStatusBadgeColor(newOrder.isDelivered)}`}>
                    {getStatusText(newOrder.isDelivered)}
                  </Badge>
                </div>

                <p className="text-sm text-gray-600 mb-1">Tổng tiền</p>
                <p className="text-2xl font-bold text-red-600 mb-4">
                  {formatCurrency(newOrder.totalPrice)}
                </p>
              </div>
            </div>

            {/* Order Items Summary */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm font-medium text-gray-900 mb-3">Chi tiết sản phẩm ({newOrder.orderItems.length})</p>
              <div className="space-y-2">
                {newOrder.orderItems.map((item, index) => (
                  <div key={index} className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">
                      {item.name} <span className="text-gray-500">x{item.qty}</span>
                    </span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(item.price * item.qty)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recent Orders */}
        <div className="bg-white rounded-lg border shadow-sm p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">5 đơn hàng gần đây</h2>
          
          {recentOrders.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Chưa có đơn hàng nào</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div key={order._id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{order._id}</p>
                      <p className="text-sm text-gray-500">{formatDate(new Date(order.createdAt))}</p>
                    </div>
                    <Badge className={`${getStatusBadgeColor(order.isDelivered)}`}>
                      {getStatusText(order.isDelivered)}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">{order.orderItems.length} sản phẩm</span>
                    </div>
                    <p className="font-semibold text-red-600">{formatCurrency(order.totalPrice)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 flex-col sm:flex-row mb-8">
          <Button
            onClick={() => router.push('/my-orders')}
            className="flex-1 bg-red-600 hover:bg-red-700"
          >
            Xem tất cả đơn hàng
          </Button>
          <Button
            onClick={() => router.push('/')}
            variant="outline"
            className="flex-1"
          >
            Tiếp tục mua hàng
          </Button>
        </div>

        {/* Next Steps */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-3">Tiếp theo</h3>
          <ul className="space-y-2 text-blue-800 text-sm">
            <li className="flex items-start gap-2">
              <span className="font-bold mt-0.5">✓</span>
              <span>Chúng tôi sẽ xác nhận đơn hàng qua email</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold mt-0.5">✓</span>
              <span>Hoàn thành thanh toán theo phương thức bạn chọn</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold mt-0.5">✓</span>
              <span>Theo dõi trạng thái giao hàng tại "Đơn hàng của tôi"</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
