import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import currencyService, { Currency } from '../../lib/services/currencyService';
import { useTranslation } from '../../lib/i18n';
import { toast } from 'sonner';
import { X } from 'lucide-react';

interface CurrencyFormProps {
  currency?: Currency | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function CurrencyForm({ currency, onSuccess, onCancel }: CurrencyFormProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    symbol: '',
    position: 'after' as 'before' | 'after',
    decimalPlaces: 2,
    isActive: true,
    isDefault: false,
    description: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (currency) {
      setFormData({
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        position: currency.position,
        decimalPlaces: currency.decimalPlaces,
        isActive: currency.isActive,
        isDefault: currency.isDefault,
        description: currency.description || '',
      });
    }
  }, [currency]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;

    if (type === 'checkbox') {
      setFormData(prev => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
    } else if (name === 'decimalPlaces') {
      setFormData(prev => ({
        ...prev,
        [name]: parseInt(value) || 0,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value.toUpperCase() === value && name === 'code' ? value : value,
      }));
    }
  };

  const handleSelectChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      position: value as 'before' | 'after',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code || !formData.name || !formData.symbol) {
      toast.error(t('error_no_title', 'admin'));
      return;
    }

    if (formData.code.length !== 3) {
      toast.error(t('admin_currency_error_exists', 'admin'));
      return;
    }

    try {
      setIsSubmitting(true);

      if (currency) {
        await currencyService.updateCurrency(currency._id, formData);
        toast.success(t('toast_update_success', 'admin'));
      } else {
        await currencyService.createCurrency(formData);
        toast.success(t('success_create', 'admin'));
      }

      onSuccess();
    } catch (error: any) {
      toast.error(error.message || t('error_save_data', 'admin'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4 sm:p-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          {currency ? t('admin_edit_currency', 'admin') : t('admin_add_currency', 'admin')}
        </h3>
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="code">{t('admin_currency_code', 'admin')} *</Label>
            <Input
              id="code"
              name="code"
              value={formData.code}
              onChange={handleInputChange}
              placeholder="VND, USD, EUR..."
              maxLength={3}
              disabled={!!currency}
              className="uppercase"
            />
            <p className="text-xs text-gray-500 mt-1">ISO 4217</p>
          </div>

          <div>
            <Label htmlFor="name">{t('admin_currency_name', 'admin')} *</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder={t('admin_currency_vnd', 'admin')}
            />
          </div>

          <div>
            <Label htmlFor="symbol">{t('admin_currency_symbol', 'admin')} *</Label>
            <Input
              id="symbol"
              name="symbol"
              value={formData.symbol}
              onChange={handleInputChange}
              placeholder="₫, $, €..."
            />
          </div>

          <div>
            <Label htmlFor="position">{t('admin_currency_position', 'admin')}</Label>
            <select value={formData.position} onChange={(event) => handleSelectChange(event.target.value)} className="border-input flex h-9 w-full rounded-md border bg-input-background px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50">
              <option value="before">{t('admin_currency_position_before', 'admin')}</option>
              <option value="after">{t('admin_currency_position_after', 'admin')}</option>
            </select>
          </div>

          <div>
            <Label htmlFor="decimalPlaces">{t('admin_currency_decimal', 'admin')}</Label>
            <Input
              id="decimalPlaces"
              name="decimalPlaces"
              type="number"
              value={formData.decimalPlaces}
              onChange={handleInputChange}
              min="0"
              max="4"
            />
          </div>

          <div className="flex items-end">
            <div className="flex flex-col gap-3 w-full sm:flex-row sm:gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="isActive"
                  checked={formData.isActive}
                  onChange={handleInputChange}
                  className="w-4 h-4"
                />
                <span className="text-sm">{t('admin_currency_active', 'admin')}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="isDefault"
                  checked={formData.isDefault}
                  onChange={handleInputChange}
                  className="w-4 h-4"
                />
                <span className="text-sm">{t('admin_currency_default', 'admin')}</span>
              </label>
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="description">{t('admin_currency_description', 'admin')}</Label>
          <Textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder={t('admin_currency_description', 'admin')}
            rows={3}
          />
        </div>

        <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('form_cancel', 'admin')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('saving', 'admin') : t('form_update', 'admin')}
          </Button>
        </div>
      </form>
    </div>
  );
}
