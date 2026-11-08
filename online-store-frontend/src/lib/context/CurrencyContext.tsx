import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLanguage } from './LanguageContext';
import currencyService, { type Currency } from '../services/currencyService';

interface CurrencyContextValue {
  currency: Currency;
  currencyCode: string;
  activeCurrencies: Currency[];
  isLoadingCurrency: boolean;
  refreshCurrencies: () => void;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const FALLBACK_CURRENCY: Currency = {
  _id: 'fallback-vnd',
  code: 'VND',
  name: 'Vietnamese Dong',
  symbol: '₫',
  position: 'after',
  decimalPlaces: 0,
  isActive: true,
  isDefault: true,
};

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { locale, localeConfigs } = useLanguage();
  const [activeCurrencies, setActiveCurrencies] = useState<Currency[]>([]);
  const [isLoadingCurrency, setIsLoadingCurrency] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshCurrencies = useCallback(() => setRefreshKey(key => key + 1), []);

  useEffect(() => {
    let isMounted = true;

    setIsLoadingCurrency(true);
    currencyService.fetchCurrencies(true, locale)
      .then((currencies) => {
        if (isMounted) setActiveCurrencies(currencies);
      })
      .catch(() => {
        if (isMounted) setActiveCurrencies([]);
      })
      .finally(() => {
        if (isMounted) setIsLoadingCurrency(false);
      });

    return () => {
      isMounted = false;
    };
  }, [locale, refreshKey]);

  const localeCurrencyCode = localeConfigs.find((item) => item.code === locale)?.currencyCode;
  const currency = activeCurrencies.find((item) => item.isDefault)
    ?? activeCurrencies.find((item) => item.code === localeCurrencyCode)
    ?? FALLBACK_CURRENCY;

  const value = useMemo<CurrencyContextValue>(() => ({
    currency,
    currencyCode: currency.code,
    activeCurrencies,
    isLoadingCurrency,
    refreshCurrencies,
  }), [currency, activeCurrencies, isLoadingCurrency, refreshCurrencies]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrencyContext(): CurrencyContextValue {
  const context = useContext(CurrencyContext);

  if (!context) {
    throw new Error('useCurrencyContext must be used within a CurrencyProvider');
  }

  return context;
}
