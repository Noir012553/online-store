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
          return text;
        }

        const json = await response.json();
        return json.data?.translatedText || text;
      } catch (error) {
        return text;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [locale, apiBase]
  );

  return { translateText };
}
