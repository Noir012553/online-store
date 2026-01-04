import React, { createContext, useState, useCallback, ReactNode } from 'react';

export type CheckoutStep = 1 | 2 | 3 | 4 | 5;

export interface CardDetails {
  cardNumber: string;
  cardholderName: string;
  expiryDate: string; // MM/YY format
  cvv: string;
}

export interface FormData {
  name: string;
  email: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  address: string;
  note: string;
  paymentMethod: string;
  shippingMethod: string;
  cardDetails?: CardDetails;
}

export interface ShippingMethod {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  freeThreshold?: number;
  estimatedDays: number;
  icon?: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  description: string;
  shortName: string;
  provider: string;
  icon?: string;
  badge?: string;
}

export interface CheckoutContextType {
  currentStep: CheckoutStep;
  formData: FormData;
  shippingMethods: ShippingMethod[];
  paymentMethods: PaymentMethod[];
  isLoading: boolean;
  error: string | null;
  setCurrentStep: (step: CheckoutStep) => void;
  setFormData: (data: Partial<FormData>) => void;
  setShippingMethods: (methods: ShippingMethod[]) => void;
  setPaymentMethods: (methods: PaymentMethod[]) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  goNext: () => boolean;
  goBack: () => void;
  reset: () => void;
}

const defaultFormData: FormData = {
  name: '',
  email: '',
  phone: '',
  province: '',
  district: '',
  ward: '',
  address: '',
  note: '',
  paymentMethod: 'cod',
  shippingMethod: '',
  cardDetails: {
    cardNumber: '',
    cardholderName: '',
    expiryDate: '',
    cvv: '',
  },
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
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setFormData = useCallback((data: Partial<FormData>) => {
    setFormDataState((prev) => ({ ...prev, ...data }));
  }, []);

  const validateStep = useCallback((step: CheckoutStep): boolean => {
    switch (step) {
      case 1:
        // Validate shipping info
        return !!(formData.name && formData.phone && formData.province && formData.district && formData.address);
      case 2:
        // Validate shipping method selected
        return !!formData.shippingMethod;
      case 3:
        // Payment method is always set (default: cod)
        return !!formData.paymentMethod;
      case 4:
        // Validate card details if payment method is card
        if (formData.paymentMethod === 'card') {
          return !!(
            formData.cardDetails?.cardNumber &&
            formData.cardDetails?.cardholderName &&
            formData.cardDetails?.expiryDate &&
            formData.cardDetails?.cvv
          );
        }
        return true;
      case 5:
        // No additional validation needed
        return true;
      default:
        return false;
    }
  }, [formData]);

  const goNext = useCallback((): boolean => {
    if (!validateStep(currentStep)) {
      setError('Vui lòng điền đầy đủ thông tin bước này');
      return false;
    }
    if (currentStep < 5) {
      setCurrentStep((currentStep + 1) as CheckoutStep);
      setError(null);
      return true;
    }
    return false;
  }, [currentStep, validateStep]);

  const goBack = useCallback((): void => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as CheckoutStep);
      setError(null);
    }
  }, [currentStep]);

  const reset = useCallback((): void => {
    setCurrentStep(1);
    setFormDataState(defaultFormData);
    setError(null);
  }, []);

  const value: CheckoutContextType = {
    currentStep,
    formData,
    shippingMethods,
    paymentMethods,
    isLoading,
    error,
    setCurrentStep,
    setFormData,
    setShippingMethods,
    setPaymentMethods,
    setIsLoading,
    setError,
    goNext,
    goBack,
    reset,
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
