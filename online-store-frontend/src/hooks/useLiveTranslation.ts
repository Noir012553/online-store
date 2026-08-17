import { useState, useCallback, useRef, useEffect } from 'react';
import { useLanguage } from '../lib/context/LanguageContext';
import { translationService } from '../lib/translationService';

interface LiveTranslationState {
  originalText: string;
  translatedText: string;
  isLoading: boolean;
  error: string | null;
}

const getTranslationKey = (textId: string, text: string, targetLang: string, sourceLang: string) =>
  JSON.stringify([textId, text, targetLang, sourceLang]);

export function useLiveTranslation() {
  const { locale } = useLanguage();
  const [translations, setTranslations] = useState<Record<string, LiveTranslationState>>({});
  const translationsRef = useRef(translations);
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const pendingRequestsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    translationsRef.current = translations;
  }, [translations]);

  useEffect(() => {
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
    pendingRequestsRef.current.clear();
    setTranslations({});
  }, [locale]);

  useEffect(() => {
    return () => {
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current.clear();
      pendingRequestsRef.current.clear();
    };
  }, []);

  const translateText = useCallback(
    async (text: string, textId: string, targetLang: string = locale, sourceLang: string = locale) => {
      const translationKey = getTranslationKey(textId, text, targetLang, sourceLang);
      const cachedTranslation = translationsRef.current[translationKey];

      if (cachedTranslation?.translatedText && !cachedTranslation.error && !cachedTranslation.isLoading) {
        return cachedTranslation.translatedText;
      }

      if (pendingRequestsRef.current.has(translationKey)) {
        return text;
      }

      const controller = new AbortController();
      controllersRef.current.set(translationKey, controller);
      pendingRequestsRef.current.add(translationKey);

      setTranslations((prev) => ({
        ...prev,
        [translationKey]: {
          originalText: text,
          translatedText: text,
          isLoading: true,
          error: null,
        },
      }));

      try {
        const result = await translationService.translateText(
          text,
          targetLang,
          sourceLang,
          true,
          controller.signal
        );

        if (controller.signal.aborted) return text;

        setTranslations((prev) => ({
          ...prev,
          [translationKey]: {
            originalText: text,
            translatedText: result,
            isLoading: false,
            error: null,
          },
        }));
        return result;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return text;
        }

        const errorMsg = err instanceof Error ? err.message : 'translation_failed';
        setTranslations((prev) => ({
          ...prev,
          [translationKey]: {
            originalText: text,
            translatedText: text,
            isLoading: false,
            error: errorMsg,
          },
        }));
        return text;
      } finally {
        pendingRequestsRef.current.delete(translationKey);
        controllersRef.current.delete(translationKey);
      }
    },
    [locale]
  );

  const clearTranslation = useCallback((textId: string) => {
    controllersRef.current.forEach((controller, translationKey) => {
      if (translationKey.startsWith(`[\"${textId}\"`)) {
        controller.abort();
        controllersRef.current.delete(translationKey);
        pendingRequestsRef.current.delete(translationKey);
      }
    });

    setTranslations((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((translationKey) => {
        if (translationKey.startsWith(`[\"${textId}\"`)) {
          delete next[translationKey];
        }
      });
      return next;
    });
  }, []);

  const clearAllTranslations = useCallback(() => {
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
    pendingRequestsRef.current.clear();
    setTranslations({});
  }, []);

  return {
    translations,
    translateText,
    clearTranslation,
    clearAllTranslations,
  };
}
