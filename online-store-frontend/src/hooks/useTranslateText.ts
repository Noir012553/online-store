import { useCallback } from 'react';
import { useLanguage } from '../lib/i18n';

interface TranslateResult {
  originalText: string;
  translatedText: string;
  targetLang: string;
  fromCache: boolean;
}

export function useTranslateText() {
  const { locale } = useLanguage();
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  const translateText = useCallback(
    async (text: string, targetLang?: string, sourceLang?: string): Promise<string> => {
      const lang = targetLang || locale;
      const source = sourceLang || locale;

      if (!text) {
        return text;
      }

      try {
        const response = await fetch(`${apiBase}/api/translations/translate?lang=${lang}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            targetLang: lang,
            sourceLang: source,
            useCache: true,
          }),
        });

        if (!response.ok) {
          return text;
        }

        const json = await response.json();
        return json.data?.translatedText || text;
      } catch (error) {
        return text;
      }
    },
    [locale, apiBase]
  );

  return { translateText };
}
