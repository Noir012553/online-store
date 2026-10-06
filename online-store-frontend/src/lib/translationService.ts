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

export class TranslationServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly params: Record<string, string> = {}
  ) {
    super(code);
    this.name = 'TranslationServiceError';
  }
}

class TranslationService {
  async getStaticTranslations(
    lang: string,
    namespace: string = 'common',
    signal?: AbortSignal
  ): Promise<Record<string, string>> {
    if (!namespace.trim()) {
      throw new TranslationServiceError('TRANSLATION_NAMESPACE_REQUIRED');
    }

    const response = await fetch(`${API_BASE}/translations?lang=${lang}&ns=${namespace}`, {
      headers: { 'Content-Type': 'application/json' },
      signal,
    });
    if (!response.ok) {
      throw new TranslationServiceError('TRANSLATION_NAMESPACE_FETCH_FAILED', {
        status: String(response.status),
      });
    }

    const data: TranslationResponse = await response.json();
    if (!data.success) throw new TranslationServiceError('TRANSLATION_NAMESPACE_FETCH_FAILED');
    return data.data.translations;
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
      throw new TranslationServiceError('TRANSLATION_TARGET_LANGUAGE_REQUIRED');
    }
    if (!sourceLang) {
      throw new TranslationServiceError('TRANSLATION_SOURCE_LANGUAGE_REQUIRED');
    }

    const response = await fetch(`${API_BASE}/translations/translate?lang=${targetLang}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetLang, sourceLang, useCache }),
      signal,
    });
    if (!response.ok) {
      throw new TranslationServiceError('TRANSLATION_REQUEST_FAILED', {
        status: String(response.status),
      });
    }

    const data: TranslateTextResponse = await response.json();
    if (!data.success || typeof data.data?.translatedText !== 'string' || !data.data.translatedText.trim()) {
      throw new TranslationServiceError('TRANSLATION_SERVICE_FAILED');
    }
    return data.data.translatedText;
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

}

export const translationService = new TranslationService();

export type { TranslationResponse, TranslateTextResponse };
