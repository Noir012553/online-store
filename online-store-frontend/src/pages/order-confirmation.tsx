import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { CheckCircle, Package } from "lucide-react";
import { formatCurrency, formatDate } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { orderAPI } from "../lib/api";
import { useAuth } from "../lib/context/AuthContext";
import { toast } from "sonner";

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
  const { orderId } = router.query;
  const [order, setOrder] = useState<OrderData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [redirectCountdown, setRedirectCountdown] = useState(5);

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

        // If no stored order, try fetching from backend
        if (!orderData) {
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
        toast.error('Không thể tải thông tin đơn hàng');
      } finally {
        setIsLoading(false);
      }
    };

    initializeOrder();
  }, [orderId]);

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

  return (
    <div className="container mx-auto px-4 py-8 animate-in fade-in duration-300">
      <Breadcrumbs
        links={[
          { label: "Trang chủ", href: "/" },
          { label: "Xác nhận đơn hàng" },
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
            Đặt hàng thành công!
          </h1>
          <p className="text-gray-600">
            Cảm ơn bạn đã tin tưởng LaptopStore. Đơn hàng của bạn đã được tạo thành công.
          </p>
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
          <div className="grid grid-cols-1 gap-4 mb-6 pb-6 border-b">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">Trạng thái đơn hàng</p>
                <p className="font-semibold text-orange-600">Chờ xử lý</p>
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
            <div className="flex justify-between text-lg font-bold text-red-600">
              <span>Tổng cộng:</span>
              <span>{formatCurrency(order.totalPrice)}</span>
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
              <span>Đơn hàng sẽ được chuẩn bị giao hàng trong 1-2 ngày</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">3.</span>
              <span>Bạn sẽ nhận được thông báo khi đơn hàng được giao</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">4.</span>
              <span>Theo dõi trạng thái đơn hàng tại trang "Đơn hàng của tôi"</span>
            </li>
          </ul>
        </div>

        {/* Redirect Countdown or VNPAY Info */}
        {order.paymentMethod === 'vnpay' ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">⏳ Chờ xử lý thanh toán</h3>
            <p className="text-blue-800 text-sm">
              Bạn đã tạo đơn hàng thành công. Vui lòng hoàn tất thanh toán VNPAY để xác nhận đơn hàng.
            </p>
            <p className="text-blue-700 text-sm mt-2">
              Bạn sẽ được chuyển hướng tới trang thanh toán VNPAY. Sau khi thanh toán thành công,
              vui lòng chờ xác nhận từ hệ thống.
            </p>
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-center">
            <p className="text-blue-800">
              Chuyển hướng đến danh sách đơn hàng trong <span className="font-bold text-blue-900">{redirectCountdown}s</span>...
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
                Xem chi tiết đơn hàng
              </Button>
              <Button
                onClick={() => router.push("/")}
                variant="outline"
                className="flex-1"
              >
                Tiếp tục mua hàng
              </Button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
