import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import {
  Package,
  MapPin,
  Calendar,
  Wallet,
  AlertCircle,
  ChevronLeft,
  Truck,
  CheckCircle,
  CreditCard,
  Clock,
  User,
  Phone as PhoneIcon,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { orderAPI } from '../../lib/api';
import { useAuth } from '../../lib/context/AuthContext';
import { useLanguage } from '@/lib/i18n';
import { formatCurrency, formatDate } from '../../lib/utils';
import { toast } from 'sonner';

interface ShippingAddress {
  name?: string;
  phone?: string;
  address?: string;
  wardCode?: string;
  wardName?: string;
  districtId?: string;
  districtName?: string;
  provinceId?: string;
  provinceName?: string;
}

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
  shippingFee?: number;
  isPaid: boolean;
  isDelivered: boolean;
  paidAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
  shippingAddress?: ShippingAddress;
  paymentMethod?: string;
  shippingProvider?: string;
  shippingService?: string;
}

const getStatusColor = (status: boolean) => {
  return status ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800';
};

const getStatusText = (t: (key: string) => string, status: boolean) => {
  return status ? t('status_completed') : t('status_pending');
};

const getStatusIcon = (status: boolean) => {
  return status ? (
    <CheckCircle className="w-5 h-5 text-green-600" />
  ) : (
    <AlertCircle className="w-5 h-5 text-orange-600" />
  );
};

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default function OrderDetail() {
  const router = useRouter();
  const { user, isInitialized } = useAuth();
  const { t } = useLanguage();
  const { id } = router.query;

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchOrder = async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);

    setError(null);
    try {
      const response = await orderAPI.getOrder(id as string);
      const orderData = response.order || response;
      setOrder(orderData);
      if (showRefreshing) {
        toast.success(t('toast_loading'));
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t('error_load_data');
      setError(errorMessage);
      if (showRefreshing) {
        toast.error(errorMessage);
      }
    } finally {
      if (showRefreshing) setIsRefreshing(false);
      else setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      router.push("/login");
      return;
    }

    if (!id) return;

    fetchOrder();
  }, [id, isInitialized, user, router]);

  if (!isInitialized) {
    return null;
  }

  if (!user) {
    return null;
  }

  if (!id) {
    return (
      <div className="min-h-screen bg-white py-8">
        <div className="container mx-auto px-4">
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
            <p className="text-gray-600">{t('order_not_found')}</p>
            <Button
              onClick={() => router.push('/my-orders')}
              className="mt-4 bg-red-600 hover:bg-red-700"
            >
              {t('go_to_orders_list')}
            </Button>
          </div>
        </div>
      </div>
    );
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
            { label: t('breadcrumb_home'), href: '/' },
            { label: t('my_orders_title_page'), href: '/my-orders' },
            { label: t('breadcrumb_order_details') },
          ]}
        />

          <div className="max-w-4xl mx-auto mt-8">
            <div className="bg-white rounded-lg border border-red-200 shadow-sm p-6">
              <div className="flex gap-3 items-start">
                <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-semibold text-red-800">{t('error_load_data')}</h2>
                  <p className="text-red-700 text-sm">{error || t('order_not_found')}</p>
                </div>
              </div>
              <Button
                onClick={() => router.push('/my-orders')}
                variant="outline"
                className="mt-4"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                {t('back')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalItems = order.orderItems.reduce((sum, item) => sum + item.qty, 0);

  return (
    <div className="min-h-screen bg-white py-8 animate-in fade-in duration-300">
      <div className="container mx-auto px-4">
        <Breadcrumbs
          links={[
            { label: t('breadcrumb_home'), href: '/' },
            { label: t('my_orders_title_page'), href: '/my-orders' },
            { label: t('breadcrumb_order_details') },
          ]}
        />

        <div className="max-w-4xl mx-auto mt-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {t('my_orders_id')}{order._id.slice(-8).toUpperCase()}
                </h1>
                <p className="text-gray-600">
                  {t('order_date_label')} {formatDate(new Date(order.createdAt))}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => fetchOrder(true)}
                  variant="outline"
                  disabled={isRefreshing}
                  className="gap-2"
                >
                  {isRefreshing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                      {t('processing')}
                    </>
                  ) : (
                    <>
                      ↻ {t('refresh')}
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => router.push('/my-orders')}
                  variant="outline"
                  className="gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t('back')}
                </Button>
              </div>
            </div>
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* Payment Status */}
            <div className={`rounded-lg border shadow-sm p-6 ${
              order.isPaid
                ? 'bg-linear-to-br from-green-50 to-emerald-50 border-green-200'
                : 'bg-linear-to-br from-orange-50 to-amber-50 border-orange-200'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <CreditCard className={`w-5 h-5 ${order.isPaid ? 'text-green-600' : 'text-orange-600'}`} />
                  {t('payment_status_title')}
                </h3>
                {getStatusIcon(order.isPaid)}
              </div>
              <Badge className={`${getStatusColor(order.isPaid)} mb-3`}>
                {getStatusText(t, order.isPaid)}
              </Badge>
              {order.isPaid && order.paidAt && (
                <p className="text-sm text-gray-600">
                  {t('payment_paid_at_prefix')} {formatDate(new Date(order.paidAt))}
                </p>
              )}
              {!order.isPaid && order.paymentMethod === 'cod' && (
                <p className="text-sm text-orange-600">
                  ⏳ {t('payment_method_cod_desc')}
                </p>
              )}
              {!order.isPaid && order.paymentMethod !== 'cod' && (
                <p className="text-sm text-orange-600">⏳ {t('my_orders_status_unpaid')}</p>
              )}
            </div>

            {/* Delivery Status */}
            <div className={`rounded-lg border shadow-sm p-6 ${
              order.isDelivered
                ? 'bg-linear-to-br from-green-50 to-emerald-50 border-green-200'
                : 'bg-linear-to-br from-blue-50 to-cyan-50 border-blue-200'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Truck className={`w-5 h-5 ${order.isDelivered ? 'text-green-600' : 'text-blue-600'}`} />
                  {t('delivery_status_title')}
                </h3>
                {getStatusIcon(order.isDelivered)}
              </div>
              <Badge className={`${getStatusColor(order.isDelivered)} mb-3`}>
                {getStatusText(t, order.isDelivered)}
              </Badge>
              {order.isDelivered && order.deliveredAt && (
                <p className="text-sm text-gray-600">
                  {t('delivery_delivered_at_prefix')} {formatDate(new Date(order.deliveredAt))}
                </p>
              )}
              {!order.isDelivered && (
                <p className="text-sm text-blue-600">{t('delivery_processing')}</p>
              )}
            </div>
          </div>

          {/* Order Items */}
          <div className="bg-white rounded-lg border shadow-sm p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-orange-600" />
              {t('order_items_title')} ({totalItems} {t('my_orders_items_count')})
            </h2>

            <div className="space-y-3">
              {order.orderItems.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-4 hover:bg-orange-50 bg-white rounded-lg border border-gray-200 hover:border-orange-300 transition"
                >
                  <div className="relative shrink-0">
                    <img
                      src={item.image}
                      alt={typeof item.name === 'object' ? String(Object.values(item.name)[0]) : item.name}
                      loading="lazy"
                      className="w-16 h-16 object-cover rounded border border-gray-200"
                    />
                    <span className="absolute -top-2 -right-2 bg-orange-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                      {item.qty}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 line-clamp-2">
                      {typeof item.name === 'object' ? String(Object.values(item.name)[0]) : item.name}
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">
                      {formatCurrency(item.price)} × {item.qty}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-gray-900">
                      {formatCurrency(item.price * item.qty)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {/* Prices */}
            <div className="md:col-span-2 bg-white rounded-lg border shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-blue-600" />
                {t('my_orders_price_details')}
              </h2>

              <div className="space-y-2">
                <div className="flex justify-between p-3 bg-white rounded">
                  <span className="text-gray-700">{t('my_orders_subtotal')} ({totalItems} {t('my_orders_items_count')})</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(order.itemsPrice || 0)}</span>
                </div>

                {(order.taxPrice || 0) > 0 && (
                  <div className="flex justify-between p-3 bg-white rounded">
                    <span className="text-gray-700">{t('my_orders_tax')}</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(order.taxPrice || 0)}</span>
                  </div>
                )}

                {(order.shippingFee || 0) > 0 && (
                  <div className="flex justify-between p-3 bg-blue-50 rounded border border-blue-200">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-blue-600" />
                      <span className="text-gray-700">{t('my_orders_shipping_fee')}</span>
                    </div>
                    <span className="font-semibold text-gray-900">{formatCurrency(order.shippingFee || 0)}</span>
                  </div>
                )}

                <div className="border-t pt-3 mt-3 p-3 bg-red-50 rounded border border-red-200 flex justify-between items-center">
                  <span className="font-bold text-gray-900">{t('total')}</span>
                  <span className="text-xl font-bold text-red-600">{formatCurrency(order.totalPrice)}</span>
                </div>
              </div>
            </div>

            {/* Summary Box */}
            <div className="bg-linear-to-br from-red-50 to-pink-50 rounded-lg border border-red-200 shadow-sm p-6">
              <h3 className="font-semibold text-red-900 mb-4 flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                {t('order_summary_title')}
              </h3>

              <div className="space-y-3">
                <div className="flex items-center gap-2 p-2 bg-white rounded">
                  <Package className="w-5 h-5 text-blue-600" />
                  <span className="text-sm text-gray-700 flex-1">{totalItems} {t('my_orders_items_count')}</span>
                  <span className="text-sm font-semibold text-gray-900">{totalItems}</span>
                </div>

                {(order.shippingProvider || order.shippingService) && (
                  <div className="flex items-center gap-2 p-2 bg-white rounded">
                    <Truck className="w-5 h-5 text-green-600" />
                    <span className="text-sm text-gray-700 flex-1">{t('shipping_info_label')}</span>
                    <span className="text-xs font-semibold text-gray-900">
                      {order.shippingProvider && order.shippingService
                        ? `${order.shippingProvider.toUpperCase()} - ${order.shippingService}`
                        : order.shippingProvider?.toUpperCase() || order.shippingService || t('shipping_info_na')}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 p-2 bg-white rounded">
                  <Calendar className="w-5 h-5 text-purple-600" />
                  <span className="text-sm text-gray-700 flex-1">{t('order_date_label')}</span>
                  <span className="text-xs font-semibold text-gray-900">
                    {formatDate(new Date(order.createdAt))}
                  </span>
                </div>

                <div className="border-t pt-3 mt-3 p-2 bg-red-100 rounded">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-red-900">{t('total')}</span>
                    <span className="text-lg font-bold text-red-600">
                      {formatCurrency(order.totalPrice)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          {order.shippingAddress && (
            <div className="bg-white rounded-lg border shadow-sm p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-green-600" />
                {t('order_address_title')}
              </h2>

              <div className="bg-linear-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200 space-y-3">
                {order.shippingAddress.name && (
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-gray-600 shrink-0" />
                    <p className="font-semibold text-gray-900">{order.shippingAddress.name}</p>
                  </div>
                )}

                {order.shippingAddress.phone && (
                  <div className="flex items-center gap-3">
                    <PhoneIcon className="w-5 h-5 text-gray-600 shrink-0" />
                    <p className="text-gray-700">{order.shippingAddress.phone}</p>
                  </div>
                )}

                {order.shippingAddress.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-gray-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-gray-700">
                        {[order.shippingAddress.address, order.shippingAddress.wardName, order.shippingAddress.districtName, order.shippingAddress.provinceName]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Additional Info */}
          {order.paymentMethod && (
            <div className="bg-white rounded-lg border shadow-sm p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                {t('payment_method_title')}
              </h2>

              <div className="space-y-4">
                <div className="bg-linear-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-start gap-3">
                    {order.paymentMethod === 'cod' ? (
                      <Truck className="w-6 h-6 text-blue-600 mt-0.5 shrink-0" />
                    ) : (
                      <CreditCard className="w-6 h-6 text-blue-600 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
                        {order.paymentMethod === 'cod'
                          ? t('payment_cod_title')
                          : t('payment_vnpay_title')}
                      </h3>
                      <p className="text-sm text-gray-700 mt-1">
                        {order.paymentMethod === 'cod'
                          ? t('payment_method_cod_desc')
                          : t('payment_vnpay_desc')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-gray-600 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      {t('order_id_code')}:
                    </span>
                    <span className="font-mono text-gray-900 text-sm">{order._id}</span>
                  </div>

                  {order.paymentMethod && (
                    <div className="flex items-center justify-between py-2">
                      <span className="text-gray-600 flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {t('order_date_label')}:
                      </span>
                      <span className="text-gray-900">{formatDate(new Date(order.createdAt))}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 flex-col sm:flex-row">
            <Button
              onClick={() => router.push('/my-orders')}
              variant="outline"
              className="flex-1"
            >
              {t('go_to_orders_list')}
            </Button>
            <Button
              onClick={() => router.push('/')}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              {t('continue_shopping_now')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
