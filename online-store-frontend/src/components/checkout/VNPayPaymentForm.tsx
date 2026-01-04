import React from 'react';
import { formatCurrency } from '../../lib/utils';

interface VNPayPaymentFormProps {
  amount: number;
  isSubmitting?: boolean;
}

export function VNPayPaymentForm({
  amount,
  isSubmitting = false,
}: VNPayPaymentFormProps) {
  return (
    <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="text-3xl">💳</div>
        <div>
          <h3 className="font-bold text-blue-900 text-lg mb-1">Thanh toán qua VNPay</h3>
          <p className="text-blue-800 text-sm">
            Bạn sẽ được chuyển hướng đến trang thanh toán an toàn của VNPay để chọn phương thức thanh toán (thẻ tín dụng, ATM, ví điện tử, v.v.)
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Amount Display */}
        <div className="bg-white rounded-lg p-4 border border-blue-100">
          <div className="flex justify-between items-center">
            <span className="text-gray-700 font-medium">Số tiền cần thanh toán:</span>
            <span className="text-2xl font-bold text-red-600">
              {formatCurrency(amount)}
            </span>
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-white rounded-lg p-4 border border-blue-100">
          <p className="text-gray-700 text-sm">
            <span className="font-semibold text-blue-900">🔒 An toàn:</span> Tất cả thông tin thanh toán của bạn được mã hóa SSL 256-bit và xử lý bởi VNPay. Chúng tôi không lưu trữ thông tin thanh toán trên máy chủ của mình.
          </p>
        </div>

        {/* Benefits */}
        <div className="bg-blue-100 rounded-lg p-4 border border-blue-300">
          <p className="text-blue-900 text-sm font-medium mb-2">✨ Lợi ích của VNPay:</p>
          <ul className="text-blue-900 text-sm space-y-1 list-disc list-inside">
            <li>Thanh toán qua thẻ tín dụng, ATM, hoặc ví điện tử</li>
            <li>Mã hóa SSL 256-bit - An toàn tuyệt đối</li>
            <li>Xác nhận giao dịch tức thì</li>
            <li>Hỗ trợ từ các ngân hàng lớn tại Việt Nam</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
