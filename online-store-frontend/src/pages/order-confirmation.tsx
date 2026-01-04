import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { CheckCircle, XCircle, AlertCircle, Package, MapPin, Phone, Mail, DollarSign, Calendar } from "lucide-react";
import { formatCurrency, formatDate } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { orderAPI } from "../lib/api";
import { useAuth } from "../lib/context/CartContext";
import { toast } from "sonner";

interface OrderData {
  _id: string;
  totalPrice: number;
  shippingPrice: number;
  itemsPrice: number;
  orderItems: any[];
  shippingAddress: {
    address: string;
    city: string;
    postalCode: string;
    country: string;
  };
  paymentMethod: string;
  createdAt: string;
  isPaid: boolean;
  isDelivered: boolean;
}

type PaymentStatus = 'pending' | 'success' | 'failed' | 'unknown';

export default function OrderConfirmation() {
  const router = useRouter();
  const { user } = useAuth();
  const { orderId, vnp_ResponseCode } = router.query;
  const [order, setOrder] = useState<OrderData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [redirectCountdown, setRedirectCountdown] = useState(5);

  useEffect(() => {
    if (!orderId) return;

    const initializeOrder = async () => {
      try {
        // First, check if this is a VNPay return
        if (vnp_ResponseCode) {
          const isSuccess = vnp_ResponseCode === '00';
          setPaymentStatus(isSuccess ? 'success' : 'failed');

          // Try to update order payment status on backend
          if (isSuccess) {
            try {
              await orderAPI.confirmPayment(orderId as string);
            } catch (error) {
              console.error('Failed to confirm payment on backend:', error);
            }
          }
        }

        // Get order from storage (for COD, Bank, Card) or fetch from backend (for VNPay return)
        let orderData: OrderData | null = null;

        const storedOrder = sessionStorage.getItem('lastOrder');
        if (storedOrder) {
          try {
            orderData = JSON.parse(storedOrder);
            sessionStorage.removeItem('lastOrder');
          } catch (error) {
            console.error('Failed to parse stored order:', error);
          }
        }

        // If no stored order but we have orderId and VNPay response, try fetching from backend
        if (!orderData && vnp_ResponseCode) {
          try {
            const response = await orderAPI.getOrder(orderId as string);
            orderData = response.order || response;
          } catch (error) {
            console.error('Failed to fetch order from backend:', error);
          }
        }

        // Also check checkoutOrder (for VNPay flow)
        if (!orderData) {
          const checkoutOrder = sessionStorage.getItem('checkoutOrder');
          if (checkoutOrder) {
            try {
              orderData = JSON.parse(checkoutOrder);
              sessionStorage.removeItem('checkoutOrder');
            } catch (error) {
              console.error('Failed to parse checkout order:', error);
            }
          }
        }

        if (orderData) {
          setOrder(orderData);
        }
      } catch (error) {
        console.error('Failed to initialize order:', error);
        toast.error('Không thể tải thông tin đơn hàng');
      } finally {
        setIsLoading(false);
      }
    };

    initializeOrder();
  }, [orderId, vnp_ResponseCode]);

  // Auto-redirect to order-success page
  // For non-VNPay: after 5 seconds
  // For VNPay: after 10 seconds (let user see payment status)
  useEffect(() => {
    if (!isLoading && order) {
      const isVNPayReturn = !!vnp_ResponseCode;
      const delaySeconds = isVNPayReturn ? 10 : 5;
      let countdown = delaySeconds;

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
  }, [isLoading, order, router, vnp_ResponseCode]);

  if (!orderId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1>Không tìm thấy đơn hàng</h1>
          <p className="text-gray-600 mt-2">Vui lòng quay lại trang chủ</p>
          <Button className="mt-4" onClick={() => router.push("/")}>
            Về trang chủ
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
          <p className="text-gray-600">Đang tải thông tin đơn hàng...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1>Không tìm thấy thông tin đơn hàng</h1>
          <p className="text-gray-600 mt-2">ID: {orderId}</p>
          <Button className="mt-4" onClick={() => router.push("/")}>
            Về trang chủ
          </Button>
        </div>
      </div>
    );
  }

  const getStatusIcon = () => {
    if (paymentStatus === 'success') {
      return <CheckCircle className="w-12 h-12 text-green-600" />;
    } else if (paymentStatus === 'failed') {
      return <XCircle className="w-12 h-12 text-red-600" />;
    }
    return <CheckCircle className="w-12 h-12 text-green-600" />;
  };

  const getStatusColor = () => {
    if (paymentStatus === 'success') return 'text-green-600';
    if (paymentStatus === 'failed') return 'text-red-600';
    return 'text-blue-600';
  };

  const getStatusMessage = () => {
    if (paymentStatus === 'success') {
      return 'Thanh toán thành công! ✓';
    } else if (paymentStatus === 'failed') {
      return 'Thanh toán thất bại ✗';
    }
    return 'Chờ xử lý thanh toán';
  };

  return (
    <div className="container mx-auto px-4 py-8 animate-in fade-in duration-300">
      <Breadcrumbs
        links={[
          { label: "Trang chủ", href: "/" },
          { label: "Xác nhận đơn hàng" },
        ]}
      />

      <div className="max-w-2xl mx-auto">
        {/* Success/Status Message */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className={`${
              paymentStatus === 'success' ? 'bg-green-100' :
              paymentStatus === 'failed' ? 'bg-red-100' :
              'bg-blue-100'
            } rounded-full p-4`}>
              {getStatusIcon()}
            </div>
          </div>
          <h1 className={`text-3xl font-bold mb-2 ${getStatusColor()}`}>
            Đặt hàng thành công!
          </h1>
          {paymentStatus === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 font-semibold mb-2">⚠️ Thanh toán thất bại</p>
              <p className="text-red-700 text-sm">
                Thanh toán VNPay đã bị hủy. Vui lòng thử lại hoặc liên hệ hỗ trợ khách hàng.
              </p>
            </div>
          )}
          {paymentStatus === 'success' && (
            <p className="text-gray-600">
              Thanh toán VNPay đã được xác nhận thành công. Cảm ơn bạn đã tin tưởng LaptopStore.
            </p>
          )}
          {paymentStatus === 'pending' && (
            <p className="text-gray-600">
              Cảm ơn bạn đã tin tưởng LaptopStore. Đơn hàng của bạn đã được tạo thành công.
            </p>
          )}
        </div>

        {/* Order Details Card */}
        <div className="bg-white rounded-lg border shadow-sm p-6 mb-6">
          <div className="flex justify-between items-start mb-6 pb-6 border-b">
            <div>
              <h2 className="text-lg font-semibold mb-2">Mã đơn hàng</h2>
              <p className="text-2xl font-bold text-red-600 font-mono">
                {order._id}
              </p>
            </div>
            <Badge className="bg-blue-100 text-blue-800">
              {new Date(order.createdAt).toLocaleDateString("vi-VN")}
            </Badge>
          </div>

          {/* Status Summary */}
          <div className="grid grid-cols-2 gap-4 mb-6 pb-6 border-b">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">Trạng thái đơn hàng</p>
                <p className="font-semibold text-orange-600">Chờ xử lý</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">Trạng thái thanh toán</p>
                <p className="font-semibold text-orange-600">Chờ thanh toán</p>
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          <div className="mb-6 pb-6 border-b">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-600 mb-2">Địa chỉ giao hàng</p>
                <p className="font-semibold">{order.shippingAddress.address}</p>
                <p className="text-sm text-gray-600">
                  {order.shippingAddress.city}, {order.shippingAddress.postalCode}, {order.shippingAddress.country}
                </p>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">Chi tiết sản phẩm</h3>
            <div className="space-y-3">
              {order.orderItems.map((item, index) => (
                <div key={index} className="flex justify-between items-center pb-3 border-b last:border-b-0">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-gray-600">Số lượng: {item.qty}</p>
                  </div>
                  <p className="font-semibold text-red-600">
                    {formatCurrency(item.price * item.qty)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Price Summary */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-gray-700">
              <span>Tạm tính:</span>
              <span>{formatCurrency(order.itemsPrice)}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Phí vận chuyển:</span>
              <span>{formatCurrency(order.shippingPrice)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-red-600 border-t pt-2">
              <span>Tổng cộng:</span>
              <span>{formatCurrency(order.totalPrice)}</span>
            </div>
            <div className="pt-2 text-sm text-gray-600">
              <p>Phương thức thanh toán: <span className="font-semibold">{
                order.paymentMethod === "cod" ? "Thanh toán khi nhận hàng (COD)" :
                order.paymentMethod === "bank" ? "Chuyển khoản ngân hàng" :
                order.paymentMethod === "card" ? "Thanh toán bằng thẻ" :
                order.paymentMethod
              }</span></p>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h3 className="font-semibold text-blue-900 mb-3">Tiếp theo</h3>
          <ul className="space-y-2 text-blue-800 text-sm">
            <li className="flex items-start gap-2">
              <span className="font-bold">1.</span>
              <span>Chúng tôi sẽ xác nhận đơn hàng của bạn qua email</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">2.</span>
              <span>Hoàn thành thanh toán theo phương thức bạn chọn</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">3.</span>
              <span>Đơn hàng sẽ được giao hàng trong 2-3 ngày</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">4.</span>
              <span>Theo dõi trạng thái đơn hàng tại trang "Đơn hàng của tôi"</span>
            </li>
          </ul>
        </div>

        {/* Redirect Countdown */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-center">
          <p className="text-blue-800">
            Chuyển hướng đến danh sách đơn hàng trong <span className="font-bold text-blue-900">{redirectCountdown}s</span>...
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 flex-col sm:flex-row">
          <Button
            onClick={() => router.push("/order-success")}
            className="flex-1 bg-red-600 hover:bg-red-700"
          >
            Xem thống kê đơn hàng
          </Button>
          <Button
            onClick={() => router.push("/")}
            variant="outline"
            className="flex-1"
          >
            Tiếp tục mua hàng
          </Button>
        </div>
      </div>
    </div>
  );
}
