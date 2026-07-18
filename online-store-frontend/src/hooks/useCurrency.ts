import { useLanguage } from '../lib/i18n';
import { useCurrencyContext } from '../lib/context/CurrencyContext';
import { formatCurrencyWithMetadata } from '../lib/utils';

export function useCurrency() {
  const { locale } = useLanguage();
  const { currency } = useCurrencyContext();

  const formatPrice = (amount: number): string => formatCurrencyWithMetadata(amount, currency, locale);

  return {
    formatPrice,
    currency,
    locale,
  };
}
