import { useState, useEffect } from 'react';
import { Edit2, Trash2, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import currencyService, { Currency } from '../../lib/services/currencyService';
import { useTranslation } from '../../lib/i18n';
import { toast } from 'sonner';

interface CurrencyListProps {
  onEdit: (currency: Currency) => void;
  onRefresh: () => void;
}

export function CurrencyList({ onEdit, onRefresh }: CurrencyListProps) {
  const { t } = useTranslation();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    fetchCurrencies();
  }, []);

  const fetchCurrencies = async () => {
    try {
      setIsLoading(true);
      const data = await currencyService.fetchCurrencies();
      setCurrencies(data);
    } catch (error) {
      toast.error(t('error_load_data', 'admin'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`${t('admin_delete_currency', 'admin')} ${code}?`)) {
      return;
    }

    try {
      await currencyService.deleteCurrency(id);
      toast.success(t('success_delete', 'admin'));
      fetchCurrencies();
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || t('error_delete_data', 'admin'));
    }
  };

  const filteredCurrencies = currencies.filter(
    c =>
      c.code.includes(searchQuery.toUpperCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredCurrencies.length / pageSize));
  const paginatedCurrencies = filteredCurrencies.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
        <h3 className="text-lg font-semibold">{t('admin_currency_list', 'admin')}</h3>
      </div>

      <Input
        placeholder={t('admin_search_currency_placeholder', 'admin')}
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        className="w-full max-w-md"
      />

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-4 py-3 text-left">{t('admin_currency_code', 'admin')}</th>
              <th className="px-4 py-3 text-left">{t('admin_currency_name', 'admin')}</th>
              <th className="px-4 py-3 text-left">{t('admin_currency_symbol', 'admin')}</th>
              <th className="px-4 py-3 text-left">{t('admin_currency_position', 'admin')}</th>
              <th className="px-4 py-3 text-left">{t('admin_currency_decimal', 'admin')}</th>
              <th className="px-4 py-3 text-center">{t('admin_currency_default', 'admin')}</th>
              <th className="px-4 py-3 text-center">{t('admin_currency_active', 'admin')}</th>
              <th className="px-4 py-3 text-right">{t('admin_actions', 'admin')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredCurrencies.length > 0 ? (
              paginatedCurrencies.map(currency => (
                <tr key={currency._id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold">{currency.code}</td>
                  <td className="px-4 py-3">{currency.name}</td>
                  <td className="px-4 py-3 text-lg">{currency.symbol}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {currency.position === 'before' ? t('admin_currency_position_before', 'admin') : t('admin_currency_position_after', 'admin')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">{currency.decimalPlaces}</td>
                  <td className="px-4 py-3 text-center">
                    {currency.isDefault ? (
                      <Check className="w-5 h-5 text-green-600 mx-auto" />
                    ) : (
                      <X className="w-5 h-5 text-gray-300 mx-auto" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {currency.isActive ? (
                      <Check className="w-5 h-5 text-green-600 mx-auto" />
                    ) : (
                      <X className="w-5 h-5 text-red-600 mx-auto" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit(currency)}
                        className="p-2"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(currency._id, currency.code)}
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

      {filteredCurrencies.length > 0 && (
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
