import { useQuery } from '@tanstack/react-query';
import { apiCall } from '../lib/api';
import { useLanguage } from '../lib/context/LanguageContext';

interface TranslatedProduct {
  name: string;
  description: string;
  brand?: string;
  specs?: Record<string, string>;
  specLabels?: Record<string, string>;
}

export function useProductTranslation(productId: string | null) {
  const { locale, isHydrated } = useLanguage();

  const { data, isLoading, error } = useQuery({
    queryKey: ['product-translation', productId, locale],
    queryFn: async ({ signal }) => {
      if (!productId) {
        return null;
      }

      const response = await apiCall<{ data?: TranslatedProduct }>(
        `/products/${encodeURIComponent(productId)}/translations?lang=${encodeURIComponent(locale)}`,
        {
          signal,
          timeout: 8000,
          skipErrorToast: true,
        },
      );
      return response?.data ?? null;
    },
    gcTime: 5 * 60 * 1000,
    staleTime: 1 * 60 * 1000,
    retry: false,
    enabled: Boolean(productId) && isHydrated,
  });

  return {
    translation: data,
    isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
