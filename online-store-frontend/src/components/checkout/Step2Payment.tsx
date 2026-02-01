import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useCheckout } from '../../context/CheckoutContext';
import { useCart } from '../../lib/context/CartContext';
import { useAuth } from '../../lib/context/AuthContext';
import { Button } from '../ui/button';
import { formatCurrency } from '../../lib/utils';
import { toast } from 'sonner';

export function Step2Payment() {
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
      const orderData = {
        orderItems: items.map((item) => ({
          product: item.laptop.id,
          name: item.laptop.name,
          qty: item.quantity,
          image: item.laptop.image,
          price: item.laptop.price,
        })),
        taxPrice: 0,
        totalPrice: finalTotal,
        customerName: formData.name,
        customerEmail: user?.email || formData.email || '',
        customerPhone: formData.phone,
      };

      const orderResponse = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      if (!orderResponse.ok) {
        const error = await orderResponse.json();
        throw new Error(error.message || 'Không thể tạo đơn hàng');
      }

      const orderResult = await orderResponse.json();
      const orderId = orderResult.order._id || orderResult.order.id;

      toast.success('Đơn hàng đã được tạo');

      clearCart();
      router.push(`/order-confirmation?orderId=${orderId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Không thể xử lý đơn hàng. Vui lòng thử lại.';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Xác nhận đơn hàng</h2>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-gray-700">
                <strong>Phương thức thanh toán:</strong> Thanh toán khi nhận hàng (COD)
              </p>
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
                  'Xác nhận'
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

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
            ✓ Bảo vệ quyền lợi người mua
          </div>
        </div>
      </div>
    </div>
  );
}
