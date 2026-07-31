import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLanguage } from './LanguageContext';
import currencyService, { type Currency } from '../services/currencyService';
import { LoadingGate } from '../../components/LoadingGate';

interface CurrencyContextValue {
  currency: Currency;
  currencyCode: string;
  activeCurrencies: Currency[];
  isLoadingCurrency: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { locale, localeConfigs } = useLanguage();
  const [activeCurrencies, setActiveCurrencies] = useState<Currency[]>([]);
  const [isLoadingCurrency, setIsLoadingCurrency] = useState(true);

  useEffect(() => {
    let isMounted = true;

    setIsLoadingCurrency(true);
    currencyService.fetchCurrencies(true)
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
  }, [localeConfigs]);

  const localeCurrencyCode = localeConfigs.find((item) => item.code === locale)?.currencyCode;
  const currency = activeCurrencies.find((item) => item.code === localeCurrencyCode);

  const value = useMemo<CurrencyContextValue | undefined>(() => {
    if (!currency) return undefined;

    return {
      currency,
      currencyCode: currency.code,
      activeCurrencies,
      isLoadingCurrency,
    };
  }, [currency, activeCurrencies, isLoadingCurrency]);

  if (!value) {
    return <LoadingGate />;
  }

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrencyContext(): CurrencyContextValue {
  const context = useContext(CurrencyContext);

  if (!context) {
    throw new Error('useCurrencyContext must be used within a CurrencyProvider');
  }

  return context;
}
