import { useTranslation } from '../../../lib/i18n';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';

interface CustomerFormState {
  type: 'customer';
  name: string;
  email: string;
  phone: string;
  address: string;
}

interface DetailEditCustomerFormProps {
  form: CustomerFormState;
  onFormChange: (form: CustomerFormState) => void;
}

export function DetailEditCustomerForm({
  form,
  onFormChange,
}: DetailEditCustomerFormProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 text-sm text-gray-700">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="customer-name">{t('customer_name_label')}</Label>
          <Input
            id="customer-name"
            className="mt-1"
            value={form.name}
            onChange={(event) =>
              onFormChange({ ...form, name: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="customer-email">{t('customer_email_label')}</Label>
          <Input
            id="customer-email"
            className="mt-1"
            value={form.email}
            onChange={(event) =>
              onFormChange({ ...form, email: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="customer-phone">{t('customer_phone_label')}</Label>
          <Input
            id="customer-phone"
            className="mt-1"
            value={form.phone}
            onChange={(event) =>
              onFormChange({ ...form, phone: event.target.value })
            }
          />
        </div>
      </div>
      <div>
        <Label htmlFor="customer-address">
          {t('customer_address_label')}
        </Label>
        <Textarea
          id="customer-address"
          className="mt-1 min-h-28"
          value={form.address}
          onChange={(event) =>
            onFormChange({ ...form, address: event.target.value })
          }
        />
      </div>
    </div>
  );
}
