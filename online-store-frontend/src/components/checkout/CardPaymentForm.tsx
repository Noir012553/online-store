import React, { useState } from 'react';
import { CardDetails } from '../../context/CheckoutContext';

interface CardPaymentFormProps {
  cardDetails: CardDetails | undefined;
  onCardDetailsChange: (details: CardDetails) => void;
  isSubmitting?: boolean;
}

// Reusable validation functions
export const cardValidation = {
  validateCardNumber: (number: string): boolean => {
    const cleaned = number.replace(/\s/g, '');
    return /^\d{13,19}$/.test(cleaned);
  },

  validateExpiry: (date: string): boolean => {
    const regex = /^(0[1-9]|1[0-2])\/\d{2}$/;
    if (!regex.test(date)) return false;

    const [month, year] = date.split('/');
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear() % 100;
    const currentMonth = currentDate.getMonth() + 1;

    const expYear = parseInt(year, 10);
    const expMonth = parseInt(month, 10);

    if (expYear < currentYear) return false;
    if (expYear === currentYear && expMonth < currentMonth) return false;

    return true;
  },

  validateCVV: (cvv: string): boolean => {
    return cvv.length >= 3 && cvv.length <= 4;
  },

  validateCardholderName: (name: string): boolean => {
    return name.trim().length > 0;
  },

  validateAllFields: (cardDetails: CardDetails): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (!cardDetails.cardNumber || !cardValidation.validateCardNumber(cardDetails.cardNumber)) {
      errors.cardNumber = 'Số thẻ không hợp lệ (13-19 chữ số)';
    }

    if (!cardDetails.cardholderName || !cardValidation.validateCardholderName(cardDetails.cardholderName)) {
      errors.cardholderName = 'Vui lòng nhập tên chủ thẻ';
    }

    if (!cardDetails.expiryDate || !cardValidation.validateExpiry(cardDetails.expiryDate)) {
      errors.expiryDate = 'Ngày hết hạn không hợp lệ (MM/YY)';
    }

    if (!cardDetails.cvv || !cardValidation.validateCVV(cardDetails.cvv)) {
      errors.cvv = 'CVV phải có 3-4 chữ số';
    }

    return errors;
  },
};

export function CardPaymentForm({ cardDetails, onCardDetailsChange, isSubmitting = false }: CardPaymentFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const currentDetails = cardDetails || {
    cardNumber: '',
    cardholderName: '',
    expiryDate: '',
    cvv: '',
  };

  const formatCardNumber = (value: string): string => {
    const cleaned = value.replace(/\s/g, '');
    const chunks = cleaned.match(/.{1,4}/g) || [];
    return chunks.join(' ');
  };

  const formatExpiry = (value: string): string => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 2) return cleaned;
    return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`;
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    onCardDetailsChange({
      ...currentDetails,
      cardNumber: formatted,
    });

    if (errors.cardNumber && cardValidation.validateCardNumber(formatted)) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.cardNumber;
        return newErrors;
      });
    }
  };

  const handleCardholderNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onCardDetailsChange({
      ...currentDetails,
      cardholderName: value,
    });

    if (errors.cardholderName && cardValidation.validateCardholderName(value)) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.cardholderName;
        return newErrors;
      });
    }
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatExpiry(e.target.value);
    onCardDetailsChange({
      ...currentDetails,
      expiryDate: formatted,
    });

    if (errors.expiryDate && cardValidation.validateExpiry(formatted)) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.expiryDate;
        return newErrors;
      });
    }
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    onCardDetailsChange({
      ...currentDetails,
      cvv: value,
    });

    if (errors.cvv && cardValidation.validateCVV(value)) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.cvv;
        return newErrors;
      });
    }
  };

  const handleBlurCardNumber = () => {
    if (!cardValidation.validateCardNumber(currentDetails.cardNumber)) {
      setErrors((prev) => ({
        ...prev,
        cardNumber: 'Số thẻ không hợp lệ (13-19 chữ số)',
      }));
    }
  };

  const handleBlurCardholderName = () => {
    if (!cardValidation.validateCardholderName(currentDetails.cardholderName)) {
      setErrors((prev) => ({
        ...prev,
        cardholderName: 'Vui lòng nhập tên chủ thẻ',
      }));
    }
  };

  const handleBlurExpiry = () => {
    if (!cardValidation.validateExpiry(currentDetails.expiryDate)) {
      setErrors((prev) => ({
        ...prev,
        expiryDate: 'Ngày hết hạn không hợp lệ (MM/YY)',
      }));
    }
  };

  const handleBlurCVV = () => {
    if (!cardValidation.validateCVV(currentDetails.cvv)) {
      setErrors((prev) => ({
        ...prev,
        cvv: 'CVV phải có 3-4 chữ số',
      }));
    }
  };

  return (
    <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="text-3xl">💳</div>
        <div>
          <h3 className="font-bold text-orange-900 text-lg mb-1">Thẻ tín dụng/Ghi nợ</h3>
          <p className="text-orange-800 text-sm">
            Thanh toán bằng thẻ tín dụng hoặc thẻ ghi nợ quốc tế (VISA, Mastercard, JCB)
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Card Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Số thẻ
            <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            placeholder="1234 5678 9012 3456"
            value={currentDetails.cardNumber}
            onChange={handleCardNumberChange}
            onBlur={handleBlurCardNumber}
            disabled={isSubmitting}
            maxLength="23"
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition-all ${
              errors.cardNumber
                ? 'border-red-500 focus:ring-red-200 bg-red-50'
                : 'border-gray-300 focus:ring-orange-200 focus:border-orange-400'
            } disabled:bg-gray-100 disabled:cursor-not-allowed`}
          />
          {errors.cardNumber && (
            <p className="text-red-600 text-sm mt-1 font-medium">{errors.cardNumber}</p>
          )}
        </div>

        {/* Cardholder Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tên chủ thẻ
            <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            placeholder="JOHN DOE"
            value={currentDetails.cardholderName}
            onChange={handleCardholderNameChange}
            onBlur={handleBlurCardholderName}
            disabled={isSubmitting}
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition-all uppercase ${
              errors.cardholderName
                ? 'border-red-500 focus:ring-red-200 bg-red-50'
                : 'border-gray-300 focus:ring-orange-200 focus:border-orange-400'
            } disabled:bg-gray-100 disabled:cursor-not-allowed`}
          />
          {errors.cardholderName && (
            <p className="text-red-600 text-sm mt-1 font-medium">{errors.cardholderName}</p>
          )}
        </div>

        {/* Expiry Date and CVV */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ngày hết hạn
              <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              placeholder="MM/YY"
              value={currentDetails.expiryDate}
              onChange={handleExpiryChange}
              onBlur={handleBlurExpiry}
              disabled={isSubmitting}
              maxLength="5"
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition-all ${
                errors.expiryDate
                  ? 'border-red-500 focus:ring-red-200 bg-red-50'
                  : 'border-gray-300 focus:ring-orange-200 focus:border-orange-400'
              } disabled:bg-gray-100 disabled:cursor-not-allowed`}
            />
            {errors.expiryDate && (
              <p className="text-red-600 text-sm mt-1 font-medium">{errors.expiryDate}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CVV
              <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              placeholder="123"
              value={currentDetails.cvv}
              onChange={handleCvvChange}
              onBlur={handleBlurCVV}
              disabled={isSubmitting}
              maxLength="4"
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition-all ${
                errors.cvv
                  ? 'border-red-500 focus:ring-red-200 bg-red-50'
                  : 'border-gray-300 focus:ring-orange-200 focus:border-orange-400'
              } disabled:bg-gray-100 disabled:cursor-not-allowed`}
            />
            {errors.cvv && (
              <p className="text-red-600 text-sm mt-1 font-medium">{errors.cvv}</p>
            )}
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-white rounded-lg p-4 border border-orange-100">
          <p className="text-gray-700 text-sm">
            <span className="font-semibold text-orange-900">🔒 An toàn:</span> Thông tin thẻ của bạn được mã hóa SSL 256-bit. Chúng tôi không lưu trữ thông tin thẻ trên máy chủ của mình.
          </p>
        </div>
      </div>
    </div>
  );
}
