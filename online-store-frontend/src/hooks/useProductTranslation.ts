import { useQuery } from '@tanstack/react-query';
import { API_BASE_PATH } from '../config';
import { useLanguage } from '../lib/context/LanguageContext';

interface TranslatedProduct {
  name: string;
  description: string;
  specs?: Record<string, string>;
  features?: string[];
}

export function useProductTranslation(productId: string) {
  const { locale, isHydrated } = useLanguage();

  const { data, isLoading, error } = useQuery({
    queryKey: ['product-translation', productId, locale],
    queryFn: async () => {
      if (!productId) {
        return null;
      }
      const response = await fetch(
        `${API_BASE_PATH}/products/${productId}/translations?lang=${locale}`
      );
      if (!response.ok) {
        return null;
      }
      const json = await response.json();
      return json.data as TranslatedProduct;
    },
    gcTime: 5 * 60 * 1000,
    staleTime: 1 * 60 * 1000,
    enabled: !!productId && isHydrated,
  });

  return {
    translation: data,
    isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
