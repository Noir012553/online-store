import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/context/AuthContext';
import { useCart } from '../lib/context/CartContext';
import { CheckoutProvider, useCheckout } from '../context/CheckoutContext';
import { StepIndicator } from '../components/checkout/StepIndicator';
import { Step1Combined } from '../components/checkout/Step1Combined';
import { Step2OrderReview } from '../components/checkout/Step2OrderReview';
import { Step3Payment } from '../components/checkout/Step3Payment';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';

function CheckoutContent() {
  const router = useRouter();
  const { user } = useAuth();
  const { items } = useCart();
  const { currentStep, formData } = useCheckout();

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!user) {
      toast.error('Vui lòng đăng nhập để tiếp tục');
      router.push('/login');
    }

    // Redirect to cart if empty
    if (items.length === 0 && router.isReady) {
      toast.error('Giỏ hàng của bạn trống');
      router.push('/cart');
    }
  }, [user, items, router]);

  if (!user || items.length === 0) {
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
    <div className="min-h-screen bg-linear-to-b from-gray-50 to-gray-100 py-8 animate-in fade-in duration-300">
      <div className="container mx-auto px-4">
        <Breadcrumbs
          links={[
            { label: 'Giỏ hàng', href: '/cart' },
            { label: 'Thanh toán' },
          ]}
        />

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Thanh toán đơn hàng</h1>
            <p className="text-gray-600 mt-1">Bước {currentStep} trên 3</p>
          </div>
          <Badge className="bg-red-600 text-white px-4 py-2 text-sm font-medium">{items.length} sản phẩm</Badge>
        </div>

        <StepIndicator currentStep={currentStep} totalSteps={3} />

        {renderStep()}
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  if (!user) {
    return null;
  }

  return (
    <CheckoutProvider initialName={user?.name} initialEmail={user?.email}>
      <CheckoutContent />
    </CheckoutProvider>
  );
}
