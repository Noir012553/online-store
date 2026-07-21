import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { CheckCircle, ShoppingBag, Wallet, Package, Truck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { orderAPI } from '../lib/api';
import { useAuth } from '../lib/context/AuthContext';
import { useTranslation, useLanguage } from '../lib/i18n';
import { toast } from 'sonner';
import { formatDate } from '../lib/utils';
import { useCurrencyConversion } from '../hooks/useCurrencyConversion';
import { UI_EMOJI } from '../lib/uiEmoji';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

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
  currencyCode: string;
}

const getStatusBadgeColor = (isDelivered: boolean) => {
  if (isDelivered) return 'bg-green-100 text-green-800';
  return 'bg-orange-100 text-orange-800';
};

const getStatusText = (isDelivered: boolean, t: (key: string, ns?: string) => string) => {
  if (isDelivered) return t('status_delivered', 'order-success');
  return t('status_processing', 'order-success');
};

export default function OrderSuccess() {
  const router = useRouter();
  const { user, isInitialized } = useAuth();
  const { locale } = useLanguage();
  const { t, loadNamespace } = useTranslation();
  const { orderId } = router.query;
  const { formatConvertedPrice } = useCurrencyConversion();
  const formatOrderPrice = (amount: number, currencyCode: string) =>
    formatConvertedPrice(amount, currencyCode, currencyCode);

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadNamespace('order-success');
    loadNamespace('orders');
  }, [loadNamespace, locale]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const fetchOrders = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await orderAPI.getMyOrders(locale);
        const orderList = Array.isArray(data) ? data : data?.data || data?.orders || [];
        setOrders(orderList.sort((a: Order, b: Order) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t('error_load_orders', 'orders');
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, [isInitialized, user, router, locale]);

  // Tính toán thống kê
  const totalOrders = orders.length;
  const totalSpentByCurrency = orders.reduce<Record<string, number>>((totals, order) => {
    totals[order.currencyCode] = (totals[order.currencyCode] || 0) + order.totalPrice;
    return totals;
  }, {});
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
          <p className="text-gray-600">{t('loading', 'order-success')}</p>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8 animate-in fade-in duration-300">
      <Breadcrumbs
        links={[
          { label: t('breadcrumb_home', 'order-success'), href: '/' },
          { label: t('breadcrumb_success', 'order-success') },
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
            {t('title', 'order-success')}
          </h1>
          <p className="text-gray-600">
            {t('subtitle', 'order-success')}
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {/* Total Orders */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-600 text-sm font-medium">{t('stats_total_orders', 'order-success')}</span>
              <ShoppingBag className="w-5 h-5 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{totalOrders}</p>
            <p className="text-xs text-gray-500 mt-1">{t('stats_orders_label', 'order-success')}</p>
          </div>

          {/* Total Spent */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-600 text-sm font-medium">{t('stats_total_spent', 'order-success')}</span>
              <Wallet className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {Object.entries(totalSpentByCurrency).map(([currencyCode, amount]) => (
                <p key={currencyCode}>{formatOrderPrice(amount, currencyCode)}</p>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">{t('stats_all_orders_label', 'order-success')}</p>
          </div>

          {/* Delivered Orders */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-600 text-sm font-medium">{t('stats_delivered', 'order-success')}</span>
              <Truck className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{deliveredOrders}</p>
            <p className="text-xs text-gray-500 mt-1">{t('stats_orders_label', 'order-success')}</p>
          </div>

          {/* Pending Orders */}
          <div className="bg-white rounded-lg border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-600 text-sm font-medium">{t('stats_pending', 'order-success')}</span>
              <Package className="w-5 h-5 text-orange-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{pendingOrders}</p>
            <p className="text-xs text-gray-500 mt-1">{t('stats_orders_label', 'order-success')}</p>
          </div>
        </div>

        {/* New Order Details */}
        {newOrder && (
          <div className="bg-linear-to-r from-green-50 to-blue-50 rounded-lg border border-green-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('new_order_title', 'order-success')}</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-600 mb-1">{t('new_order_order_id', 'order-success')}</p>
                <p className="text-lg font-bold text-red-600 font-mono mb-4">{newOrder._id}</p>

                <p className="text-sm text-gray-600 mb-1">{t('new_order_order_date', 'order-success')}</p>
                <p className="text-base font-semibold text-gray-900 mb-4">
                  {formatDate(new Date(newOrder.createdAt), locale)}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">{t('new_order_status', 'order-success')}</p>
                <div className="mb-4">
                  <Badge className={`${getStatusBadgeColor(newOrder.isDelivered)}`}>
                    {getStatusText(newOrder.isDelivered, t)}
                  </Badge>
                </div>

                <p className="text-sm text-gray-600 mb-1">{t('new_order_total', 'order-success')}</p>
                <p className="text-2xl font-bold text-red-600 mb-4">
                  {formatOrderPrice(newOrder.totalPrice, newOrder.currencyCode)}
                </p>
              </div>
            </div>

            {/* Order Items Summary */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm font-medium text-gray-900 mb-3">{t('new_order_items_title', 'order-success')} ({newOrder.orderItems.length})</p>
              <div className="space-y-2">
                {newOrder.orderItems.map((item, index) => (
                  <div key={index} className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">
                      {typeof item.name === 'object' ? (Object.values(item.name)[0] as string) || item.name : item.name} <span className="text-gray-500">x{item.qty}</span>
                    </span>
                    <span className="font-semibold text-gray-900">
                      {formatOrderPrice(item.price * item.qty, newOrder.currencyCode)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recent Orders */}
        <div className="bg-white rounded-lg border shadow-sm p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('recent_orders_title', 'order-success')}</h2>

          {recentOrders.length === 0 ? (
            <p className="text-center text-gray-500 py-8">{t('recent_orders_empty', 'order-success')}</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div key={order._id} className="border rounded-lg p-4 hover:bg-white transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{order._id}</p>
                      <p className="text-sm text-gray-500">{formatDate(new Date(order.createdAt), locale)}</p>
                    </div>
                    <Badge className={`${getStatusBadgeColor(order.isDelivered)}`}>
                    {getStatusText(order.isDelivered, t)}
                  </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">{order.orderItems.length} {t('items_count', 'order-success')}</span>
                    </div>
                    <p className="font-semibold text-red-600">{formatOrderPrice(order.totalPrice, order.currencyCode)}</p>
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
            {t('actions_view_all_orders', 'order-success')}
          </Button>
          <Button
            onClick={() => router.push('/')}
            variant="outline"
            className="flex-1"
          >
            {t('actions_continue_shopping', 'order-success')}
          </Button>
        </div>

        {/* Next Steps */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-3">{t('next_steps_title', 'order-success')}</h3>
          <ul className="space-y-2 text-blue-800 text-sm">
            <li className="flex items-start gap-2">
              <span className="font-bold mt-0.5">{UI_EMOJI.feature}</span>
              <span>{t('next_steps_email_confirmation', 'order-success')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold mt-0.5">{UI_EMOJI.feature}</span>
              <span>{t('next_steps_complete_payment', 'order-success')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold mt-0.5">{UI_EMOJI.feature}</span>
              <span>{t('next_steps_track_orders', 'order-success')}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
