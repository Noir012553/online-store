import { indexedDbService } from './services/indexedDbService';

const API_BASE = '/api';

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
      // Ensure namespace is never empty - fallback to 'common'
      const validNamespace = !namespace || namespace.trim() === '' ? 'common' : namespace;
      const url = `${API_BASE}/translations?lang=${lang}&ns=${validNamespace}`;

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
      indexedDbService.save(lang, namespace, translations).catch(() => {});

      return translations;
    } catch (error) {
      // Network error - try IndexedDB
      if (error instanceof Error) {
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
    targetLang: string,
    sourceLang: string,
    useCache: boolean = true,
    signal?: AbortSignal
  ): Promise<string> {
    // Validate required parameters
    if (!targetLang) {
      throw new Error('Target language (targetLang) is required');
    }
    if (!sourceLang) {
      throw new Error('Source language (sourceLang) is required');
    }

    try {
      const response = await fetch(`${API_BASE}/translations/translate?lang=${targetLang}`, {
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
        throw new Error('translation_failed_error');
      }

      const data: TranslateTextResponse = await response.json();

      if (!data.success) {
        throw new Error('translation_service_error');
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
      const response = await fetch(`${API_BASE}/translations/lang/${lang}?lang=${lang}`);

      if (!response.ok) {
        throw new Error('fetch_translations_error');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error('load_translations_error');
      }

      return data.data.namespaces;
    } catch (error) {
      return {};
    }
  }

  // QUY TẮC #1: Get fallback translations for offline support
  // Returns all static translations for a language from Backend
  async getFallbackTranslations(lang: string, signal?: AbortSignal): Promise<Record<string, Record<string, string>>> {
    try {
      const url = `${API_BASE}/translations/fallback?lang=${lang}`;

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
      });

      if (!response.ok) {
        return {};
      }

      const data = await response.json();

      if (!data.success) {
        return {};
      }

      return data.data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      return {};
    }
  }
}

export const translationService = new TranslationService();

export type { TranslationResponse, TranslateTextResponse };
