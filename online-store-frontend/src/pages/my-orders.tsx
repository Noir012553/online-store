import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/context/AuthContext';
import { orderAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ChevronRight, Package, Wallet, Calendar, AlertCircle, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { onPaymentSuccess, onOrderUpdated, offEvent } from '../lib/socket';
import { formatDate } from '../lib/utils';
import { useTranslation } from '../lib/i18n';
import { useCurrencyConversion } from '../hooks/useCurrencyConversion';

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
  // PHASE 3: Historical Currency Accuracy
  currencyCode: string;
}

/**
 * Memoized helper components untuk optimize rendering
 */

interface OrderCardProps {
  order: Order;
  isExpanded: boolean;
  onToggle: () => void;
  onViewDetails: (orderId: string) => void;
  locale?: string;
}

interface OrderItemRowProps {
  item: OrderItem;
  t?: (key: string, ns?: string) => string;
  locale?: string;
}

// Memoized Order Item Row Component
const OrderItemRow = ({ item, t, formatConvertedPrice }: OrderItemRowProps & { t: (key: string, ns?: string) => string; formatConvertedPrice: (amount: number) => string }) => (
  <div className="flex items-center gap-3 p-3 bg-white rounded border border-gray-200">
    <img
      src={item.image}
      alt={item.name || ''}
      className="w-12 h-12 object-cover rounded flex-shrink-0"
      loading="lazy"
    />
    <div className="flex-1 min-w-0">
      <p className="font-medium text-gray-900 line-clamp-2">{item.name || ''}</p>
      <p className="text-sm text-gray-600">{t('quantity_label', 'orders')}: {item.qty}</p>
    </div>
    <div className="text-right shrink-0">
      <p className="font-semibold text-red-600">
        {formatConvertedPrice(item.price * item.qty)}
      </p>
    </div>
  </div>
);

// Memoized Order Card Component - extracted to avoid re-renders
const OrderCard = ({ order, isExpanded, onToggle, onViewDetails, locale, t, getDeliveryStatusBadgeColor, getDeliveryStatusText, getPaymentStatusBadgeColor, getPaymentStatusText, getPaymentMethodLabel, formatConvertedPrice, formatHistoricalPrice }: OrderCardProps & { t: (key: string, ns?: string) => string; getDeliveryStatusBadgeColor: (isDelivered: boolean) => string; getDeliveryStatusText: (isDelivered: boolean) => string; getPaymentStatusBadgeColor: (isPaid: boolean) => string; getPaymentStatusText: (isPaid: boolean, paymentMethod?: string) => string; getPaymentMethodLabel: (method?: string) => string; formatConvertedPrice: (amount: number) => string; formatHistoricalPrice: (amount: number, currencyCode: Order['currencyCode']) => string }) => {
  const itemCount = useMemo(() =>
    order.orderItems.reduce((sum, item) => sum + item.qty, 0),
    [order.orderItems]
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Order Header */}
      <div
        className="p-4 sm:p-6 cursor-pointer hover:bg-white transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h3 className="font-semibold text-gray-900 text-lg">
                {t('order_prefix', 'orders')}{order._id.slice(-8).toUpperCase()}
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
                <span>{formatDate(new Date(order.createdAt), locale)}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Wallet className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-red-600">{formatHistoricalPrice(order.totalPrice, order.currencyCode)}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Package className="w-4 h-4 shrink-0" />
                <span>{itemCount} {t('items_count', 'orders')}</span>
              </div>
            </div>
          </div>

          <ChevronRight
            className={`w-6 h-6 text-gray-400 shrink-0 transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </div>
      </div>

      {/* Order Details (Expanded) - Only rendered when expanded */}
      {isExpanded && (
        <div className="border-t border-gray-200 p-4 sm:p-6 bg-white space-y-6">
          {/* Order Items */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">{t('products_title', 'orders')}</h4>
            <div className="space-y-2">
              {order.orderItems.map((item, index) => (
                <OrderItemRow key={index} item={item} t={t} formatConvertedPrice={(amount) => formatHistoricalPrice(amount, order.currencyCode)} />
              ))}
            </div>
          </div>

          {/* Pricing Details */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">{t('price_details_title', 'orders')}</h4>
            <div className="bg-white rounded border border-gray-200 overflow-hidden">
              <div className="divide-y divide-gray-200">
                <div className="flex justify-between p-3 text-sm">
                  <span className="text-gray-700">{t('subtotal_label', 'orders')}:</span>
                  <span className="font-medium text-gray-900">{formatHistoricalPrice(order.itemsPrice, order.currencyCode)}</span>
                </div>
                {order.shippingFee > 0 && (
                  <div className="flex justify-between p-3 text-sm bg-blue-50">
                    <span className="text-gray-700">{t('shipping_fee_label', 'orders')}:</span>
                    <span className="font-medium text-blue-600">{formatHistoricalPrice(order.shippingFee, order.currencyCode)}</span>
                  </div>
                )}
                {order.taxPrice > 0 && (
                  <div className="flex justify-between p-3 text-sm">
                    <span className="text-gray-700">{t('tax_label', 'orders')}:</span>
                    <span className="font-medium text-gray-900">{formatHistoricalPrice(order.taxPrice, order.currencyCode)}</span>
                  </div>
                )}
                <div className="flex justify-between p-3 font-semibold bg-linear-to-r from-red-50 to-orange-50">
                  <span className="text-gray-900">{t('total_label', 'orders')}:</span>
                  <span className="text-red-600 text-lg">{formatHistoricalPrice(order.totalPrice, order.currencyCode)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment & Shipping Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Payment Info */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-2 text-sm">{t('payment_info_title', 'orders')}</h4>
              <div className="bg-white rounded border border-gray-200 p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{t('payment_method_label', 'orders')}:</span>
                  <span className="font-medium text-gray-900">{getPaymentMethodLabel(order.paymentMethod)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{t('status_label', 'orders')}:</span>
                  <Badge className={getPaymentStatusBadgeColor(order.isPaid)}>
                    {getPaymentStatusText(order.isPaid, order.paymentMethod)}
                  </Badge>
                </div>
                {order.isPaid && order.paidAt && (
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                    <span className="text-gray-600">{t('paid_at_label', 'orders')}:</span>
                    <span className="text-xs text-gray-600">{formatDate(new Date(order.paidAt), locale)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Shipping Info */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-2 text-sm">{t('shipping_info_title', 'orders')}</h4>
              <div className="bg-white rounded border border-gray-200 p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{t('carrier_label', 'orders')}:</span>
                  <span className="font-medium text-gray-900">{order.shippingProvider ? order.shippingProvider.toUpperCase() : t('shipping_provider_unknown', 'orders')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{t('status_label', 'orders')}:</span>
                  <Badge className={getDeliveryStatusBadgeColor(order.isDelivered)}>
                    {getDeliveryStatusText(order.isDelivered)}
                  </Badge>
                </div>
                {order.isDelivered && order.deliveredAt && (
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                    <span className="text-gray-600">{t('delivered_at_label', 'orders')}:</span>
                    <span className="text-xs text-gray-600">{formatDate(new Date(order.deliveredAt), locale)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button
              onClick={(e) => {
                e.stopPropagation(); // Prevent toggle when clicking button
                onViewDetails(order._id);
              }}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 h-10"
            >
              {t('view_details_button', 'orders')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};


export default function MyOrders() {
  const router = useRouter();
  const { user, isInitialized } = useAuth();
  const { t, loadNamespace, locale } = useTranslation();
  const { formatConvertedPrice } = useCurrencyConversion();
  const { newOrder } = router.query;
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(newOrder as string || null);

  // Helper functions with translations
  const getDeliveryStatusBadgeColor = (isDelivered: boolean) => {
    if (isDelivered) return 'bg-green-100 text-green-800';
    return 'bg-blue-100 text-blue-800';
  };

  const getDeliveryStatusText = (isDelivered: boolean) => {
    if (isDelivered) return t('status_delivered', 'orders');
    return t('status_shipping', 'orders');
  };

  const getPaymentStatusBadgeColor = (isPaid: boolean) => {
    if (isPaid) return 'bg-green-100 text-green-800';
    return 'bg-orange-100 text-orange-800';
  };

  const getPaymentStatusText = (isPaid: boolean, paymentMethod: string | undefined) => {
    if (isPaid) return t('payment_status_paid', 'orders');
    if (paymentMethod === 'cod') return t('payment_status_unpaid_cod', 'orders');
    return t('payment_status_unpaid', 'orders');
  };

  const getPaymentMethodLabel = (method: string | undefined) => {
    switch (method) {
      case 'cod':
        return t('payment_method_cod', 'orders');
      case 'vnpay':
        return t('payment_method_vnpay', 'orders');
      case 'card':
        return t('payment_method_card', 'orders');
      default:
        return t('payment_method_unknown', 'orders');
    }
  };

  const formatHistoricalPrice = (amount: number, currencyCode: Order['currencyCode']): string =>
    formatConvertedPrice(amount, currencyCode, currencyCode);

  useEffect(() => {
    loadNamespace('orders');
  }, [loadNamespace, locale]);

  // Memoized fetchOrders with useCallback - include locale in dependency
  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await orderAPI.getMyOrders(locale);
      const orderList = Array.isArray(data) ? data : data?.data || data?.orders || [];
      setOrders(orderList.sort((a: Order, b: Order) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('error_processing_order', 'orders');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [locale, t]);

  // Initial load
  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      router.push("/login");
      return;
    }

    fetchOrders();
  }, [isInitialized, user, router, fetchOrders, locale]);

  // Socket.io realtime updates - optimized with useCallback
  useEffect(() => {
    if (!isInitialized || !user) return; // Don't set up socket listeners if not authenticated

    const handlePaymentSuccess = () => {
      // Auto-refresh orders when payment succeeds
      fetchOrders();
      toast.success(t('toast_order_paid', 'orders'));
    };

    const handleOrderUpdated = () => {
      // Auto-refresh orders when order is updated
      fetchOrders();
    };

    // Register listeners
    onPaymentSuccess(handlePaymentSuccess);
    onOrderUpdated(handleOrderUpdated);

    // Cleanup on unmount or user change
    return () => {
      offEvent('payment-success');
      offEvent('order-updated');
    };
  }, [user, fetchOrders, locale, t]);

  // Auto-refresh when page regains focus - optimized
  useEffect(() => {
    const handleFocus = () => {
      fetchOrders();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchOrders, locale]);

  if (!isInitialized) {
    return null;
  }

  if (!user) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white py-8 animate-in fade-in duration-300">
      <div className="container mx-auto px-4">
        <Breadcrumbs
          links={[
            { label: t('breadcrumb_home', 'orders'), href: '/' },
            { label: t('page_title', 'orders') },
          ]}
        />

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('page_title', 'orders')}</h1>
          <p className="text-gray-600">
            {orders.length > 0
              ? t('summary_you_have_orders', 'orders').replace('{{count}}', orders.length.toString())
              : t('summary_no_orders_yet', 'orders')}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">{t('error_load_data', 'orders')}</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        {orders.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
            <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('empty_title', 'orders')}</h2>
            <p className="text-gray-600 mb-6">{t('empty_description', 'orders')}</p>
            <Button
              onClick={() => router.push('/')}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2 h-10"
            >
              {t('continue_shopping_button', 'orders')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <OrderCard key={order._id}
                order={order}
                isExpanded={expandedOrderId === order._id}
                onToggle={() => setExpandedOrderId(expandedOrderId === order._id ? null : order._id)}
                onViewDetails={(orderId: string) => router.push(`/orders/${orderId}`)}
                locale={locale}
                t={t}
                getDeliveryStatusBadgeColor={getDeliveryStatusBadgeColor}
                getDeliveryStatusText={getDeliveryStatusText}
                getPaymentStatusBadgeColor={getPaymentStatusBadgeColor}
                getPaymentStatusText={getPaymentStatusText}
                getPaymentMethodLabel={getPaymentMethodLabel}
                formatConvertedPrice={formatConvertedPrice}
                formatHistoricalPrice={formatHistoricalPrice}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
