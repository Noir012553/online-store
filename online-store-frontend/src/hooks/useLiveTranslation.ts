import { useState, useCallback, useRef, useEffect } from 'react';
import { useLanguage } from '../lib/context/LanguageContext';
import { translationService } from '../lib/translationService';

interface LiveTranslationState {
  originalText: string;
  translatedText: string;
  isLoading: boolean;
  error: string | null;
}

export function useLiveTranslation() {
  const { locale } = useLanguage();
  const [translations, setTranslations] = useState<Record<string, LiveTranslationState>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingRequestsRef = useRef<Set<string>>(new Set());

  // Cleanup pending requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      pendingRequestsRef.current.clear();
    };
  }, []);

  const translateText = useCallback(
    async (text: string, textId: string, targetLang: string = locale) => {
      // Return cached translation if exists
      if (translations[textId]?.translatedText && !translations[textId]?.error) {
        return translations[textId].translatedText;
      }

      // Skip if already loading
      if (pendingRequestsRef.current.has(textId)) {
        return text;
      }

      // Mark as pending
      pendingRequestsRef.current.add(textId);

      setTranslations((prev) => ({
        ...prev,
        [textId]: {
          originalText: text,
          translatedText: text,
          isLoading: true,
          error: null,
        },
      }));

      try {
        // Create new abort controller if needed
        if (!abortControllerRef.current) {
          abortControllerRef.current = new AbortController();
        }

        const result = await translationService.translateText(
          text,
          targetLang,
          'vi',
          true,
          abortControllerRef.current.signal
        );

        // Only update state if request wasn't aborted
        if (!abortControllerRef.current.signal.aborted) {
          setTranslations((prev) => ({
            ...prev,
            [textId]: {
              originalText: text,
              translatedText: result,
              isLoading: false,
              error: null,
            },
          }));
          return result;
        }
        return text;
      } catch (err) {
        // Don't update state if request was aborted
        if (err instanceof Error && err.name === 'AbortError') {
          return text;
        }

        const errorMsg = err instanceof Error ? err.message : 'Translation failed';
        setTranslations((prev) => ({
          ...prev,
          [textId]: {
            originalText: text,
            translatedText: text,
            isLoading: false,
            error: errorMsg,
          },
        }));
        return text;
      } finally {
        pendingRequestsRef.current.delete(textId);
      }
    },
    [locale, translations]
  );

  const clearTranslation = useCallback((textId: string) => {
    // Abort any pending request for this text
    if (pendingRequestsRef.current.has(textId)) {
      pendingRequestsRef.current.delete(textId);
    }

    setTranslations((prev) => {
      const next = { ...prev };
      delete next[textId];
      return next;
    });
  }, []);

  const clearAllTranslations = useCallback(() => {
    // Abort all pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();
    }
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
