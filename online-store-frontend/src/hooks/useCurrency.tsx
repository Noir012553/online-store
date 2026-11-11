import { useLanguage } from '../lib/i18n';
import { useCurrencyContext } from '../lib/context/CurrencyContext';

export function useCurrency() {
  const { currency } = useCurrencyContext();

  return { currency };
}
