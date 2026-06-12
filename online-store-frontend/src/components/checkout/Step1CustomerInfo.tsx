import React from 'react';
import { useCheckout } from '../../context/CheckoutContext';
import { useTranslation } from '../../lib/i18n';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';

export function Step1CustomerInfo() {
  const { formData, setFormData, setCurrentStepDirect, error, setError } = useCheckout();
  const { t } = useTranslation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.name || !formData.phone) {
      setError(t('validation_name_phone_required'));
      return;
    }

    setError(null);
    // Move to next step since validation passed
    setCurrentStepDirect(2);
    toast.success(t('shipping_info_saved_success'));
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{t('customer_info_title')}</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="name" className="text-base font-medium mb-2 block">
              {t('full_name_label')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={(e) => {
                setFormData({ name: e.target.value });
                setError(null);
              }}
              autoComplete="name"
              placeholder={t('full_name_placeholder')}
              required
              className="h-11"
            />
          </div>

          <div>
            <Label htmlFor="phone" className="text-base font-medium mb-2 block">
              {t('phone_label')} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => {
                setFormData({ phone: e.target.value });
                setError(null);
              }}
              autoComplete="tel"
              placeholder={t('phone_placeholder')}
              required
              className="h-11"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="email" className="text-base font-medium mb-2 block">
              {t('email_label')}
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={(e) => {
                setFormData({ email: e.target.value });
                setError(null);
              }}
              autoComplete="email"
              placeholder={t('email_placeholder')}
              className="h-11"
            />
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 h-11"
          >
            {t('continue_button')}
          </Button>
        </div>
      </form>
    </div>
  );
}
