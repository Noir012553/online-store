import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { CurrencyList } from '../../components/admin/CurrencyList';
import { CurrencyForm } from '../../components/admin/CurrencyForm';
import { ExchangeRateList } from '../../components/admin/ExchangeRateList';
import { ExchangeRateForm } from '../../components/admin/ExchangeRateForm';
import { PermissionDenied } from '../../components/admin/PermissionDenied';
import { Currency, ExchangeRate } from '../../lib/services/currencyService';
import { useAuth } from '../../lib/context/AuthContext';
import { useTranslation } from '../../lib/i18n';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export function CurrencyAdminContent() {
  const { isSuperAdmin } = useAuth();
  const { t, loadNamespace } = useTranslation();

  const [activeTab, setActiveTab] = useState<'currencies' | 'rates'>('currencies');
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [editingRate, setEditingRate] = useState<ExchangeRate | null>(null);
  const [showCurrencyForm, setShowCurrencyForm] = useState(false);
  const [showRateForm, setShowRateForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  const handleCurrencySuccess = () => {
    setShowCurrencyForm(false);
    setEditingCurrency(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleRateSuccess = () => {
    setShowRateForm(false);
    setEditingRate(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleEditCurrency = (currency: Currency) => {
    setEditingCurrency(currency);
    setShowCurrencyForm(true);
  };

  const handleCancelCurrency = () => {
    setShowCurrencyForm(false);
    setEditingCurrency(null);
  };

  const handleEditRate = (rate: ExchangeRate) => {
    setEditingRate(rate);
    setShowRateForm(true);
  };

  const handleCancelRate = () => {
    setShowRateForm(false);
    setEditingRate(null);
  };

  const handleAddCurrency = () => {
    setEditingCurrency(null);
    setShowCurrencyForm(true);
  };

  const handleAddRate = () => {
    setEditingRate(null);
    setShowRateForm(true);
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-6 text-center text-red-600">
        {t('access_denied_desc', 'admin')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('admin_currency_management', 'admin')}</h1>
          <p className="text-gray-600 mt-2">
            {t('admin_currency_management', 'admin')}
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('currencies')}
              className={`px-4 py-3 font-medium border-b-2 transition ${
                activeTab === 'currencies'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('admin_currency_list', 'admin')}
            </button>
            <button
              onClick={() => setActiveTab('rates')}
              className={`px-4 py-3 font-medium border-b-2 transition ${
                activeTab === 'rates'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('admin_exchange_rate_list', 'admin')}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {activeTab === 'currencies' && (
            <>
              <div className="flex justify-end">
                <Button
                  onClick={handleAddCurrency}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {t('admin_add_currency')}
                </Button>
              </div>

              {showCurrencyForm && (
                <CurrencyForm
                  currency={editingCurrency}
                  onSuccess={handleCurrencySuccess}
                  onCancel={handleCancelCurrency}
                />
              )}

              <CurrencyList
                key={`currencies-${refreshKey}`}
                onEdit={handleEditCurrency}
                onRefresh={() => setRefreshKey(prev => prev + 1)}
              />
            </>
          )}

          {activeTab === 'rates' && (
            <>
              <div className="flex justify-end">
                <Button
                  onClick={handleAddRate}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {t('admin_add_exchange_rate')}
                </Button>
              </div>

              {showRateForm && (
                <ExchangeRateForm
                  rate={editingRate}
                  onSuccess={handleRateSuccess}
                  onCancel={handleCancelRate}
                />
              )}

              <ExchangeRateList
                key={`rates-${refreshKey}`}
                onEdit={handleEditRate}
                onRefresh={() => setRefreshKey(prev => prev + 1)}
              />
            </>
          )}
      </div>
    </div>
  );
}

export default withAdminLayout(CurrencyAdminContent, {
  permission: 'manage:currency',
  featureName: 'Currency Management',
});
