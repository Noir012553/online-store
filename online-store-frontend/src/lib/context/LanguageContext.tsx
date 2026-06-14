'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import { type Locale, type Namespace, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../i18n/types';
import { translationService } from '../translationService';

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (keyPath: string, defaultNamespace?: Namespace) => string;
  loadNamespace: (ns: Namespace) => Promise<void>;
  isLoadingNamespace: (ns: Namespace) => boolean;
  isChangingLocale: boolean;
  isHydrated: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getNestedValue(obj: unknown, path: string): string {
  // Database stores flat keys like "footer.description" since seeder uses flattenObject()
  // So we only need direct flat key lookup - no nested traversal needed
  if (typeof obj === 'object' && obj !== null) {
    const value = (obj as Record<string, unknown>)[path];
    if (typeof value === 'string') {
      return value;
    }
  }

  // Return original path as fallback if key not found
  return path;
}

function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  try {
    const stored = localStorage.getItem('laptopstore_lang');
    // Validate stored locale is in supported list, fallback to default if not
    if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
      return stored as Locale;
    }
    // Clear invalid locale from storage
    if (stored) {
      localStorage.removeItem('laptopstore_lang');
    }
  } catch {
    // localStorage not available
  }

  return DEFAULT_LOCALE;
}

function setStoredLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem('laptopstore_lang', locale);
  } catch {
    // localStorage not available
  }
}

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [loadedTranslations, setLoadedTranslations] = useState<Record<string, any>>({});
  const [loadingNamespaces, setLoadingNamespaces] = useState<Record<string, boolean>>({});
  const [isChangingLocale, setIsChangingLocale] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const namespacesToLoadRef = useRef<Set<Namespace>>(new Set());
  const pendingLoadRef = useRef(false);
  const prevLocaleRef = useRef<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const storedLocale = getStoredLocale();
    setLocaleState(storedLocale);
    setIsHydrated(true);
  }, []);

  const loadingRef = useRef<Record<string, boolean>>({});

  const loadNamespace = useCallback(
    async (ns: Namespace) => {
      const cacheKey = `${locale}_${ns}`;

      // Always load if not already in cache (even if currently loading)
      const isAlreadyCached = loadedTranslations[cacheKey] !== undefined;
      if (isAlreadyCached) {
        return;
      }

      // Check if already loading to prevent duplicate requests
      if (loadingRef.current[cacheKey]) {
        return;
      }

      loadingRef.current[cacheKey] = true;
      setLoadingNamespaces((prev) => ({ ...prev, [cacheKey]: true }));

      try {
        // Create new AbortController for this language's requests
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const translations = await translationService.getStaticTranslations(locale, ns, controller.signal);

        // Only update if request wasn't aborted
        if (!controller.signal.aborted) {
          setLoadedTranslations((prev) => ({
            ...prev,
            [cacheKey]: translations,
          }));
        }
      } catch (error) {
        // Don't log abort errors
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error(`Failed to load translation namespace: ${ns}`, error);
        }
      } finally {
        loadingRef.current[cacheKey] = false;
        setLoadingNamespaces((prev) => ({ ...prev, [cacheKey]: false }));
      }
    },
    [locale, loadedTranslations]
  );

  const isLoadingNamespace = useCallback(
    (ns: Namespace): boolean => {
      const cacheKey = `${locale}_${ns}`;
      return loadingNamespaces[cacheKey] ?? false;
    },
    [locale, loadingNamespaces]
  );

  useEffect(() => {
    if (isHydrated) {
      // Load 'common' which contains merged sections:
      // footer, profile, pagination, breadcrumbs, components
      // (via seeder's flattenObject - all keys stored under namespace 'common')
      loadNamespace('common');
    }
  }, [isHydrated, locale, loadNamespace]);

  useEffect(() => {
    if (pendingLoadRef.current && namespacesToLoadRef.current.size > 0) {
      pendingLoadRef.current = false;
      const namespacesToLoad = Array.from(namespacesToLoadRef.current);
      namespacesToLoadRef.current.clear();

      namespacesToLoad.forEach((ns) => {
        loadNamespace(ns);
      });
    }
  }, [loadingNamespaces, loadNamespace]);

  const setLocale = useCallback(
    async (newLocale: Locale) => {
      if (!SUPPORTED_LOCALES.includes(newLocale) || newLocale === locale) return;

      setIsChangingLocale(true);

      // Save previous locale for SWR fallback
      prevLocaleRef.current = locale;

      try {
        // Update locale immediately (SWR: keep old data, show loading indicator)
        setLocaleState(newLocale);
        setStoredLocale(newLocale);
        document.documentElement.lang = newLocale;

        // Cancel any in-flight requests from previous language
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        // Clear namespace loading states (but KEEP translations from old locale as fallback)
        setLoadingNamespaces({});
        loadingRef.current = {};
        namespacesToLoadRef.current.clear();
        pendingLoadRef.current = false;

        // Load translations for new locale asynchronously
        // 'common' is the main namespace loaded on mount
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const translations = await translationService.getStaticTranslations(newLocale, 'common', controller.signal);

        if (!controller.signal.aborted) {
          const cacheKey = `${newLocale}_common`;
          setLoadedTranslations((prev) => ({
            ...prev,
            [cacheKey]: translations,
          }));
        }
      } finally {
        setIsChangingLocale(false);
      }
    },
    [locale]
  );

  const t = useCallback(
    (keyPath: string, defaultNamespace: Namespace = 'common'): string => {
      const namespace = defaultNamespace;
      const cacheKey = `${locale}_${namespace}`;
      const commonCacheKey = `${locale}_common`;

      let namespaceData = loadedTranslations[cacheKey];
      const commonData = loadedTranslations[commonCacheKey];

      // Queue namespace for loading if not already loaded and not loading
      if (!namespaceData && namespace !== 'common' && !loadingNamespaces[cacheKey]) {
        namespacesToLoadRef.current.add(namespace);
        pendingLoadRef.current = true;
      }

      // Try to get translation from specific namespace first
      if (namespaceData) {
        const result = getNestedValue(namespaceData, keyPath);
        if (result !== keyPath) {
          return result;
        }
      }

      // Fallback to common namespace if not found in specific namespace
      if (commonData) {
        const result = getNestedValue(commonData, keyPath);
        if (result !== keyPath) {
          return result;
        }
      }

      // If still not found, search through all loaded namespaces
      for (const [cKey, nsData] of Object.entries(loadedTranslations)) {
        // Skip the namespaces we already checked
        if (cKey === cacheKey || cKey === commonCacheKey || !cKey.startsWith(`${locale}_`)) {
          continue;
        }
        const result = getNestedValue(nsData, keyPath);
        if (result !== keyPath) {
          return result;
        }
      }

      // Return key as fallback if not found in any namespace
      return keyPath;
    },
    [locale, loadedTranslations, loadingNamespaces]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, setLocale, t, loadNamespace, isLoadingNamespace, isChangingLocale, isHydrated }),
    [locale, setLocale, t, loadNamespace, isLoadingNamespace, isChangingLocale, isHydrated]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }

  return context;
}

export const useTranslation = useLanguage;
