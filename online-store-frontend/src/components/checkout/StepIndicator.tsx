import React from 'react';
import { CheckoutStep } from '../../context/CheckoutContext';

interface StepIndicatorProps {
  currentStep: CheckoutStep;
  totalSteps?: number;
}

const stepsMap: Record<number, Array<{ number: number; title: string; description: string }>> = {
  3: [
    { number: 1, title: 'Thông tin & Vận chuyển', description: 'Địa chỉ & dịch vụ giao hàng' },
    { number: 2, title: 'Xác nhận', description: 'Kiểm tra & xác nhận đơn hàng' },
    { number: 3, title: 'Thanh toán', description: 'Chọn phương thức thanh toán' },
  ],
  4: [
    { number: 1, title: 'Thông tin', description: 'Thông tin khách hàng' },
    { number: 2, title: 'Vận chuyển', description: 'Địa chỉ & dịch vụ' },
    { number: 3, title: 'Xác nhận', description: 'Kiểm tra & xác nhận' },
    { number: 4, title: 'Thanh toán', description: 'Chọn phương thức' },
  ],
};

export function StepIndicator({ currentStep, totalSteps = 4 }: StepIndicatorProps) {
  const steps = stepsMap[totalSteps] || stepsMap[3];

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
