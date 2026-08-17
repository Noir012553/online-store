import React from 'react';
import { CheckoutStep } from '../../context/CheckoutContext';
import { useTranslation } from '../../lib/i18n';
import { UI_EMOJI } from '../../lib/uiEmoji';

interface StepIndicatorProps {
  currentStep: CheckoutStep;
  totalSteps?: number;
}

export function StepIndicator({ currentStep, totalSteps = 4 }: StepIndicatorProps) {
  const { t } = useTranslation();

  const stepsMap: Record<number, Array<{ number: number; titleKey: string; descriptionKey: string }>> = {
    3: [
      { number: 1, titleKey: 'step_cart', descriptionKey: 'customer_info_title' },
      { number: 2, titleKey: 'step_shipping', descriptionKey: 'shipping_address_title' },
      { number: 3, titleKey: 'step_payment', descriptionKey: 'payment_method_select' },
    ],
    4: [
      { number: 1, titleKey: 'step_cart', descriptionKey: 'customer_info_title' },
      { number: 2, titleKey: 'step_shipping', descriptionKey: 'shipping_address_title' },
      { number: 3, titleKey: 'step_payment', descriptionKey: 'payment_method_select' },
      { number: 4, titleKey: 'step_complete', descriptionKey: 'order_confirm' },
    ],
  };

  const stepsData = stepsMap[totalSteps] || stepsMap[3];
  const steps = stepsData.map(step => ({
    ...step,
    title: t(step.titleKey),
    description: t(step.descriptionKey),
  }));

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
                  <span className="text-lg">{UI_EMOJI.feature}</span>
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
