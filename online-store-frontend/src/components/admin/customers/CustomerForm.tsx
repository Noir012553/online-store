import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { MapPin, AlertCircle, ArrowLeft } from 'lucide-react';
import { customerAPI } from '../../../lib/api';
import { useTranslation, useLanguage } from '../../../lib/i18n';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { toast } from 'sonner';

interface CustomerFormProps {
  mode: 'create' | 'edit';
  customerId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function CustomerForm({ mode, customerId, onSuccess, onCancel }: CustomerFormProps) {
  const router = useRouter();
  const { t, loadNamespace } = useTranslation();
  const { locale } = useLanguage();

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  const [isLoading, setIsLoading] = useState(mode === 'edit' && !!customerId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
  });

  // Fetch customer data for edit mode
  useEffect(() => {
    if (mode === 'edit' && customerId) {
      const fetchCustomer = async () => {
        try {
          setIsLoading(true);
          const response = await customerAPI.getCustomers(1, 100, locale);
          const customersList = response.customers || [];
          const foundCustomer = customersList.find((c: any) => c._id === customerId);

          if (foundCustomer) {
            setForm({
              firstName: foundCustomer.firstName || foundCustomer.name?.split(' ')[0] || '',
              lastName: foundCustomer.lastName || foundCustomer.name?.split(' ')[1] || '',
              email: foundCustomer.email || '',
              phone: foundCustomer.phone || '',
              address: foundCustomer.address || '',
            });
          } else {
            toast.error(t('error_customer_not_found', 'admin'));
            onCancel?.();
          }
        } catch (error) {
          toast.error(t('error_load_data', 'common'));
          onCancel?.();
        } finally {
          setIsLoading(false);
        }
      };

      fetchCustomer();
    }
  }, [mode, customerId, locale, t, onCancel]);

  const handleSubmit = async () => {
    if (!form.firstName || !form.email || !form.phone) {
      toast.error(t('error_fill_required', 'admin'));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      toast.error(t('invalid_email', 'admin'));
      return;
    }

    const phoneRegex = /^[0-9]{10,11}$/;
    if (!phoneRegex.test(form.phone)) {
      toast.error(t('invalid_phone', 'admin'));
      return;
    }

    try {
      setIsSubmitting(true);

      if (mode === 'edit' && customerId) {
        // Update customer
        await customerAPI.updateCustomer(customerId, {
          name: `${form.firstName} ${form.lastName}`.trim(),
          email: form.email,
          phone: form.phone,
          address: form.address,
        });
        toast.success(t('toast_update_success', 'common'));
      } else {
        // Create customer
        await customerAPI.createCustomer({
          name: `${form.firstName} ${form.lastName}`.trim(),
          email: form.email,
          phone: form.phone,
          address: form.address,
        });
        toast.success(t('toast_create_success', 'common'));
      }

      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || t('error_save_data', 'common'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <p>{t('loading', 'common')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-6">
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={onCancel}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('back', 'common')}
        </Button>
        <h1 className="text-2xl font-bold mb-2">
          {mode === 'create' ? t('admin_add_customer', 'admin') : t('admin_edit_customer', 'admin')}
        </h1>
        <p className="text-gray-600">
          {mode === 'create'
            ? t('admin_create_customer_description', 'admin')
            : t('admin_edit_customer_description', 'admin')}
        </p>
      </div>

      <div className="bg-white rounded-lg border space-y-6 p-4 sm:p-6">
        {/* Customer Info Section */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            {t('customer_info', 'admin')}
          </h2>
          <div className="space-y-3">
            <div>
              <Label htmlFor="first-name" className="text-xs font-medium text-gray-600">
                {t('first_name', 'admin')} *
              </Label>
              <Input
                id="first-name"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder={t('first_name', 'admin')}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="last-name" className="text-xs font-medium text-gray-600">
                {t('last_name', 'admin')}
              </Label>
              <Input
                id="last-name"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder={t('last_name', 'admin')}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="email" className="text-xs font-medium text-gray-600">
                {t('email_label', 'admin')} *
              </Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder={t('email_label', 'admin')}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="phone" className="text-xs font-medium text-gray-600">
                {t('phone_placeholder', 'admin')} *
              </Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder={t('phone_placeholder', 'admin')}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="address" className="text-xs font-medium text-gray-600">
                {t('shipping_address', 'admin')}
              </Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder={t('shipping_address', 'admin')}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 pt-6 border-t sm:flex-row">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
          >
            {isSubmitting ? t('loading', 'common') : mode === 'create' ? t('create', 'common') : t('update', 'common')}
          </Button>
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1"
          >
            {t('cancel', 'common')}
          </Button>
        </div>
      </div>
    </div>
  );
}
