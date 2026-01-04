import React, { useState } from 'react';
import { formatCurrency } from '../../lib/utils';
import { Button } from '../ui/button';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  image: string;
}

interface OrderConfirmationDialogProps {
  isOpen: boolean;
  items: OrderItem[];
  totalPrice: number;
  shippingFee: number;
  shippingMethod: string;
  paymentMethod: string;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function OrderConfirmationDialog({
  isOpen,
  items,
  totalPrice,
  shippingFee,
  shippingMethod,
  paymentMethod,
  onConfirm,
  onCancel,
  isSubmitting = false,
}: OrderConfirmationDialogProps) {
  if (!isOpen) return null;

  const finalTotal = totalPrice + shippingFee;
  const paymentMethodLabel: Record<string, string> = {
    cod: '💵 Thanh toán khi nhận hàng',
    vnpay: '🏦 Thanh toán qua VNPay',
    bank: '🏛️ Chuyển khoản ngân hàng',
    card: '💳 Thanh toán bằng thẻ',
    momo: '📱 Ví MoMo',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white px-6 py-4 sticky top-0">
          <h2 className="text-2xl font-bold">Xác nhận đơn hàng</h2>
          <p className="text-red-100 text-sm mt-1">Vui lòng kiểm tra lại thông tin trước khi đặt hàng</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Items Summary */}
          <div>
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              📦 {items.length} sản phẩm
            </h3>
            <div className="space-y-2 max-h-32 overflow-y-auto bg-gray-50 rounded-lg p-3">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between items-start gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{item.name}</p>
                    <p className="text-gray-600 text-xs">x{item.quantity}</p>
                  </div>
                  <p className="font-bold text-red-600 whitespace-nowrap">
                    {formatCurrency(item.price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="border-t border-gray-200 pt-4 space-y-2">
            <div className="flex justify-between items-center text-gray-700">
              <span>Tạm tính:</span>
              <span className="font-medium">{formatCurrency(totalPrice)}</span>
            </div>
            <div className="flex justify-between items-center text-gray-700">
              <span>Vận chuyển ({shippingMethod}):</span>
              <span className={`font-medium ${shippingFee === 0 ? 'text-green-600' : 'text-red-600'}`}>
                {shippingFee === 0 ? 'Miễn phí' : formatCurrency(shippingFee)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="font-bold text-gray-900">Tổng cộng:</span>
              <span className="text-2xl font-bold text-red-600">{formatCurrency(finalTotal)}</span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-blue-900">Phương thức thanh toán:</span>
              <br />
              <span className="text-blue-700 mt-1 inline-block">
                {paymentMethodLabel[paymentMethod] || paymentMethod}
              </span>
            </p>
          </div>

          {/* Terms Agreement */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-gray-600">
              ✓ Tôi đồng ý với {' '}
              <span className="font-semibold text-amber-900">điều khoản dịch vụ</span>
              {' '} và{' '}
              <span className="font-semibold text-amber-900">chính sách bảo mật</span>
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 px-6 py-4 flex gap-3 sticky bottom-0 bg-white">
          <Button
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-2 rounded-lg h-10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Hủy
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-lg h-10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang xử lý...
              </>
            ) : (
              'Đặt hàng'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
