import React from 'react';
import { CheckoutStep } from '../../context/CheckoutContext';

interface StepIndicatorProps {
  currentStep: CheckoutStep;
  totalSteps?: number;
}

const steps = [
  { number: 1, title: 'Thông tin', description: 'Thông tin giao hàng' },
  { number: 2, title: 'Vận chuyển', description: 'Chọn phương thức' },
  { number: 3, title: 'Thanh toán', description: 'Chọn phương thức' },
  { number: 4, title: 'Xác nhận', description: 'Kiểm tra chi tiết' },
  { number: 5, title: 'Hoàn tất', description: 'Đặt hàng' },
];

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        {steps.map((step, index) => (
          <React.Fragment key={step.number}>
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center font-bold mb-2 transition-all ${
                  currentStep >= step.number
                    ? 'bg-red-600 text-white shadow-lg'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {currentStep > step.number ? (
                  <span className="text-lg">✓</span>
                ) : (
                  step.number
                )}
              </div>
              <p className={`text-sm font-medium text-center ${
                currentStep === step.number
                  ? 'text-red-600'
                  : currentStep > step.number
                  ? 'text-gray-900'
                  : 'text-gray-500'
              }`}>
                {step.title}
              </p>
              <p className="text-xs text-gray-500 text-center mt-1 hidden sm:block">
                {step.description}
              </p>
            </div>
            {index < steps.length - 1 && (
              <div className="flex-1 h-1 bg-gray-200 mx-2 mb-8 relative">
                <div
                  className={`absolute inset-y-0 left-0 h-full bg-red-600 transition-all duration-300 ${
                    currentStep > step.number ? 'w-full' : 'w-0'
                  }`}
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
