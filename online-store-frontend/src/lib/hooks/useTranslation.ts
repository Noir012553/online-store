import { useContext, useEffect, useState } from 'react';
import { LanguageContext } from '../context/LanguageContext';
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
  const context = useContext(LanguageContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});

  if (!context) {
    throw new Error('useTranslation must be used within LanguageProvider');
  }

  const { currentLanguage } = context;

  useEffect(() => {
    const loadTranslations = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await translationService.getStaticTranslations(currentLanguage, namespace);
        setTranslations(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load translations'));
      } finally {
        setIsLoading(false);
      }
    };

    loadTranslations();
  }, [currentLanguage, namespace]);

  const t = (key: string, defaultValue?: string): string => {
    return translations[key] || defaultValue || key;
  };

  return {
    t,
    lang: currentLanguage,
    isLoading,
    error,
  };
}
