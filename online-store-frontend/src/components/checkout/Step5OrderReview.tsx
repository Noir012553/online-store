import { useState } from 'react';
import { useRouter } from 'next/router';
import { useCheckout } from '../../context/CheckoutContext';
import { useCart } from '../../lib/context/CartContext';
import { useAuth } from '../../lib/context/AuthContext';
import { Button } from '../ui/button';
import { formatCurrency } from '../../lib/utils';
import { toast } from 'sonner';
import { orderAPI } from '../../lib/api';

export function Step5OrderReview() {
  const router = useRouter();
  const { formData, goBack } = useCheckout();
  const { items, totalPrice, clearCart } = useCart();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const finalTotal = totalPrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error('Vui lòng đăng nhập để tiếp tục');
      router.push('/login');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create order via backend API
      const orderData = {
        orderItems: items.map((item) => {
          // Ensure product ID is properly extracted (_id from backend or id from cart)
          const productId = item.laptop.id || item.laptop._id;
          if (!productId) {
            throw new Error(`Invalid product in cart: ${item.laptop.name}`);
          }
          return {
            product: productId,
            name: item.laptop.name,
            qty: item.quantity,
            image: item.laptop.image,
            price: item.laptop.price,
          };
        }),
        itemsPrice: totalPrice,
        taxPrice: 0,
        totalPrice: finalTotal,
        customerName: formData.name,
        customerEmail: user?.email || formData.email || '',
        customerPhone: formData.phone,
      };

      const orderResponse = await orderAPI.createOrder(orderData);
      const order = orderResponse.order || orderResponse;
      const orderId = order._id || order.id;

      if (!orderId) {
        throw new Error('Không thể tạo đơn hàng');
      }

      toast.success('Đơn hàng đã được tạo thành công!');
      clearCart();
      router.push(`/my-orders?newOrder=${orderId}`);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getErrorMessage = (error: any): string => {
    const defaultMessage = 'Không thể tạo đơn hàng. Vui lòng thử lại.';

    if (error instanceof Error) {
      if (error.message.includes('Email already in use')) {
        return 'Email này đã được sử dụng. Vui lòng thử với email khác hoặc cập nhật hồ sơ người dùng.';
      } else if (error.message.includes('Insufficient stock')) {
        return 'Sản phẩm không đủ hàng. Vui lòng kiểm tra lại giỏ hàng.';
      } else if (error.message.includes('No order items')) {
        return 'Giỏ hàng không có sản phẩm.';
      }
      return error.message;
    }

    return defaultMessage;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Xác nhận đơn hàng</h2>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Products */}
            <div>
              <h3 className="font-bold text-lg text-gray-900 mb-4">Danh sách sản phẩm</h3>
              <div className="space-y-3 bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.laptop.id} className="flex gap-4 pb-3 border-b last:border-b-0 last:pb-0">
                    <img
                      src={item.laptop.image}
                      alt={item.laptop.name}
                      className="w-16 h-16 object-cover rounded-lg shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 line-clamp-2">{item.laptop.name}</p>
                      <p className="text-sm text-gray-600 mt-1">Số lượng: {item.quantity}</p>
                      <p className="text-red-600 font-bold mt-1">
                        {formatCurrency(item.laptop.price * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between">
              <Button
                type="button"
                onClick={goBack}
                className="bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold px-8 py-3 h-11"
              >
                Quay lại
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 h-11 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Đang xử lý...
                  </span>
                ) : (
                  'Đặt hàng'
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Order Summary Sidebar */}
      <div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 sticky top-24">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Tóm tắt đơn hàng</h3>

          <div className="space-y-3 mb-6 pb-6 border-b border-gray-200">
            <div className="flex justify-between items-center text-gray-700">
              <span>Tạm tính:</span>
              <span className="font-medium">{formatCurrency(totalPrice)}</span>
            </div>
          </div>

          <div className="flex justify-between items-center mb-4">
            <span className="font-bold text-gray-900">Tổng cộng:</span>
            <span className="text-2xl font-bold text-red-600">{formatCurrency(finalTotal)}</span>
          </div>

          <div className="text-xs text-gray-500 text-center">
            ✓ Đơn hàng sẽ được xử lý • ✓ Bảo vệ quyền lợi người mua
          </div>
        </div>
      </div>
    </div>
  );
}
