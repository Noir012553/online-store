import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Package, MapPin, Calendar, DollarSign, CheckCircle2, Truck, ArrowLeft, AlertCircle } from 'lucide-react';
import { formatDate } from '../../../lib/utils';
import { orderAPI } from '../../../lib/api';
import { useTranslation, useLanguage } from '../../../lib/i18n';
import { useCurrencyConversion } from '../../../hooks/useCurrencyConversion';
import { Button } from '../../ui/button';
import { toast } from 'sonner';

interface OrderItem {
  name: string;
  price: number;
  qty: number;
}

interface Order {
  _id: string;
  user?: {
    _id: string;
    username?: string;
    email?: string;
    name?: string;
  };
  customer?: {
    _id: string;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  orderItems: OrderItem[];
  totalPrice: number;
  currencyCode: string;
  isPaid: boolean;
  isDelivered: boolean;
  paymentMethod?: string;
  paidAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
}

interface OrderDetailProps {
  orderId: string;
}

export function OrderDetail({ orderId }: OrderDetailProps) {
  const router = useRouter();
  const { t, loadNamespace } = useTranslation();
  const { locale } = useLanguage();
  const { formatConvertedPrice } = useCurrencyConversion();

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        setIsLoading(true);
        const order = await orderAPI.getOrderById(orderId, locale);
        setOrder(order);
      } catch (error) {
        toast.error(t('error_load_data', 'common'));
        router.push('/admin/orders');
      } finally {
        setIsLoading(false);
      }
    };

    if (orderId) {
      fetchOrder();
    }
  }, [orderId, locale, t, router]);

  const handleMarkAsDelivered = async () => {
    if (!order) return;

    try {
      setIsUpdating(true);
      await fetch(`/api/orders/${order._id}/deliver?lang=${locale}`, { method: 'PUT' });
      
      toast.success(t('toast_update_success', 'admin'));
      setOrder({ ...order, isDelivered: true });
    } catch (error) {
      toast.error(t('error_save_data', 'common'));
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <p>{t('loading', 'common')}</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto py-6">
        <div className="bg-white rounded-lg border p-6 text-center">
          <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">{t('error_order_not_found', 'admin')}</p>
          <Button onClick={() => router.push('/admin/orders')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('back', 'common')}
          </Button>
        </div>
      </div>
    );
  }

  const formatOrderPrice = (amount: number) =>
    formatConvertedPrice(amount, order.currencyCode, order.currencyCode);

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push('/admin/orders')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('back', 'common')}
        </Button>
        <h1 className="text-2xl font-bold">
          {t('admin_order_details', 'admin')} #{order._id.slice(-8).toUpperCase()}
        </h1>
      </div>

      <div className="bg-white rounded-lg border space-y-6 p-6">
        {/* Customer Info */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            {t('customer_info', 'admin')}
          </h2>
          <div className="bg-blue-50 p-4 rounded-lg space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">{t('name_label', 'admin')}:</span>
              <span className="font-medium">{order.customer?.name || order.user?.username || t('not_updated', 'admin')}</span>
            </div>
            {(order.customer?.email || order.user?.email) && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">{t('email_label', 'admin')}:</span>
                <a href={`mailto:${order.customer?.email || order.user?.email}`} className="font-medium text-blue-600 hover:underline">
                  {order.customer?.email || order.user?.email}
                </a>
              </div>
            )}
            {order.customer?.phone && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">{t('phone_placeholder', 'admin')}:</span>
                <a href={`tel:${order.customer.phone}`} className="font-medium text-blue-600 hover:underline">
                  {order.customer.phone}
                </a>
              </div>
            )}
            {order.customer?.address && (
              <div className="pt-2 border-t border-blue-200">
                <p className="text-sm text-gray-600 mb-1">{t('shipping_address', 'admin')}:</p>
                <p className="text-sm font-medium text-gray-800">{order.customer.address}</p>
              </div>
            )}
          </div>
        </div>

        {/* Order Items */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            {t('product_list', 'admin')}
          </h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">{t('product', 'admin')}</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">{t('quantity_label', 'admin')}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">{t('admin_price', 'admin')}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">{t('total', 'admin')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {order.orderItems.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">
                      {item.name}
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-medium">{item.qty}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      {formatOrderPrice(item.price)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-red-600">
                      {formatOrderPrice(item.price * item.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t font-semibold">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-right text-sm">
                    {t('total', 'admin')}:
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-red-600">
                    {formatOrderPrice(order.totalPrice)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={`p-4 rounded-lg text-center transition-colors ${order.isPaid ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
            <div className="flex items-center justify-center mb-2">
              <CheckCircle2 className={`w-5 h-5 ${order.isPaid ? 'text-green-600' : 'text-yellow-600'}`} />
            </div>
            <p className="text-xs text-gray-600 mb-1">{t('payment_info', 'admin')}</p>
            <p className={`text-xs font-semibold ${order.isPaid ? 'text-green-600' : 'text-yellow-600'}`}>
              {order.isPaid ? t('order_status_paid', 'admin') : t('order_status_pending', 'admin')}
            </p>
          </div>
          <div className={`p-4 rounded-lg text-center transition-colors ${order.isDelivered ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
            <div className="flex items-center justify-center mb-2">
              <Truck className={`w-5 h-5 ${order.isDelivered ? 'text-green-600' : 'text-yellow-600'}`} />
            </div>
            <p className="text-xs text-gray-600 mb-1">{t('admin_status', 'admin')}</p>
            <p className={`text-xs font-semibold ${order.isDelivered ? 'text-green-600' : 'text-yellow-600'}`}>
              {order.isDelivered ? t('order_status_delivered', 'admin') : t('order_status_pending', 'admin')}
            </p>
          </div>
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg text-center">
            <div className="flex items-center justify-center mb-2">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-xs text-gray-600 mb-1">{t('admin_order_date', 'admin')}</p>
            <p className="text-xs font-semibold text-blue-600">{formatDate(new Date(order.createdAt), locale)}</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg text-center">
            <div className="flex items-center justify-center mb-2">
              <DollarSign className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-xs text-gray-600 mb-1">{t('admin_payment_method', 'admin')}</p>
            <p className="text-xs font-semibold text-purple-600">
              {order.paymentMethod === 'vnpay' && t('payment_method_vnpay', 'admin')}
              {order.paymentMethod === 'cod' && t('payment_method_cod', 'admin')}
              {order.paymentMethod === 'card' && t('payment_method_card', 'admin')}
              {order.paymentMethod === 'bank_transfer' && t('payment_method_bank_transfer', 'admin')}
              {!order.paymentMethod && t('payment_method_cod', 'admin')}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        {!order.isDelivered && (
          <div className="flex gap-2 pt-4 border-t">
            <Button
              onClick={handleMarkAsDelivered}
              disabled={isUpdating}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
            >
              <Truck className="w-4 h-4" />
              {isUpdating ? t('loading', 'common') : t('mark_as_delivered', 'admin')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
