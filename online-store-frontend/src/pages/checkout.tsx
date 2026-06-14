import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/context/AuthContext';
import { useCart } from '../lib/context/CartContext';
import { useLanguage } from '../lib/i18n';
import { useNamespaceLoader } from '../hooks/useNamespaceLoader';
import { CheckoutProvider, useCheckout } from '../context/CheckoutContext';
import { StepIndicator } from '../components/checkout/StepIndicator';
import { Step1Combined } from '../components/checkout/Step1Combined';
import { Step2OrderReview } from '../components/checkout/Step2OrderReview';
import { Step3Payment } from '../components/checkout/Step3Payment';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

function CheckoutContent() {
  const router = useRouter();
  const { user, isInitialized } = useAuth();
  const { items } = useCart();
  const { currentStep, formData } = useCheckout();
  const { t } = useLanguage();

  // Phase 3: Route-based namespace loading
  useNamespaceLoader(['checkout', 'products', 'orders', 'payment']);

  useEffect(() => {
    if (!isInitialized) return;

    if (!user) {
      toast.error(t('please_login'));
      router.push('/login');
      return;
    }

    if (items.length === 0 && router.isReady) {
      const paymentInProgress = sessionStorage.getItem('paymentInProgress');
      if (!paymentInProgress) {
        toast.error(t('error_order_processing'));
        router.push('/cart');
      }
    }
  }, [isInitialized, user, items, router, t]);

  if (!isInitialized || !user || items.length === 0) {
    return null;
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1Combined />;
      case 2:
        return <Step2OrderReview />;
      case 3:
        return <Step3Payment />;
      default:
        return <Step1Combined />;
    }
  };

  return (
    <div className="min-h-screen bg-white py-8 animate-in fade-in duration-300">
      <div className="container mx-auto px-4">
        <Breadcrumbs
          links={[
            { label: t('step_cart'), href: '/cart' },
            { label: t('step_payment') },
          ]}
        />

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t('step_payment')}</h1>
            <p className="text-gray-600 mt-1">{t('step_payment')} {currentStep} / 3</p>
          </div>
          <Badge className="bg-red-600 text-white px-4 py-2 text-sm font-medium">{items.length} {t('label_quantity')}</Badge>
        </div>

        <StepIndicator currentStep={currentStep} totalSteps={3} />

        {renderStep()}
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user, isInitialized } = useAuth();

  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      router.push('/login');
    }
  }, [isInitialized, user, router]);

  if (!isInitialized || !user) {
    return null;
  }

  return (
    <CheckoutProvider
      initialName={user?.name}
      initialEmail={user?.email}
      initialPhone={user?.phone}
    >
      <CheckoutContent />
    </CheckoutProvider>
  );
}
