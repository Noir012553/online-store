import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

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
  currencyCode: string;
}

export interface AppliedCoupon {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  couponCurrencyCode: string;
  currencyCode: string;
  minimumOrderAmount: number;
  originalAmount: number;
  discount: number;
  finalAmount: number;
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
  couponCode: string;
  appliedCoupon: AppliedCoupon | null;
  isCouponApplying: boolean;
  couponError: string | null;
  setCurrentStep: (step: CheckoutStep) => void;
  setFormData: (data: Partial<FormData>) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCouponCode: (code: string) => void;
  setAppliedCoupon: (coupon: AppliedCoupon | null) => void;
  setIsCouponApplying: (loading: boolean) => void;
  setCouponError: (error: string | null) => void;
  clearCoupon: () => void;
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

const COUPON_STORAGE_KEY = 'checkout_coupon_state';

interface CheckoutProviderProps {
  children: ReactNode;
  initialName?: string;
  initialEmail?: string;
  initialPhone?: string;
}

export function CheckoutProvider({ children, initialName, initialEmail, initialPhone }: CheckoutProviderProps) {
  const [currentStep, setCurrentStep] = useState<CheckoutStep>(1);
  const [formData, setFormDataState] = useState<FormData>({
    ...defaultFormData,
    name: initialName || '',
    email: initialEmail || '',
    phone: initialPhone || '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [isCouponApplying, setIsCouponApplying] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const setFormData = useCallback((data: Partial<FormData>) => {
    setFormDataState((prev) => ({ ...prev, ...data }));
  }, []);

  const clearCoupon = useCallback(() => {
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponError(null);
    localStorage.removeItem(COUPON_STORAGE_KEY);
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
      setError('error_fill_required');
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

  useEffect(() => {
    try {
      const savedCoupon = localStorage.getItem(COUPON_STORAGE_KEY);
      if (!savedCoupon) {
        return;
      }

      const parsedCoupon = JSON.parse(savedCoupon) as {
        couponCode?: string;
        appliedCoupon?: AppliedCoupon | null;
      };

      if (parsedCoupon.couponCode) {
        setCouponCode(parsedCoupon.couponCode);
      }

      if (parsedCoupon.appliedCoupon) {
        setAppliedCoupon(parsedCoupon.appliedCoupon);
      }
    } catch {
      localStorage.removeItem(COUPON_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!appliedCoupon) {
      localStorage.removeItem(COUPON_STORAGE_KEY);
      return;
    }

    localStorage.setItem(
      COUPON_STORAGE_KEY,
      JSON.stringify({
        couponCode: couponCode || appliedCoupon.code,
        appliedCoupon,
      })
    );
  }, [appliedCoupon, couponCode]);

  const reset = useCallback((): void => {
    setCurrentStep(1);
    setFormDataState(defaultFormData);
    setError(null);
    clearCoupon();
    setIsCouponApplying(false);
  }, [clearCoupon]);

  const value: CheckoutContextType = {
    currentStep,
    formData,
    isLoading,
    error,
    couponCode,
    appliedCoupon,
    isCouponApplying,
    couponError,
    setCurrentStep,
    setFormData,
    setIsLoading,
    setError,
    setCouponCode,
    setAppliedCoupon,
    setIsCouponApplying,
    setCouponError,
    clearCoupon,
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
  const context = useContext(CheckoutContext);
  if (!context) {
    throw new Error('useCheckout must be used within CheckoutProvider');
  }
  return context;
}
