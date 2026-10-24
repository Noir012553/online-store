import { useEffect, useMemo, useState } from 'react';
import type { CheckoutSummary } from '@/context/CheckoutContext';
import { useCurrencyContext } from '@/lib/context/CurrencyContext';
import { useAuth } from '@/lib/context/AuthContext';
import { useCart } from '@/lib/context/CartContext';
import { useLanguage } from '@/lib/i18n';
import { orderAPI } from '@/lib/api';
import { getIntlLocale } from '@/lib/localeUtils';

export function useCartSummary() {
  const { items } = useCart();
  const { user, isInitialized } = useAuth();
  const { currencyCode } = useCurrencyContext();
  const { locale } = useLanguage();
  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const cartItems = useMemo(
    () => items.map((item) => ({
      productId: String(item.laptop.id || item.laptop._id),
      quantity: item.quantity,
    })),
    [items]
  );

  useEffect(() => {
    if (!isInitialized || !user || cartItems.length === 0) {
      setSummary(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    orderAPI.getSummary({ cartItems, currencyCode }, locale, getIntlLocale(locale))
      .then((response) => {
        if (!cancelled) setSummary(response.data as CheckoutSummary);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cartItems, currencyCode, isInitialized, locale, user]);

  return { summary, isLoading };
}
