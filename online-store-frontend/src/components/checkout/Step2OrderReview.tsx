import { useState } from 'react';
import { useCheckout } from '../../context/CheckoutContext';
import { useCart } from '../../lib/context/CartContext';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { apiCall } from '../../lib/api';
import { useRouter } from 'next/router';
import { User, MapPin, Truck, ShoppingCart, Clock, Phone, Mail } from 'lucide-react';

export function Step2OrderReview() {
  const router = useRouter();
  const { formData, goBack, goNext } = useCheckout();
  const { items } = useCart();
  const [isLoading, setIsLoading] = useState(false);

  const itemsTotal = items.reduce((sum, item) => sum + item.laptop.price * item.quantity, 0);
  const shippingFee = formData.selectedShipping?.fee || 0;
  const totalPrice = itemsTotal + shippingFee;

  const handleNext = () => {
    goNext();
  };

  return (
    <div className="space-y-6">
      {/* Customer Info Section */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">Thông tin khách hàng</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-gray-400 mt-1 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-gray-600 font-medium">Họ và tên</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">{formData.name}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-gray-400 mt-1 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-gray-600 font-medium">Số điện thoại</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">{formData.phone}</p>
            </div>
          </div>
          <div className="md:col-span-2 flex items-start gap-3">
            <Mail className="w-5 h-5 text-gray-400 mt-1 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-gray-600 font-medium">Email</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">{formData.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Shipping Address Section */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <MapPin className="w-6 h-6 text-green-600" />
          <h2 className="text-2xl font-bold text-gray-900">Địa chỉ giao hàng</h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
            <p className="text-lg font-semibold text-gray-900">{formData.shippingAddress?.name}</p>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-gray-700">{formData.shippingAddress?.address}</p>
              <p className="text-gray-600 text-sm mt-1">
                {formData.shippingAddress?.wardName}, {formData.shippingAddress?.districtName},{' '}
                {formData.shippingAddress?.provinceName}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
            <p className="text-gray-700">{formData.shippingAddress?.phone}</p>
          </div>
        </div>
      </div>

      {/* Shipping Option Section */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <Truck className="w-6 h-6 text-purple-600" />
          <h2 className="text-2xl font-bold text-gray-900">Dịch vụ vận chuyển</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-gray-600" />
              <p className="text-gray-700 font-medium">Nhà vận chuyển</p>
            </div>
            <p className="font-semibold text-gray-900">{formData.selectedShipping?.providerName}</p>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-gray-600" />
              <p className="text-gray-700 font-medium">Dịch vụ</p>
            </div>
            <p className="font-semibold text-gray-900">{formData.selectedShipping?.serviceName}</p>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-600" />
              <p className="text-gray-700 font-medium">Thời gian giao hàng</p>
            </div>
            <p className="font-semibold text-gray-900">{formData.selectedShipping?.estimatedDays}</p>
          </div>
          <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-gray-700 font-medium">Phí vận chuyển</p>
            <p className="text-lg font-bold text-red-600">
              {formData.selectedShipping?.fee?.toLocaleString('vi-VN')} đ
            </p>
          </div>
        </div>
      </div>

      {/* Order Items Section */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <ShoppingCart className="w-6 h-6 text-orange-600" />
          <h2 className="text-2xl font-bold text-gray-900">Chi tiết đơn hàng</h2>
        </div>

        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.laptop.id} className="flex items-center justify-between py-3 border-b border-gray-200">
              <div className="flex items-center space-x-4">
                {item.laptop.image && (
                  <img
                    src={item.laptop.image}
                    alt={item.laptop.name}
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                )}
                <div>
                  <p className="font-semibold text-gray-900">{item.laptop.name}</p>
                  <p className="text-sm text-gray-600">Số lượng: {item.quantity}</p>
                </div>
              </div>
              <p className="font-semibold text-gray-900">
                {(item.laptop.price * item.quantity).toLocaleString('vi-VN')} đ
              </p>
            </div>
          ))}
        </div>

        {/* Price Summary */}
        <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
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
            onClick={handleNext}
            disabled={isLoading}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 h-11 disabled:opacity-50"
          >
            {isLoading ? 'Đang xử lý...' : 'Tiếp tục thanh toán'}
          </Button>
        </div>
      </div>
    </div>
  );
}
