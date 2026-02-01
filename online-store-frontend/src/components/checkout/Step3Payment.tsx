import { useState } from 'react';
import { useCheckout } from '../../context/CheckoutContext';
import { useCart } from '../../lib/context/CartContext';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { apiCall } from '../../lib/api';
import { useRouter } from 'next/router';
import { CreditCard, Truck, Wallet } from 'lucide-react';

export function Step3Payment() {
  const router = useRouter();
  const { formData, goBack, setFormData } = useCheckout();
  const { items, clearCart } = useCart();
  const [isLoading, setIsLoading] = useState(false);

  const itemsTotal = items.reduce((sum, item) => sum + item.laptop.price * item.quantity, 0);
  const shippingFee = formData.selectedShipping?.fee || 0;
  const totalPrice = itemsTotal + shippingFee;

  const handleSelectPaymentMethod = (method: 'cod' | 'vnpay') => {
    setFormData({ paymentMethod: method });
  };

  const createOrder = async () => {
    try {
      const orderResponse = await apiCall<{ success: boolean; data?: any }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          orderItems: items.map((item) => {
            const productId = item.laptop.id || item.laptop._id;
            if (!productId) {
              throw new Error(`Invalid product in cart: ${item.laptop.name}`);
            }
            return {
              name: item.laptop.name,
              qty: item.quantity,
              image: item.laptop.image,
              price: item.laptop.price,
              product: productId,
            };
          }),
          itemsPrice: itemsTotal,
          taxPrice: 0,
          totalPrice,
          shippingFee,
          customerName: formData.name,
          customerEmail: formData.email,
          customerPhone: formData.phone,
          shippingAddress: formData.shippingAddress,
          shippingProvider: formData.selectedShipping?.provider,
          shippingService: formData.selectedShipping?.serviceType,
          paymentMethod: formData.paymentMethod,
        }),
      });

      if (!orderResponse.success) {
        toast.error('Không thể tạo đơn hàng');
        return null;
      }

      return orderResponse.data._id;
    } catch (error) {
      throw error;
    }
  };

  const createShipment = async (orderId: string) => {
    try {
      const shipmentPayload = {
        orderId,
        shippingProvider: formData.selectedShipping?.provider,
        shippingService: formData.selectedShipping?.serviceType,
        to_name: formData.shippingAddress?.name,
        to_phone: formData.shippingAddress?.phone,
        to_address: formData.shippingAddress?.address,
        to_district_id: formData.shippingAddress?.districtId,
        to_ward_code: formData.shippingAddress?.wardCode,
        required_note: 'CHOXEMHANGKHONGTHU',
      };

      const shipmentResponse = await apiCall<{ success: boolean }>('/shipments', {
        method: 'POST',
        body: JSON.stringify(shipmentPayload),
      });

      if (!shipmentResponse.success) {
        toast.error('Không thể tạo vận đơn');
        throw new Error('Failed to create shipment');
      }

      return true;
    } catch (error) {
      throw error;
    }
  };

  const handleCOD = async () => {
    try {
      setIsLoading(true);

      // Create order
      const orderId = await createOrder();
      if (!orderId) return;

      // Create shipment
      await createShipment(orderId);

      // Clear cart
      clearCart();

      // Store order data for result page
      sessionStorage.setItem('lastOrder', JSON.stringify({
        _id: orderId,
        totalPrice,
        itemsPrice,
        orderItems: items.map((item) => ({
          name: item.laptop.name,
          qty: item.quantity,
          price: item.laptop.price,
        })),
        paymentMethod: 'cod',
      }));

      // Redirect to result page with COD payment info
      router.push(`/return?method=cod&orderId=${orderId}&amount=${totalPrice}&status=success`);
    } catch (error) {
      toast.error('Có lỗi xảy ra khi xử lý đơn hàng');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVNPAY = async () => {
    try {
      setIsLoading(true);

      // Create order
      const orderId = await createOrder();
      if (!orderId) {
        toast.error('Không thể lấy được ID đơn hàng');
        return;
      }

      // Create shipment
      await createShipment(orderId);

      // Initiate payment with VNPAY
      const paymentPayload = {
        orderId,
        gateway: 'vnpay',
        amount: totalPrice,
        customerInfo: {
          email: formData.email,
          name: formData.name,
          phone: formData.phone,
        },
      };

      const paymentResponse = await apiCall<{ success: boolean; data?: any }>('/payments/initiate', {
        method: 'POST',
        body: JSON.stringify(paymentPayload),
      });

      if (!paymentResponse.success) {
        toast.error('Không thể tạo link thanh toán');
        return;
      }

      const redirectUrl = paymentResponse.data?.redirectUrl;
      if (!redirectUrl) {
        toast.error('Không nhận được link thanh toán từ VNPAY');
        return;
      }

      // Clear cart before redirecting
      clearCart();

      // Redirect to VNPAY payment page
      window.location.href = redirectUrl;
    } catch (error) {
      toast.error('Có lỗi xảy ra khi khởi tạo thanh toán');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedMethod = formData.paymentMethod;

  return (
    <div className="space-y-6">
      {/* Price Summary */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <Wallet className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">Tóm tắt đơn hàng</h2>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-gray-700">
            <span>Tổng tiền hàng</span>
            <span className="font-semibold">{itemsTotal.toLocaleString('vi-VN')} đ</span>
          </div>
          <div className="flex justify-between text-gray-700">
            <span>Phí vận chuyển</span>
            <span className="font-semibold">{shippingFee.toLocaleString('vi-VN')} đ</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-gray-900 pt-3 border-t">
            <span>Tổng cộng</span>
            <span className="text-red-600">{totalPrice.toLocaleString('vi-VN')} đ</span>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <CreditCard className="w-6 h-6 text-purple-600" />
          <h2 className="text-2xl font-bold text-gray-900">Chọn hình thức thanh toán</h2>
        </div>

        <div className="space-y-4">
          {/* COD Option */}
          <div
            onClick={() => handleSelectPaymentMethod('cod')}
            className={`border-2 rounded-lg p-6 cursor-pointer transition-all ${
              selectedMethod === 'cod'
                ? 'border-green-600 bg-green-50'
                : 'border-gray-200 hover:border-green-300'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                  selectedMethod === 'cod' ? 'border-green-600 bg-green-600' : 'border-gray-300'
                }`}
              >
                {selectedMethod === 'cod' && (
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-green-600" />
                  <h3 className="font-bold text-gray-900">Thanh toán khi nhận hàng (COD)</h3>
                </div>
                <p className="text-sm text-gray-600 mt-1 ml-7">
                  Bạn sẽ thanh toán tiền khi nhân viên giao hàng đến
                </p>
              </div>
            </div>
          </div>

          {/* VNPAY Option */}
          <div
            onClick={() => handleSelectPaymentMethod('vnpay')}
            className={`border-2 rounded-lg p-6 cursor-pointer transition-all ${
              selectedMethod === 'vnpay'
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                  selectedMethod === 'vnpay' ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                }`}
              >
                {selectedMethod === 'vnpay' && (
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <img src="/assets/vnpay.svg" alt="VNPAY" className="h-6 w-auto" />
                  <h3 className="font-bold text-gray-900">Thanh toán qua VNPAY</h3>
                </div>
                <p className="text-sm text-gray-600 mt-1 ml-9">
                  Thanh toán an toàn bằng thẻ ngân hàng, ví điện tử hoặc tài khoản ngân hàng
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex justify-between gap-4">
          <Button
            type="button"
            onClick={goBack}
            variant="outline"
            className="flex-1 px-8 py-3 h-11"
          >
            Quay lại
          </Button>
          <Button
            onClick={() => {
              if (!selectedMethod) {
                toast.error('Vui lòng chọn hình thức thanh toán');
                return;
              }

              if (selectedMethod === 'cod') {
                handleCOD();
              } else {
                handleVNPAY();
              }
            }}
            disabled={isLoading || !selectedMethod}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 h-11 disabled:opacity-50"
          >
            {isLoading ? 'Đang xử lý...' : selectedMethod === 'vnpay' ? 'Thanh toán VNPAY' : 'Xác nhận đơn hàng'}
          </Button>
        </div>
      </div>
    </div>
  );
}
