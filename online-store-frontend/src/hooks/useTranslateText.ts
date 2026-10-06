import { useCallback } from 'react';
import { API_BASE_PATH } from '../config';
import { useLanguage } from '../lib/i18n';

interface TranslateResult {
  originalText: string;
  translatedText: string;
  targetLang: string;
  fromCache: boolean;
}

export function useTranslateText() {
  const { locale } = useLanguage();
  const apiBase = API_BASE_PATH;

  const translateText = useCallback(
    async (text: string, targetLang?: string, sourceLang?: string): Promise<string> => {
      const lang = targetLang || locale;
      const source = sourceLang || locale;

      if (!text) {
        return text;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20_000);

      try {
        const response = await fetch(`${apiBase}/translations/translate?lang=${lang}`, {
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
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Translation request failed with status ${response.status}`);
        }

        const json = await response.json();
        const translatedText = json.data?.translatedText;
        if (typeof translatedText !== 'string' || !translatedText.trim()) {
          throw new Error('Translation response did not contain translated text');
        }
        return translatedText;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [locale, apiBase]
  );

  return { translateText };
}
