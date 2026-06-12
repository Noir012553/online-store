import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { CheckCircle, Package } from "lucide-react";
import { formatCurrency, formatDate } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { orderAPI } from "../lib/api";
import { useAuth } from "../lib/context/AuthContext";
import { useTranslation } from "../lib/i18n";
import { toast } from "sonner";

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

interface OrderData {
  _id: string;
  totalPrice: number;
  itemsPrice: number;
  orderItems: any[];
  createdAt: string;
  isPaid: boolean;
  isDelivered: boolean;
  paymentMethod?: 'cod' | 'vnpay';
}

export default function OrderConfirmation() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, loadNamespace } = useTranslation();
  const { orderId } = router.query;
  const [order, setOrder] = useState<OrderData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [redirectCountdown, setRedirectCountdown] = useState(5);

  useEffect(() => {
    loadNamespace('order-confirmation');
  }, [loadNamespace]);

  useEffect(() => {
    if (!orderId) return;

    const initializeOrder = async () => {
      try {
        // Get order from storage (for direct checkout) or fetch from backend
        let orderData: OrderData | null = null;

        const storedOrder = sessionStorage.getItem('lastOrder');
        if (storedOrder) {
          try {
            orderData = JSON.parse(storedOrder);
            sessionStorage.removeItem('lastOrder');
          } catch (error) {
            // Error parsing stored order
          }
        }

        // Only call the protected endpoint when we actually have an authenticated user.
        if (!orderData && user) {
          try {
            const response = await orderAPI.getOrder(orderId as string);
            orderData = response.order || response;
          } catch (error) {
            // Error fetching order from backend
          }
        }

        if (orderData) {
          setOrder(orderData);
        }
      } catch (error) {
        toast.error(t('error_load_data'));
      } finally {
        setIsLoading(false);
      }
    };

    initializeOrder();
  }, [orderId, user]);

  // Auto-redirect to order-success page after 5 seconds (only for COD, not VNPAY)
  useEffect(() => {
    if (!isLoading && order) {
      // Nếu là VNPAY, không auto-redirect vì user sẽ return từ VNPAY
      // Chỉ auto-redirect cho COD
      if (order.paymentMethod === 'vnpay') {
        // Don't redirect for VNPAY - let user manually proceed
        setRedirectCountdown(0);
        return;
      }

      let countdown = 5;

      const timer = setInterval(() => {
        countdown--;
        setRedirectCountdown(countdown);

        if (countdown <= 0) {
          clearInterval(timer);
          router.push('/order-success');
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [isLoading, order, router]);

  if (!orderId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1>{t('order_not_found_title')}</h1>
          <p className="text-gray-600 mt-2">{t('order_not_found_desc')}</p>
          <Button className="mt-4" onClick={() => router.push("/")}>
            {t('go_home_button')}
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('loading_order_info')}</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1>{t('order_not_found_title')}</h1>
          <p className="text-gray-600 mt-2">{t('order_id_label', 'order-confirmation')}: {orderId}</p>
          <Button className="mt-4" onClick={() => router.push("/")}>
            {t('go_home_button')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 animate-in fade-in duration-300">
      <Breadcrumbs
        links={[
          { label: t('home'), href: "/" },
          { label: t('breadcrumb_order_confirmation') },
        ]}
      />

      <div className="max-w-2xl mx-auto">
        {/* Success Message */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-green-100 rounded-full p-4">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2 text-green-600">
            {t('order_confirmation_title')}
          </h1>
          <p className="text-gray-600">
            {t('order_confirmation_thank_you')}
          </p>
        </div>

        {/* Order Details Card */}
        <div className="bg-white rounded-lg border shadow-sm p-6 mb-6">
          <div className="flex justify-between items-start mb-6 pb-6 border-b">
            <div>
              <h2 className="text-lg font-semibold mb-2">{t('order_id_code')}</h2>
              <p className="text-2xl font-bold text-red-600 font-mono">
                {order._id}
              </p>
            </div>
            <Badge className="bg-blue-100 text-blue-800">
              {formatDate(order.createdAt)}
            </Badge>
          </div>

          {/* Status Summary */}
          <div className="grid grid-cols-1 gap-4 mb-6 pb-6 border-b">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">{t('my_orders_status')}</p>
                <p className="font-semibold text-orange-600">{t('order_status_pending')}</p>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">{t('order_items_details')}</h3>
            <div className="space-y-3">
              {order.orderItems.map((item, index) => (
                <div key={index} className="flex justify-between items-center pb-3 border-b last:border-b-0">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-gray-600">{t('order_item_quantity').replace('{quantity}', item.qty)}</p>
                  </div>
                  <p className="font-semibold text-red-600">
                    {formatCurrency(item.price * item.qty)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Price Summary */}
          <div className="bg-white rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-lg font-bold text-red-600">
              <span>{t('total_amount')}:</span>
              <span>{formatCurrency(order.totalPrice)}</span>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h3 className="font-semibold text-blue-900 mb-3">{t('next_steps_title')}</h3>
          <ul className="space-y-2 text-blue-800 text-sm">
            <li className="flex items-start gap-2">
              <span className="font-bold">1.</span>
              <span>{t('next_step_1')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">2.</span>
              <span>{t('next_step_2')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">3.</span>
              <span>{t('next_step_3')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">4.</span>
              <span>{t('next_step_4')}</span>
            </li>
          </ul>
        </div>

        {/* Redirect Countdown or VNPAY Info */}
        {order.paymentMethod === 'vnpay' ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">{t('vnpay_waiting_title')}</h3>
            <p className="text-blue-800 text-sm">
              {t('vnpay_waiting_desc')}
            </p>
            <p className="text-blue-700 text-sm mt-2">
              {t('vnpay_redirect_desc')}
            </p>
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-center">
            <p className="text-blue-800">
              {t('redirect_countdown').replace('{countdown}', redirectCountdown.toString())}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 flex-col sm:flex-row">
          {order.paymentMethod === 'vnpay' ? (
            <>
              <Button
                onClick={() => router.push(`/orders/${order._id}`)}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {t('order_details_button')}
              </Button>
              <Button
                onClick={() => router.push("/")}
                variant="outline"
                className="flex-1"
              >
                {t('continue_shopping_button')}
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => router.push("/order-success")}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {t('view_order_summary_button')}
              </Button>
              <Button
                onClick={() => router.push("/")}
                variant="outline"
                className="flex-1"
              >
                {t('continue_shopping_button')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
