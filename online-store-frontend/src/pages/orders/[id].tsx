import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import {
  ChevronRight,
  Package,
  Wallet,
  Calendar,
  MapPin,
  Phone,
  Mail,
  AlertCircle,
} from 'lucide-react';
import { formatDate } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { orderAPI } from '../../lib/api';
import { useAuth } from '../../lib/context/AuthContext';
import { useTranslation, useLanguage } from '../../lib/i18n';
import { useCurrencyConversion } from '../../hooks/useCurrencyConversion';
import { toast } from 'sonner';

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
  paymentMethod?: 'cod' | 'vnpay' | 'card';
  isDelivered: boolean;
  deliveredAt?: string;
  shippingProvider?: string;
  shippingService?: string;
  createdAt: string;
  updatedAt: string;
  shippingAddress?: {
    fullName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  // PHASE 3: Historical Currency Accuracy
  currencyCode: string; // Currency code when order was created
  exchangeRates?: Array<{
    fromCode: string;
    toCode: string;
    rate: number;
  }>; // Exchange rates snapshot
}

export default function OrderDetailsPage() {
  const router = useRouter();
  const { user, isInitialized } = useAuth();
  const { t, loadNamespace } = useTranslation();
  const { locale } = useLanguage();
  const { formatConvertedPrice } = useCurrencyConversion();
  const { id } = router.query;
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadNamespace('orders');
  }, [loadNamespace, locale]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      router.push('/login');
      return;
    }

    if (!id) return;

    const fetchOrder = async () => {
      try {
        setIsLoading(true);
        const response = await orderAPI.getOrder(id as string, locale);
        const orderData = response.order || response;
        setOrder(orderData);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : t('error_load_data', 'orders');
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrder();
  }, [id, isInitialized, user, locale, t, router]);

  const getDeliveryStatusBadgeColor = (isDelivered: boolean): string => {
    return isDelivered ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800';
  };

  const getDeliveryStatusText = (isDelivered: boolean): string => {
    return isDelivered
      ? t('status_delivered', 'orders')
      : t('status_shipping', 'orders');
  };

  const getPaymentStatusBadgeColor = (isPaid: boolean): string => {
    return isPaid ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800';
  };

  const getPaymentStatusText = (
    isPaid: boolean,
    paymentMethod?: string
  ): string => {
    if (isPaid) return t('payment_status_paid', 'orders');
    if (paymentMethod === 'cod')
      return t('payment_status_unpaid_cod', 'orders');
    return t('payment_status_unpaid', 'orders');
  };

  const getPaymentMethodLabel = (method?: string): string => {
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

  if (error || !order) {
    return (
      <div className="min-h-screen bg-white py-8">
        <div className="container mx-auto px-4">
          <Breadcrumbs
            links={[
              { label: t('breadcrumb_home', 'orders'), href: '/' },
              { label: t('page_title', 'orders'), href: '/my-orders' },
              { label: t('breadcrumb_order_details', 'orders') },
            ]}
          />
          <div className="max-w-2xl mx-auto mt-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-3" />
              <h1 className="text-xl font-semibold text-red-800 mb-2">
                {t('order_not_found', 'orders')}
              </h1>
              <p className="text-red-700 mb-4">{error}</p>
              <Button
                onClick={() => router.push('/my-orders')}
                className="bg-red-600 hover:bg-red-700"
              >
                {t('go_to_orders_list', 'orders')}
              </Button>
            </div>
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
            { label: t('page_title', 'orders'), href: '/my-orders' },
            { label: t('breadcrumb_order_details', 'orders') },
          ]}
        />

        <div className="max-w-4xl mx-auto mt-8">
          {/* Header Section */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  {t('order_prefix', 'orders')}
                  {order._id.slice(-8).toUpperCase()}
                </h1>
                <p className="text-gray-600 mt-1">
                  {t('order_date_label', 'orders')}:{' '}
                  {formatDate(new Date(order.createdAt), locale)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className={getDeliveryStatusBadgeColor(order.isDelivered)}>
                  {getDeliveryStatusText(order.isDelivered)}
                </Badge>
                <Badge className={getPaymentStatusBadgeColor(order.isPaid)}>
                  {getPaymentStatusText(order.isPaid, order.paymentMethod)}
                </Badge>
              </div>
            </div>
          </div>

          {/* Order Items Section */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-lg text-gray-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-red-600" />
              {t('order_items_title', 'orders')}
            </h2>
            <div className="space-y-3">
              {order.orderItems.map((item, index) => (
                <div
                  key={index}
                  className="flex gap-4 items-start p-4 bg-gray-50 rounded border border-gray-200"
                >
                  <img
                    src={item.image}
                    alt={item.name || ''}
                    className="w-16 h-16 object-cover rounded flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 line-clamp-2">
                      {item.name || ''}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {t('quantity_label', 'orders')}: {item.qty}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm text-gray-600">
                      {formatHistoricalPrice(item.price, order.currencyCode)}
                    </p>
                    <p className="font-semibold text-red-600">
                      {formatHistoricalPrice(item.price * item.qty, order.currencyCode)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Price Details Section */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-lg text-gray-900 mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-red-600" />
              {t('price_details_title', 'orders')}
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t('subtotal_label', 'orders')}:</span>
                <span className="font-medium text-gray-900">
                  {formatHistoricalPrice(order.itemsPrice, order.currencyCode)}
                </span>
              </div>
              {order.shippingFee > 0 && (
                <div className="flex justify-between text-sm border-t pt-3">
                  <span className="text-gray-600">
                    {t('shipping_fee_label', 'orders')}:
                  </span>
                  <span className="font-medium text-blue-600">
                    {formatHistoricalPrice(order.shippingFee, order.currencyCode)}
                  </span>
                </div>
              )}
              {order.taxPrice > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{t('tax_label', 'orders')}:</span>
                  <span className="font-medium text-gray-900">
                    {formatHistoricalPrice(order.taxPrice, order.currencyCode)}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-lg border-t pt-3">
                <span className="text-gray-900">{t('total_label', 'orders')}:</span>
                <span className="text-red-600">
                  {formatHistoricalPrice(order.totalPrice, order.currencyCode)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment & Shipping Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Payment Information */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="font-semibold text-lg text-gray-900 mb-4 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-red-600" />
                {t('payment_info_title', 'orders')}
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    {t('payment_method_label', 'orders')}:
                  </span>
                  <span className="font-medium text-gray-900">
                    {getPaymentMethodLabel(order.paymentMethod)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('status_label', 'orders')}:</span>
                  <Badge className={getPaymentStatusBadgeColor(order.isPaid)}>
                    {getPaymentStatusText(order.isPaid, order.paymentMethod)}
                  </Badge>
                </div>
                {order.isPaid && order.paidAt && (
                  <div className="flex justify-between pt-3 border-t">
                    <span className="text-gray-600">
                      {t('paid_at_label', 'orders')}:
                    </span>
                    <span className="text-xs text-gray-600">
                      {formatDate(new Date(order.paidAt), locale)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Shipping Information */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="font-semibold text-lg text-gray-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-red-600" />
                {t('shipping_info_title', 'orders')}
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('carrier_label', 'orders')}:</span>
                  <span className="font-medium text-gray-900">
                    {order.shippingProvider
                      ? order.shippingProvider.toUpperCase()
                      : t('shipping_provider_unknown', 'orders')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('status_label', 'orders')}:</span>
                  <Badge className={getDeliveryStatusBadgeColor(order.isDelivered)}>
                    {getDeliveryStatusText(order.isDelivered)}
                  </Badge>
                </div>
                {order.isDelivered && order.deliveredAt && (
                  <div className="flex justify-between pt-3 border-t">
                    <span className="text-gray-600">
                      {t('delivered_at_label', 'orders')}:
                    </span>
                    <span className="text-xs text-gray-600">
                      {formatDate(new Date(order.deliveredAt), locale)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Shipping Address Section */}
          {order.shippingAddress && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
              <h2 className="font-semibold text-lg text-gray-900 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-red-600" />
                {t('shipping_address', 'orders')}
              </h2>
              <div className="space-y-2 text-sm text-gray-700">
                {order.shippingAddress.fullName && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {order.shippingAddress.fullName}
                    </span>
                  </div>
                )}
                {order.shippingAddress.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{order.shippingAddress.phone}</span>
                  </div>
                )}
                {order.shippingAddress.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span>{order.shippingAddress.email}</span>
                  </div>
                )}
                {order.shippingAddress.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span>
                      {[
                        order.shippingAddress.address,
                        order.shippingAddress.city,
                        order.shippingAddress.state,
                        order.shippingAddress.postalCode,
                        order.shippingAddress.country,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 flex-col sm:flex-row">
            <Button
              onClick={() => router.push('/my-orders')}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 h-10"
            >
              {t('go_to_orders_list', 'orders')}
            </Button>
            <Button
              onClick={() => router.push('/')}
              variant="outline"
              className="flex-1 font-semibold px-4 py-2 h-10"
            >
              {t('continue_shopping_button', 'orders')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
