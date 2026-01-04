import React, { useState, useEffect } from 'react';
import { useCheckout, PaymentMethod } from '../../context/CheckoutContext';
import { paymentAPI } from '../../lib/api';
import { Button } from '../ui/button';
import { toast } from 'sonner';

const paymentIcons: Record<string, string> = {
  cod: '💳',
  vnpay: '🏦',
  bank: '🏛️',
  card: '💳',
  momo: '📱',
  zalopay: '📱',
};

export function Step3PaymentMethod() {
  const { formData, setFormData, goNext, goBack, setPaymentMethods: setContextPaymentMethods } = useCheckout();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPaymentMethods = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await paymentAPI.getPaymentMethods();
        const methods = Array.isArray(data) ? data : data?.data || [];

        if (methods.length === 0) {
          setError('Không có phương thức thanh toán nào được hỗ trợ');
          setPaymentMethods([]);
          return;
        }

        setPaymentMethods(methods);
        setContextPaymentMethods(methods);

        // Set default payment method if not set
        if (!formData.paymentMethod && methods.length > 0) {
          setFormData({ paymentMethod: methods[0].id });
        }
      } catch (err) {
        const errorMsg = 'Không thể tải phương thức thanh toán. Vui lòng thử lại.';
        setError(errorMsg);
        toast.error(errorMsg);
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPaymentMethods();
  }, [formData.paymentMethod, setFormData, setContextPaymentMethods]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (goNext()) {
      toast.success('Phương thức thanh toán đã được chọn');
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex justify-center items-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-sm">Đang tải phương thức thanh toán...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || paymentMethods.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded">
          <h3 className="font-bold text-red-800 mb-2 flex items-center gap-2">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {error || 'Không thể tải phương thức thanh toán'}
          </h3>
          <p className="text-red-700 text-sm mb-4">
            Vui lòng thử lại hoặc quay lại trang trước
          </p>
          <Button
            onClick={goBack}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2 h-10"
          >
            Quay lại
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Phương thức thanh toán</h2>
      <p className="text-gray-600 mb-6">Chọn phương thức thanh toán an toàn và tiện lợi</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {paymentMethods.map((method) => {
            const isSelected = formData.paymentMethod === method.id;
            const icon = paymentIcons[method.id] || '💳';

            return (
              <div
                key={method.id}
                onClick={() => setFormData({ paymentMethod: method.id })}
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
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{icon}</span>
                      <h3 className="font-semibold text-gray-900 text-lg">{method.name}</h3>
                    </div>
                    <p className="text-gray-600 text-sm">{method.description}</p>
                    {method.badge && (
                      <div className="inline-block mt-2 px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-medium">
                        {method.badge}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800 text-sm">
            <span className="font-semibold">ℹ️ Lưu ý:</span> Thông tin thanh toán sẽ được xác nhận ở bước tiếp theo. Tất cả giao dịch đều được mã hóa an toàn.
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
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 h-11"
          >
            Tiếp tục
          </Button>
        </div>
      </form>
    </div>
  );
}
