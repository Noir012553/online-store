import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../lib/context/LanguageContext';

interface TranslatedCategory {
  name: string;
  description: string;
}

export function useCategoryTranslation(categoryId: string) {
  const { locale } = useLanguage();
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  const { data, isLoading, error } = useQuery({
    queryKey: ['category-translation', categoryId, locale],
    queryFn: async () => {
      if (!categoryId || locale === 'vi') {
        return null;
      }
      const response = await fetch(
        `${apiBase}/api/categories/${categoryId}/translations?lang=${locale}`
      );
      if (!response.ok) {
        return null;
      }
      const json = await response.json();
      return json.data as TranslatedCategory;
    },
    gcTime: 5 * 60 * 1000,
    staleTime: 1 * 60 * 1000,
    enabled: !!categoryId && locale !== 'vi',
  });

  return {
    translation: data,
    isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
