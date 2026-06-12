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
    async (text: string, targetLang?: string): Promise<string> => {
      const lang = targetLang || locale;
      
      if (!text || lang === 'vi') {
        return text;
      }

      try {
        const response = await fetch(`${apiBase}/api/translations/translate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            targetLang: lang,
            sourceLang: 'vi',
            useCache: true,
          }),
        });

        if (!response.ok) {
          return text;
        }

        const json = await response.json();
        return json.data?.translatedText || text;
      } catch (error) {
        console.error('Translation error:', error);
        return text;
      }
    },
    [locale, apiBase]
  );

  return { translateText };
}
