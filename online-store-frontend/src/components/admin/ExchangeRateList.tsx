import { useState, useEffect } from 'react';
import { Edit2, Trash2, ArrowRight, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import currencyService, { ExchangeRate } from '../../lib/services/currencyService';
import { useTranslation, useLanguage } from '../../lib/i18n';
import { getIntlLocale } from '../../lib/localeUtils';
import { toast } from 'sonner';

interface ExchangeRateListProps {
  onEdit: (rate: ExchangeRate) => void;
  onRefresh: () => void;
}

export function ExchangeRateList({ onEdit, onRefresh }: ExchangeRateListProps) {
  const { t } = useTranslation();
  const { locale } = useLanguage();
  const intlLocale = getIntlLocale(locale);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    fetchExchangeRates();
  }, []);

  const fetchExchangeRates = async () => {
    try {
      setIsLoading(true);
      const data = await currencyService.fetchExchangeRates();
      setRates(data);
    } catch (error) {
      toast.error(t('error_load_data', 'admin'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, pair: string) => {
    if (!confirm(`${t('admin_delete_exchange_rate', 'admin')} ${pair}?`)) {
      return;
    }

    try {
      await currencyService.deleteExchangeRate(id);
      toast.success(t('success_delete', 'admin'));
      fetchExchangeRates();
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || t('error_delete_data', 'admin'));
    }
  };

  const filteredRates = rates.filter(
    r =>
      r.fromCode.includes(searchQuery.toUpperCase()) ||
      r.toCode.includes(searchQuery.toUpperCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredRates.length / pageSize));
  const paginatedRates = filteredRates.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  if (isLoading) {
    return <div className="text-center py-8">{t('loading', 'admin')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">{t('admin_exchange_rate_list', 'admin')}</h3>
      </div>

      <Input
        placeholder={t('admin_search_exchange_placeholder', 'admin')}
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        className="max-w-md"
      />

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-4 py-3 text-left">{t('admin_exchange_from', 'admin')}</th>
              <th className="px-4 py-3 text-left"></th>
              <th className="px-4 py-3 text-left">{t('admin_exchange_to', 'admin')}</th>
              <th className="px-4 py-3 text-right">{t('admin_exchange_rate', 'admin')}</th>
              <th className="hidden px-4 py-3 text-left md:table-cell">{t('admin_exchange_source', 'admin')}</th>
              <th className="hidden px-4 py-3 text-center sm:table-cell">{t('admin_currency_active', 'admin')}</th>
              <th className="hidden px-4 py-3 text-left lg:table-cell">{t('admin_exchange_updated', 'admin')}</th>
              <th className="px-4 py-3 text-right">{t('admin_actions', 'admin')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRates.length > 0 ? (
              paginatedRates.map(rate => (
                <tr key={rate._id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold">{rate.fromCode}</td>
                  <td className="px-4 py-3 text-center">
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold">{rate.toCode}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {rate.rate.toFixed(8)}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded capitalize">
                      {rate.source === 'manual'
                        ? t('admin_exchange_source_manual', 'admin')
                        : rate.source === 'api'
                        ? t('admin_exchange_source_api', 'admin')
                        : t('admin_exchange_source_import', 'admin')}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-center sm:table-cell">
                    {rate.isActive ? (
                      <Check className="w-5 h-5 text-green-600 mx-auto" />
                    ) : (
                      <X className="w-5 h-5 text-red-600 mx-auto" />
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-gray-500 lg:table-cell">
                    {rate.rateUpdatedAt
                      ? new Date(rate.rateUpdatedAt).toLocaleDateString(intlLocale)
                      : t('not_available', 'admin')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit(rate)}
                        className="p-2"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          handleDelete(
                            rate._id,
                            `${rate.fromCode} → ${rate.toCode}`
                          )
                        }
                        className="p-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  {t('loading_message', 'admin')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filteredRates.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">{currentPage} / {totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
