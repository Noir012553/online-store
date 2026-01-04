import React, { useRef } from 'react';
import { useCheckout, CardDetails } from '../../context/CheckoutContext';
import { Button } from '../ui/button';
import { formatCurrency } from '../../lib/utils';
import { useCart } from '../../lib/context/CartContext';
import { CardPaymentForm, cardValidation } from './CardPaymentForm';
import { VNPayPaymentForm } from './VNPayPaymentForm';
import { toast } from 'sonner';

interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branch: string;
}

const bankAccounts: BankAccount[] = [
  {
    bankName: 'Ngân hàng Vietcombank',
    accountNumber: '1012345678',
    accountHolder: 'LAPTOP STORE',
    branch: 'Chi nhánh Hà Nội',
  },
  {
    bankName: 'Ngân hàng Techcombank',
    accountNumber: '9876543210',
    accountHolder: 'LAPTOP STORE',
    branch: 'Chi nhánh Hồ Chí Minh',
  },
];

export function Step4PaymentDetails() {
  const { formData, setFormData, goNext, goBack } = useCheckout();
  const { totalPrice } = useCart();
  const cardFormRef = useRef<HTMLDivElement>(null);
  const [isValidatingCard, setIsValidatingCard] = React.useState(false);
  const [showDemoInfo, setShowDemoInfo] = React.useState(true);

  const shippingFee = 0; // Will be calculated from context in real implementation
  const finalTotal = totalPrice + shippingFee;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Đã copy ${label}`);
  };

  const handleCardDetailsChange = (details: CardDetails) => {
    setFormData({ cardDetails: details });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // If card payment, validate card details
    if (formData.paymentMethod === 'card') {
      setIsValidatingCard(true);

      const cardDetails = formData.cardDetails;
      if (!cardDetails) {
        toast.error('Vui lòng điền đầy đủ thông tin thẻ');
        setIsValidatingCard(false);
        return;
      }

      // Use centralized validation
      const errors = cardValidation.validateAllFields(cardDetails);
      if (Object.keys(errors).length > 0) {
        const errorMessages = Object.values(errors).join(', ');
        toast.error(errorMessages);
        setIsValidatingCard(false);
        return;
      }

      setIsValidatingCard(false);
    }

    if (goNext()) {
      const methodLabel = formData.paymentMethod === 'card' ? 'thẻ' : 'thanh toán';
      toast.success(`Xác nhận ${methodLabel} thành công`);
    }
  };

  const renderPaymentDetails = () => {
    switch (formData.paymentMethod) {
      case 'cod':
        return (
          <div className="space-y-6">
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="text-3xl">💵</div>
                <div className="flex-1">
                  <h3 className="font-bold text-green-900 text-lg mb-2">Thanh toán khi nhận hàng (COD)</h3>
                  <p className="text-green-800 text-sm mb-4">
                    Bạn sẽ thanh toán trực tiếp cho nhân viên giao hàng khi nhận sản phẩm.
                  </p>
                  <div className="bg-white rounded p-3 text-sm text-gray-700">
                    <p className="font-semibold mb-2">Quy trình:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Kiểm tra sản phẩm khi nhận hàng</li>
                      <li>Thanh toán tiền mặt hoặc chuyển khoản</li>
                      <li>Nhân viên sẽ cung cấp biên lai</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* COD Demo Info */}
            <div className="border border-blue-200 rounded-lg bg-blue-50 p-4">
              <button
                type="button"
                onClick={() => setShowDemoInfo(!showDemoInfo)}
                className="w-full flex items-center justify-between text-left font-semibold text-blue-900 hover:text-blue-700 transition"
              >
                <span>🧪 Thông tin COD Demo</span>
                <svg
                  className={`w-5 h-5 transition-transform ${showDemoInfo ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
              {showDemoInfo && (
                <div className="mt-3 bg-white rounded p-3 text-sm text-gray-700">
                  <p>Không cần nhập thông tin gì thêm. Chỉ cần xác nhận đơn hàng và thanh toán với tài xế khi nhận hàng.</p>
                </div>
              )}
            </div>
          </div>
        );

      case 'vnpay':
        return (
          <div className="space-y-6">
            <VNPayPaymentForm
              amount={finalTotal}
              isSubmitting={isValidatingCard}
            />

            {/* VNPay Demo Info */}
            <div className="border border-blue-200 rounded-lg bg-blue-50 p-4">
              <button
                type="button"
                onClick={() => setShowDemoInfo(!showDemoInfo)}
                className="w-full flex items-center justify-between text-left font-semibold text-blue-900 hover:text-blue-700 transition"
              >
                <span>🧪 Thông tin Thẻ Test VNPay (Sandbox)</span>
                <svg
                  className={`w-5 h-5 transition-transform ${showDemoInfo ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
              {showDemoInfo && (
                <div className="mt-3 bg-white rounded p-3 space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700"><strong>Số thẻ:</strong> 9704198526191432198</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard('9704198526191432198', 'số thẻ')}
                      className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700"><strong>Tên chủ:</strong> NGUYEN VAN A</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard('NGUYEN VAN A', 'tên chủ')}
                      className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700"><strong>Ngày:</strong> 07/15</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard('07/15', 'ngày phát hành')}
                      className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700"><strong>OTP:</strong> 123456</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard('123456', 'OTP')}
                      className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                    >
                      📋 Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'bank':
        return (
          <div className="space-y-6">
            <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="text-3xl">🏛️</div>
                <div className="flex-1">
                  <h3 className="font-bold text-purple-900 text-lg mb-2">Chuyển khoản ngân hàng</h3>
                  <p className="text-purple-800 text-sm mb-4">
                    Chuyển tiền trực tiếp đến tài khoản của chúng tôi. Vui lòng sử dụng mã đơn hàng làm nội dung chuyển khoản.
                  </p>
                  <div className="space-y-3">
                    {bankAccounts.map((bank, index) => (
                      <div key={index} className="bg-white rounded p-3 text-sm text-gray-700">
                        <p className="font-semibold text-gray-900">{bank.bankName} - {bank.branch}</p>
                        <p className="text-gray-600 mt-1">
                          <span className="font-medium">Chủ tài khoản:</span> {bank.accountHolder}
                        </p>
                        <p className="text-gray-600">
                          <span className="font-medium">Số tài khoản:</span> {bank.accountNumber}
                        </p>
                        <p className="text-gray-600">
                          <span className="font-medium">Nội dung:</span> Mã đơn hàng (sẽ được cung cấp)
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'card':
        return (
          <div ref={cardFormRef}>
            <CardPaymentForm
              cardDetails={formData.cardDetails}
              onCardDetailsChange={handleCardDetailsChange}
              isSubmitting={isValidatingCard}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Xác nhận phương thức thanh toán</h2>
      <p className="text-gray-600 mb-6">Kiểm tra lại thông tin thanh toán của bạn</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {renderPaymentDetails()}

        <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
          <h3 className="font-bold text-gray-900 mb-4">Tóm tắt đơn hàng</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-gray-700">
              <span>Tạm tính:</span>
              <span className="font-medium text-gray-900">{formatCurrency(totalPrice)}</span>
            </div>
            <div className="flex justify-between items-center text-gray-700">
              <span>Phí vận chuyển:</span>
              <span className="font-medium text-green-600">Miễn phí</span>
            </div>
            <div className="border-t border-gray-300 pt-3 flex justify-between items-center">
              <span className="font-bold text-gray-900">Tổng thanh toán:</span>
              <span className="text-2xl font-bold text-red-600">{formatCurrency(finalTotal)}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <Button
            type="button"
            onClick={goBack}
            disabled={isValidatingCard}
            className="bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold px-8 py-3 h-11 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Quay lại
          </Button>
          <Button
            type="submit"
            disabled={isValidatingCard}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 h-11 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Tiếp tục
          </Button>
        </div>
      </form>
    </div>
  );
}
