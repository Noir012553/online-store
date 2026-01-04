import React, { useState, useEffect } from 'react';
import { useCheckout, ShippingMethod } from '../../context/CheckoutContext';
import { shippingAPI } from '../../lib/api';
import { Button } from '../ui/button';
import { formatCurrency } from '../../lib/utils';
import { toast } from 'sonner';
import { useCart } from '../../lib/context/CartContext';

export function Step2ShippingMethod() {
  const { formData, setFormData, goNext, goBack, setShippingMethods: setContextShippingMethods } = useCheckout();
  const { totalPrice } = useCart();
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchShippingMethods = async () => {
      setIsLoading(true);
      try {
        const data = await shippingAPI.getShippingMethods();
        const methods = Array.isArray(data) ? data : data?.data || [];
        setShippingMethods(methods);
        setContextShippingMethods(methods);

        // Set default shipping method if not set
        if (!formData.shippingMethod && methods.length > 0) {
          setFormData({ shippingMethod: methods[0].id });
        }
      } catch {
        toast.error('Không thể tải phương thức vận chuyển');
      } finally {
        setIsLoading(false);
      }
    };
    fetchShippingMethods();
  }, []);

  const getShippingFee = (method: ShippingMethod) => {
    if (method.freeThreshold && totalPrice >= method.freeThreshold) {
      return 0;
    }
    return method.basePrice;
  };

  const selectedMethod = shippingMethods.find((m) => m.id === formData.shippingMethod);
  const shippingFee = selectedMethod ? getShippingFee(selectedMethod) : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (goNext()) {
      toast.success('Phương thức vận chuyển đã được chọn');
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
        </div>
      </div>
    );
  }

  if (shippingMethods.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded">
          <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Chưa có phương thức vận chuyển
          </h3>
          <p className="text-amber-700 text-sm">
            Hiện tại chưa có phương thức vận chuyển nào được triển khai. Vui lòng quay lại và thử lại sau.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Phương thức vận chuyển</h2>
      <p className="text-gray-600 mb-6">Chọn phương thức vận chuyển phù hợp với nhu cầu của bạn</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shippingMethods.map((method) => {
            const fee = getShippingFee(method);
            const isSelected = formData.shippingMethod === method.id;

            return (
              <div
                key={method.id}
                onClick={() => setFormData({ shippingMethod: method.id })}
                className={`p-6 border-2 rounded-lg cursor-pointer transition-all ${
                  isSelected
                    ? 'border-red-600 bg-red-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-5 h-5 mt-1 rounded-full border-2 flex-shrink-0 ${
                      isSelected
                        ? 'border-red-600 bg-red-600'
                        : 'border-gray-300'
                    }`}
                  >
                    {isSelected && <div className="w-full h-full flex items-center justify-center text-white text-xs">✓</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-lg">{method.name}</h3>
                    <p className="text-gray-600 text-sm mt-1">{method.description}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-sm text-gray-500">
                        Dự kiến: {method.estimatedDays} ngày
                      </span>
                      <span className={`text-lg font-bold ${fee === 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fee === 0 ? 'Miễn phí' : formatCurrency(fee)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-gray-700">
              <span>Tạm tính:</span>
              <span className="font-medium text-gray-900">{formatCurrency(totalPrice)}</span>
            </div>
            <div className="flex justify-between items-center text-gray-700">
              <span>Phí vận chuyển:</span>
              <span className={`font-medium ${shippingFee === 0 ? 'text-green-600' : 'text-red-600'}`}>
                {shippingFee === 0 ? 'Miễn phí' : formatCurrency(shippingFee)}
              </span>
            </div>
            <div className="border-t border-gray-300 pt-2 flex justify-between items-center">
              <span className="font-semibold text-gray-900">Tổng cộng:</span>
              <span className="text-lg font-bold text-red-600">
                {formatCurrency(totalPrice + shippingFee)}
              </span>
            </div>
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
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 h-11"
          >
            Tiếp tục
          </Button>
        </div>
      </form>
    </div>
  );
}
