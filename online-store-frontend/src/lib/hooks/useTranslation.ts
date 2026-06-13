import { useContext, useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { translationService } from '../translationService';

interface UseTranslationResult {
  t: (key: string, defaultValue?: string) => string;
  lang: string;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to get translations
 * Usage: const { t, lang } = useTranslation();
 *        <p>{t('ui.commandPalette')}</p>
 */
export function useTranslation(namespace: string = 'common'): UseTranslationResult {
  const { locale, isLoadingNamespace } = useLanguage();
  const [error, setError] = useState<Error | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadTranslations = async () => {
      try {
        setError(null);
        const data = await translationService.getStaticTranslations(locale, namespace);
        setTranslations(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load translations'));
      }
    };

    loadTranslations();
  }, [locale, namespace]);

  const t = (key: string, defaultValue?: string): string => {
    return translations[key] || defaultValue || key;
  };

  return {
    t,
    lang: locale,
    isLoading: isLoadingNamespace(namespace as any),
    error,
  };
}
