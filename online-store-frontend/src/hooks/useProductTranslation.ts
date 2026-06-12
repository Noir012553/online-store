import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../lib/context/LanguageContext';
import { translationService } from '../lib/translationService';

interface TranslatedProduct {
  name: string;
  description: string;
  specs?: Record<string, string>;
  features?: string[];
  categoryName?: string;
}

export function useProductTranslation(productId: string) {
  const { locale } = useLanguage();
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  const { data, isLoading, error } = useQuery({
    queryKey: ['product-translation', productId, locale],
    queryFn: async () => {
      if (!productId || locale === 'vi') {
        return null;
      }
      const response = await fetch(
        `${apiBase}/api/products/${productId}/translations?lang=${locale}`
      );
      if (!response.ok) {
        return null;
      }
      const json = await response.json();
      return json.data as TranslatedProduct;
    },
    gcTime: 5 * 60 * 1000,
    staleTime: 1 * 60 * 1000,
    enabled: !!productId && locale !== 'vi',
  });

  return {
    translation: data,
    isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
