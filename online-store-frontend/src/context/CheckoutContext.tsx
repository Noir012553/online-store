import React, { createContext, useState, useCallback, ReactNode } from 'react';

export type CheckoutStep = 1 | 2 | 3 | 4;
export type PaymentMethod = 'cod' | 'vnpay';

export interface ShippingAddress {
  name: string;
  phone: string;
  address: string;
  provinceId?: number;
  provinceName?: string;
  districtId?: number;
  districtName?: string;
  wardCode?: string;
  wardName?: string;
}

export interface ShippingOption {
  provider: string;
  providerName: string;
  serviceType: string;
  serviceName: string;
  estimatedDays: string;
  fee: number;
}

export interface FormData {
  name: string;
  email: string;
  phone: string;
  // Shipping Info
  shippingAddress?: ShippingAddress;
  selectedShipping?: ShippingOption;
  // Payment Info
  paymentMethod?: PaymentMethod;
}

export interface CheckoutContextType {
  currentStep: CheckoutStep;
  formData: FormData;
  isLoading: boolean;
  error: string | null;
  setCurrentStep: (step: CheckoutStep) => void;
  setFormData: (data: Partial<FormData>) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  goNext: () => boolean;
  goBack: () => void;
  reset: () => void;
  setCurrentStepDirect: (step: CheckoutStep) => void;
}

const defaultFormData: FormData = {
  name: '',
  email: '',
  phone: '',
};

export const CheckoutContext = createContext<CheckoutContextType | undefined>(undefined);

interface CheckoutProviderProps {
  children: ReactNode;
  initialName?: string;
  initialEmail?: string;
}

export function CheckoutProvider({ children, initialName, initialEmail }: CheckoutProviderProps) {
  const [currentStep, setCurrentStep] = useState<CheckoutStep>(1);
  const [formData, setFormDataState] = useState<FormData>({
    ...defaultFormData,
    name: initialName || '',
    email: initialEmail || '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setFormData = useCallback((data: Partial<FormData>) => {
    setFormDataState((prev) => ({ ...prev, ...data }));
  }, []);

  const validateStep = useCallback((step: CheckoutStep): boolean => {
    switch (step) {
      case 1:
        return !!(formData.name && formData.phone);
      case 2:
        return !!(
          formData.shippingAddress?.address &&
          formData.shippingAddress?.districtId &&
          formData.shippingAddress?.wardCode &&
          formData.selectedShipping
        );
      case 3:
        return true; // Review step - just confirm
      case 4:
        return !!(formData.paymentMethod); // Payment method must be selected
      default:
        return false;
    }
  }, [formData]);

  const goNext = useCallback((): boolean => {
    if (!validateStep(currentStep)) {
      setError('Vui lòng điền đầy đủ thông tin bước này');
      return false;
    }
    setError(null);

    // Move to next step if not at the last step
    if (currentStep < 4) {
      setCurrentStep((currentStep + 1) as CheckoutStep);
      return true;
    }

    return true;
  }, [currentStep, validateStep]);

  const goBack = useCallback((): void => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as CheckoutStep);
      setError(null);
    }
  }, [currentStep]);

  const setCurrentStepDirect = useCallback((step: CheckoutStep): void => {
    setCurrentStep(step);
    setError(null);
  }, []);

  const reset = useCallback((): void => {
    setCurrentStep(1);
    setFormDataState(defaultFormData);
    setError(null);
  }, []);

  const value: CheckoutContextType = {
    currentStep,
    formData,
    isLoading,
    error,
    setCurrentStep,
    setFormData,
    setIsLoading,
    setError,
    goNext,
    goBack,
    reset,
    setCurrentStepDirect,
  };

  return (
    <CheckoutContext.Provider value={value}>
      {children}
    </CheckoutContext.Provider>
  );
}

export function useCheckout(): CheckoutContextType {
  const context = React.useContext(CheckoutContext);
  if (!context) {
    throw new Error('useCheckout must be used within CheckoutProvider');
  }
  return context;
}
