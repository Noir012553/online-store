import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/lib/i18n';
import { formatCurrencyByCode, formatCurrencyWithMetadata } from '@/lib/utils';
import { useCurrencyContext } from '@/lib/context/CurrencyContext';
import { Locale } from '@/lib/i18n/types';
import { getIntlLocale } from '@/lib/localeUtils';

interface ExchangeRate {
  _id?: string;
  fromCode: string;
  toCode: string;
  rate: number;
  updatedAt?: string;
}

interface ConversionResult {
  amount: number;
  fromCode: string;
  toCode: string;
  rate: number;
  convertedAmount: number;
}

export const useCurrencyConversion = () => {
  const { locale } = useLanguage();
  const { currencyCode, activeCurrencies } = useCurrencyContext();
  const targetCurrency = currencyCode;

  // Fetch exchange rates from backend (cached for 1 hour)
  const { data: exchangeRates = [], isLoading } = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: async () => {
      const res = await fetch('/api/exchange-rates?isActive=true');
      if (!res.ok) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch exchange rates');
        }
        return [];
      }
      const data = await res.json();
      return data.data || [];
    },
    staleTime: 1000 * 60 * 60, // Cache 1 hour
    retry: 2,
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache 24 hours
  });

  // Find exchange rate between two currencies
  const findRate = (fromCode: string = targetCurrency, toCode: string = targetCurrency): number | null => {
    const sourceCode = fromCode.toUpperCase();
    const targetCode = toCode.toUpperCase();
    if (sourceCode === targetCode) return 1;

    const ratesBySource = new Map<string, Array<{ code: string; rate: number }>>();
    exchangeRates.forEach((exchangeRate: ExchangeRate) => {
      const rate = Number(exchangeRate.rate);
      const from = exchangeRate.fromCode?.toUpperCase();
      const to = exchangeRate.toCode?.toUpperCase();
      if (!from || !to || !Number.isFinite(rate) || rate <= 0) return;

      const directRates = ratesBySource.get(from) || [];
      directRates.push({ code: to, rate });
      ratesBySource.set(from, directRates);

      const reverseRates = ratesBySource.get(to) || [];
      reverseRates.push({ code: from, rate: 1 / rate });
      ratesBySource.set(to, reverseRates);
    });

    const queue: Array<{ code: string; rate: number }> = [{ code: sourceCode, rate: 1 }];
    const visited = new Set([sourceCode]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      if (current.code === targetCode) return current.rate;

      for (const next of ratesBySource.get(current.code) || []) {
        if (visited.has(next.code)) continue;
        visited.add(next.code);
        queue.push({ code: next.code, rate: current.rate * next.rate });
      }
    }

    return null;
  };

  const getCurrencyFractionDigits = (currencyCode: string): number => {
    const code = currencyCode.toUpperCase();
    const currencyMetadata = activeCurrencies.find((item) => item.code === code);

    if (currencyMetadata) return currencyMetadata.decimalPlaces;

    return new Intl.NumberFormat(getIntlLocale(locale), {
      style: 'currency',
      currency: code,
    }).resolvedOptions().maximumFractionDigits ?? 0;
  };

  // Convert amount from one currency to another
  const convertCurrency = (
    amount: number,
    fromCode: string = targetCurrency,
    toCode: string = targetCurrency
  ): number | null => {
    const sourceCode = fromCode.toUpperCase();
    const targetCode = toCode.toUpperCase();
    if (sourceCode === targetCode || amount === 0) return amount;

    const rate = findRate(sourceCode, targetCode);
    if (rate === null) return null;

    const multiplier = 10 ** getCurrencyFractionDigits(targetCode);

    return Math.round(amount * rate * multiplier) / multiplier;
  };

  const formatCurrencyAmount = (amount: number, currencyCode: string = targetCurrency): string => {
    const code = currencyCode.toUpperCase();
    const currencyMetadata = activeCurrencies.find((item) => item.code === code);
    const fractionDigits = currencyMetadata
      ? {
          minimumFractionDigits: currencyMetadata.decimalPlaces,
          maximumFractionDigits: currencyMetadata.decimalPlaces,
        }
      : {};

    return new Intl.NumberFormat(getIntlLocale(locale), {
      style: 'currency',
      currency: code,
      ...fractionDigits,
    }).format(amount);
  };

  const canConvertCurrency = (
    fromCode: string,
    toCode: string = targetCurrency
  ): boolean => findRate(fromCode, toCode) !== null;

  const formatConvertedPrice = (
    amount: number,
    fromCode: string = targetCurrency,
    toCode: string = targetCurrency
  ): string => {
    const convertedAmount = convertCurrency(amount, fromCode, toCode);

    if (convertedAmount === null) return formatCurrencyAmount(amount, fromCode);

    return formatCurrencyAmount(convertedAmount, toCode);
  };

  return {
    convertCurrency,
    formatConvertedPrice,
    canConvertCurrency,
    isLoading,
    targetCurrency,
    exchangeRates,
  };
};
