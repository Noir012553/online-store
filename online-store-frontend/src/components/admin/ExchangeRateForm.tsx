import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import currencyService, { ExchangeRate, Currency } from '../../lib/services/currencyService';
import { useTranslation } from '../../lib/i18n';
import { toast } from 'sonner';
import { X, ArrowRight } from 'lucide-react';

interface ExchangeRateFormProps {
  rate?: ExchangeRate | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ExchangeRateForm({ rate, onSuccess, onCancel }: ExchangeRateFormProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    fromCode: '',
    toCode: '',
    rate: '',
    source: 'manual' as 'manual' | 'api' | 'import',
    isActive: true,
  });

  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchCurrencies();
  }, []);

  useEffect(() => {
    if (rate) {
      setFormData({
        fromCode: rate.fromCode,
        toCode: rate.toCode,
        rate: rate.rate.toString(),
        source: rate.source,
        isActive: rate.isActive,
      });
    }
  }, [rate]);

  const fetchCurrencies = async () => {
    try {
      const data = await currencyService.fetchCurrencies(true);
      setCurrencies(data);
    } catch (error) {
      toast.error(t('error_load_data', 'admin'));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;

    if (type === 'checkbox') {
      setFormData(prev => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
    } else if (name === 'rate') {
      setFormData(prev => ({
        ...prev,
        [name]: value,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value.toUpperCase(),
      }));
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.fromCode || !formData.toCode || !formData.rate) {
      toast.error(t('error_no_title', 'admin'));
      return;
    }

    if (formData.fromCode === formData.toCode) {
      toast.error(t('admin_exchange_error_same', 'admin'));
      return;
    }

    const rateValue = parseFloat(formData.rate);
    if (isNaN(rateValue) || rateValue <= 0) {
      toast.error(t('error_no_description', 'admin'));
      return;
    }

    try {
      setIsSubmitting(true);

      const submitData = {
        fromCode: formData.fromCode,
        toCode: formData.toCode,
        rate: rateValue,
        source: formData.source,
        isActive: formData.isActive,
      };

      if (rate) {
        await currencyService.updateExchangeRate(rate._id, submitData);
        toast.success(t('toast_update_success', 'admin'));
      } else {
        await currencyService.createExchangeRate(submitData);
        toast.success(t('success_create', 'admin'));
      }

      onSuccess();
    } catch (error: any) {
      toast.error(error.message || t('error_save_data', 'admin'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const currencyOptions = currencies.map(c => ({
    label: `${c.code} - ${c.name}`,
    value: c.code,
  }));

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4 sm:p-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          {rate ? t('admin_edit_exchange_rate', 'admin') : t('admin_add_exchange_rate', 'admin')}
        </h3>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <Label htmlFor="fromCode">{t('admin_exchange_from', 'admin')} *</Label>
            <Select
              value={formData.fromCode}
              onValueChange={value => handleSelectChange('fromCode', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('admin_currency_list', 'admin')} />
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-center md:pt-6">
            <ArrowRight className="w-5 h-5 text-gray-400 md:mt-6" />
          </div>

          <div>
            <Label htmlFor="toCode">{t('admin_exchange_to', 'admin')} *</Label>
            <Select
              value={formData.toCode}
              onValueChange={value => handleSelectChange('toCode', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('admin_currency_list', 'admin')} />
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="rate">
              {t('admin_exchange_rate', 'admin')} (1 {formData.fromCode || '?'} = ? {formData.toCode || '?'}) *
            </Label>
            <Input
              id="rate"
              name="rate"
              type="number"
              value={formData.rate}
              onChange={handleInputChange}
              placeholder="0.000041"
              step="0.00000001"
              min="0"
            />
          </div>

          <div>
            <Label htmlFor="source">{t('admin_exchange_source', 'admin')}</Label>
            <Select
              value={formData.source}
              onValueChange={value => handleSelectChange('source', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">{t('admin_exchange_source_manual', 'admin')}</SelectItem>
                <SelectItem value="api">{t('admin_exchange_source_api', 'admin')}</SelectItem>
                <SelectItem value="import">{t('admin_exchange_source_import', 'admin')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-4">
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
