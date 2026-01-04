import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useCheckout, PaymentMethod, ShippingMethod } from '../../context/CheckoutContext';
import { useCart } from '../../lib/context/CartContext';
import { useAuth } from '../../lib/context/AuthContext';
import { Button } from '../ui/button';
import { formatCurrency } from '../../lib/utils';
import { OrderConfirmationDialog } from './OrderConfirmationDialog';
import { toast } from 'sonner';
import { PaymentProcessingService } from '../../services/payment/PaymentProcessingService';

export function Step5OrderReview() {
  const router = useRouter();
  const { formData, paymentMethods, shippingMethods, goBack } = useCheckout();
  const { items, totalPrice, clearCart } = useCart();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const selectedPaymentMethod = paymentMethods.find((m) => m.id === formData.paymentMethod);
  const selectedShippingMethod = shippingMethods.find((m) => m.id === formData.shippingMethod);

  // Calculate shipping fee
  const getShippingFee = () => {
    if (!selectedShippingMethod) return 0;
    if (selectedShippingMethod.freeThreshold && totalPrice >= selectedShippingMethod.freeThreshold) {
      return 0;
    }
    return selectedShippingMethod.basePrice;
  };

  const shippingFee = getShippingFee();
  const finalTotal = totalPrice + shippingFee;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error('Vui lòng đăng nhập để tiếp tục');
      router.push('/login');
      return;
    }

    // Show confirmation dialog instead of submitting directly
    setShowConfirmDialog(true);
  };

  const handleConfirmOrder = async () => {
    setIsSubmitting(true);
    try {
      // Prepare order data
      const orderData = {
        orderItems: items.map((item) => ({
          product: item.laptop.id,
          name: item.laptop.name,
          qty: item.quantity,
          image: item.laptop.image,
          price: item.laptop.price,
        })),
        shippingAddress: {
          address: formData.address,
          city: formData.province,
          postalCode: formData.ward || formData.district,
          country: 'Vietnam',
        },
        paymentMethod: formData.paymentMethod,
        itemsPrice: totalPrice,
        shippingPrice: shippingFee,
        taxPrice: 0,
        totalPrice: finalTotal,
        customerName: formData.name,
        customerEmail: user?.email || formData.email || '',
        customerPhone: formData.phone,
        note: formData.note,
      };

      // Use Payment Processing Service to handle payment
      const result = await PaymentProcessingService.processPayment(
        orderData,
        formData.paymentMethod,
        formData
      );

      if (!result.success) {
        toast.error(result.error || 'Không thể xử lý thanh toán');
        setShowConfirmDialog(false);
        return;
      }

      const orderId = result.order?._id || result.order?.id;
      const paymentResult = result.paymentResult;

      // Handle different payment result actions
      if (paymentResult?.nextAction === 'redirect') {
        // For VNPay - will redirect to payment gateway
        clearCart();
        PaymentProcessingService.handlePaymentRedirect(paymentResult);
      } else if (paymentResult?.nextAction === 'navigate') {
        // For COD, Bank, Card - navigate to orders page
        toast.success(paymentResult?.message || 'Đơn hàng đã được tạo thành công!');
        clearCart();
        setShowConfirmDialog(false);
        router.push(`/my-orders?newOrder=${orderId}`);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
      console.error(error);
      setShowConfirmDialog(false);
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
            {/* Shipping Information */}
            <div>
              <h3 className="font-bold text-lg text-gray-900 mb-4">Thông tin giao hàng</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-gray-700">
                <p>
                  <span className="font-medium">Người nhận:</span> {formData.name}
                </p>
                <p>
                  <span className="font-medium">Số điện thoại:</span> {formData.phone}
                </p>
                {formData.email && (
                  <p>
                    <span className="font-medium">Email:</span> {formData.email}
                  </p>
                )}
                <p>
                  <span className="font-medium">Địa chỉ:</span> {formData.address}, {formData.ward || formData.district}, {formData.province}
                </p>
                {formData.note && (
                  <p>
                    <span className="font-medium">Ghi chú:</span> {formData.note}
                  </p>
                )}
              </div>
            </div>

            {/* Shipping Method */}
            <div>
              <h3 className="font-bold text-lg text-gray-900 mb-4">Phương thức vận chuyển</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-gray-700">
                <p>
                  <span className="font-medium">Phương thức:</span> {selectedShippingMethod?.name}
                </p>
                <p>
                  <span className="font-medium">Dự kiến:</span> {selectedShippingMethod?.estimatedDays} ngày
                </p>
                <p>
                  <span className="font-medium">Phí:</span>{' '}
                  <span className={shippingFee === 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                    {shippingFee === 0 ? 'Miễn phí' : formatCurrency(shippingFee)}
                  </span>
                </p>
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <h3 className="font-bold text-lg text-gray-900 mb-4">Phương thức thanh toán</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-gray-700">
                <p>
                  <span className="font-medium">Phương thức:</span> {selectedPaymentMethod?.name}
                </p>
                <p className="text-sm text-gray-600">{selectedPaymentMethod?.description}</p>
              </div>
            </div>

            {/* Products */}
            <div>
              <h3 className="font-bold text-lg text-gray-900 mb-4">Danh sách sản phẩm</h3>
              <div className="space-y-3 bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.laptop.id} className="flex gap-4 pb-3 border-b last:border-b-0 last:pb-0">
                    <img
                      src={item.laptop.image}
                      alt={item.laptop.name}
                      className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
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
            <div className="flex justify-between items-center text-gray-700">
              <span>Phí vận chuyển:</span>
              <span className={`font-medium ${shippingFee === 0 ? 'text-green-600' : 'text-red-600'}`}>
                {shippingFee === 0 ? 'Miễn phí' : formatCurrency(shippingFee)}
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center mb-4">
            <span className="font-bold text-gray-900">Tổng cộng:</span>
            <span className="text-2xl font-bold text-red-600">{formatCurrency(finalTotal)}</span>
          </div>

          <div className="text-xs text-gray-500 text-center">
            ✓ Thanh toán an toàn • ✓ Bảo vệ quyền lợi người mua
          </div>
        </div>
      </div>

      {/* Order Confirmation Dialog */}
      <OrderConfirmationDialog
        isOpen={showConfirmDialog}
        items={items.map((item) => ({
          id: item.laptop.id,
          name: item.laptop.name,
          quantity: item.quantity,
          price: item.laptop.price,
          image: item.laptop.image,
        }))}
        totalPrice={totalPrice}
        shippingFee={shippingFee}
        shippingMethod={selectedShippingMethod?.name || ''}
        paymentMethod={formData.paymentMethod}
        onConfirm={handleConfirmOrder}
        onCancel={() => setShowConfirmDialog(false)}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
