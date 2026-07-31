import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../lib/context/LanguageContext';

interface TranslatedReview {
  name?: string;
  comment?: string;
}

export function useReviewTranslation(reviewId: string) {
  const { locale } = useLanguage();
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  const { data, isLoading, error } = useQuery({
    queryKey: ['review-translation', reviewId, locale],
    queryFn: async () => {
      if (!reviewId) {
        return null;
      }
      const response = await fetch(
        `${apiBase}/api/translations/reviews/${reviewId}?lang=${locale}`
      );
      if (!response.ok) {
        return null;
      }
      const json = await response.json();
      return json.data as TranslatedReview;
    },
    gcTime: 5 * 60 * 1000,
    staleTime: 1 * 60 * 1000,
    enabled: !!reviewId,
  });

  return {
    translation: data,
    isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
