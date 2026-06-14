import { indexedDbService } from './services/indexedDbService';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

interface TranslationResponse {
  success: boolean;
  data: {
    code: string;
    namespace: string;
    translations: Record<string, string>; // Flat dot-notation keys (e.g., 'ui.commandPalette')
  };
}

interface TranslateTextResponse {
  success: boolean;
  data: {
    originalText: string;
    translatedText: string;
    targetLang: string;
    fromCache: boolean;
  };
}

class TranslationService {
  async getStaticTranslations(
    lang: string,
    namespace: string = 'common',
    signal?: AbortSignal
  ): Promise<Record<string, string>> {
    try {
      const url = `${API_BASE}/api/translations?lang=${lang}&ns=${namespace}`;

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
      });

      if (!response.ok) {
        if (response.status === 404 || response.status === 500) {
          // Try IndexedDB fallback before returning empty
          const cached = await indexedDbService.get(lang, namespace);
          if (cached) {
            console.log(`[TranslationService] Using IndexedDB fallback for ${lang}_${namespace}`);
            return cached;
          }
          return {};
        }
        throw new Error(`Failed to fetch translations: ${response.statusText}`);
      }

      const data: TranslationResponse = await response.json();

      if (!data.success) {
        // Try IndexedDB fallback
        const cached = await indexedDbService.get(lang, namespace);
        if (cached) {
          return cached;
        }
        return {};
      }

      const translations = data.data.translations;

      // Cache to IndexedDB for offline support
      indexedDbService.save(lang, namespace, translations).catch((err) => {
        console.error('[TranslationService] Failed to cache to IndexedDB:', err);
      });

      return translations;
    } catch (error) {
      // Network error - try IndexedDB
      if (error instanceof Error) {
        console.warn('[TranslationService] Network error, trying IndexedDB:', error.message);
        const cached = await indexedDbService.get(lang, namespace);
        if (cached) {
          return cached;
        }
      }
      return {};
    }
  }

  async translateText(
    text: string,
    targetLang: string = 'en',
    sourceLang: string = 'vi',
    useCache: boolean = true,
    signal?: AbortSignal
  ): Promise<string> {
    try {
      const response = await fetch(`${API_BASE}/api/translations/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          targetLang,
          sourceLang,
          useCache,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`Translation failed: ${response.statusText}`);
      }

      const data: TranslateTextResponse = await response.json();

      if (!data.success) {
        throw new Error('Translation service error');
      }

      return data.data.translatedText;
    } catch (error) {
      // Return original text on abort (signal aborted)
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      return text;
    }
  }

  async getAllTranslationsByLanguage(lang: string): Promise<Record<string, Record<string, string>>> {
    try {
      const response = await fetch(`${API_BASE}/api/translations/lang/${lang}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch translations for language: ${lang}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error('Failed to load translations');
      }

      return data.data.namespaces;
    } catch (error) {
      return {};
    }
  }
}

export const translationService = new TranslationService();

export type { TranslationResponse, TranslateTextResponse };
