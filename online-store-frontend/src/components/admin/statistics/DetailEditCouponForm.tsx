import { useTranslation } from '../../../lib/i18n';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Switch } from '../../ui/switch';

interface CouponFormState {
  type: 'coupon';
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: string;
  maxUses: string;
  minOrderAmount: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface DetailEditCouponFormProps {
  form: CouponFormState;
  onFormChange: (form: CouponFormState) => void;
}

export function DetailEditCouponForm({
  form,
  onFormChange,
}: DetailEditCouponFormProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 text-sm text-gray-700">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="coupon-code">{t('coupon_code_label')}</Label>
          <Input
            id="coupon-code"
            className="mt-1 uppercase"
            value={form.code}
            onChange={(event) =>
              onFormChange({ ...form, code: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="coupon-discount-type">
            {t('coupon_discount_type_label')}
          </Label>
          <select
            id="coupon-discount-type"
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-input-background px-3 py-1 text-base outline-none md:text-sm"
            value={form.discountType}
            onChange={(event) =>
              onFormChange({
                ...form,
                discountType: event.target.value === 'fixed' ? 'fixed' : 'percentage',
              })
            }
          >
            <option value="percentage">
              {t('coupon_discount_type_percentage')}
            </option>
            <option value="fixed">{t('coupon_discount_type_fixed')}</option>
          </select>
        </div>
        <div>
          <Label htmlFor="coupon-discount-value">
            {t('coupon_discount_value_label')}
          </Label>
          <Input
            id="coupon-discount-value"
            type="number"
            className="mt-1"
            value={form.discountValue}
            onChange={(event) =>
              onFormChange({ ...form, discountValue: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="coupon-max-uses">{t('coupon_max_uses_label')}</Label>
          <Input
            id="coupon-max-uses"
            type="number"
            className="mt-1"
            value={form.maxUses}
            onChange={(event) =>
              onFormChange({ ...form, maxUses: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="coupon-min-order">
            {t('coupon_min_order_label')}
          </Label>
          <Input
            id="coupon-min-order"
            type="number"
            className="mt-1"
            value={form.minOrderAmount}
            onChange={(event) =>
              onFormChange({ ...form, minOrderAmount: event.target.value })
            }
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
          <div>
            <Label htmlFor="coupon-active">{t('coupon_active_label')}</Label>
            <p className="text-xs text-gray-500">{t('coupon_active_help')}</p>
          </div>
          <Switch
            id="coupon-active"
            checked={form.isActive}
            onCheckedChange={(checked) =>
              onFormChange({ ...form, isActive: checked })
            }
          />
        </div>
        <div>
          <Label htmlFor="coupon-start-date">
            {t('coupon_start_date_label')}
          </Label>
          <Input
            id="coupon-start-date"
            type="date"
            className="mt-1"
            value={form.startDate}
            onChange={(event) =>
              onFormChange({ ...form, startDate: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="coupon-end-date">
            {t('coupon_end_date_label')}
          </Label>
          <Input
            id="coupon-end-date"
            type="date"
            className="mt-1"
            value={form.endDate}
            onChange={(event) =>
              onFormChange({ ...form, endDate: event.target.value })
            }
          />
        </div>
      </div>
      <div>
        <Label htmlFor="coupon-description">
          {t('coupon_description_label')}
        </Label>
        <Textarea
          id="coupon-description"
          className="mt-1 min-h-28"
          value={form.description}
          onChange={(event) =>
            onFormChange({ ...form, description: event.target.value })
          }
        />
      </div>
    </div>
  );
}
