'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { type Locale, type Namespace, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../i18n/types';
import { translationService } from '../translationService';
import { setApiErrorTranslator } from '../errorHandler';
import { fetchActiveLocaleConfig, type ActiveLocaleConfig } from '../services/localeConfigService';

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (keyPath: string, defaultNamespace?: Namespace) => string;
  loadNamespace: (ns: Namespace) => Promise<void>;
  isLoadingNamespace: (ns: Namespace) => boolean;
  isChangingLocale: boolean;
  isHydrated: boolean;
  availableLocales: Locale[];
  localeConfigs: ActiveLocaleConfig[];
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

function getBrowserLocale(): Locale | undefined {
  if (typeof navigator === 'undefined') return undefined;

  const browserLocales = navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];

  return browserLocales
    .map((value) => value.toLowerCase().split('-')[0] as Locale)
    .find((value) => SUPPORTED_LOCALES.includes(value));
}

function getStoredLocale(): Locale | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const storedLocale = localStorage.getItem('laptopstore_lang');
    if (storedLocale && SUPPORTED_LOCALES.includes(storedLocale as Locale)) {
      return storedLocale as Locale;
    }

    return getBrowserLocale();
  } catch {
    return getBrowserLocale();
  }
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
  const [fallbackTranslations, setFallbackTranslations] = useState<Record<string, any>>({});
  const [loadingNamespaces, setLoadingNamespaces] = useState<Record<string, boolean>>({});
  const [isChangingLocale, setIsChangingLocale] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [localeConfigs, setLocaleConfigs] = useState<ActiveLocaleConfig[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fallbackControllerRef = useRef<AbortController | null>(null);
  const namespacesToLoadRef = useRef<Set<Namespace>>(new Set());
  const pendingLoadRef = useRef(false);
  const prevLocaleRef = useRef<Locale>(DEFAULT_LOCALE);

  const applyLocaleConfig = useCallback((defaultLocale: string, locales: ActiveLocaleConfig[], preferredLocale: Locale | undefined) => {
    const available = locales.map((item) => item.code as Locale);
    const selectedLocale = preferredLocale && available.includes(preferredLocale)
      ? preferredLocale
      : available.includes(defaultLocale as Locale)
        ? defaultLocale as Locale
        : available[0] ?? DEFAULT_LOCALE;

    setLocaleConfigs(locales);
    setLocaleState(selectedLocale);
    setStoredLocale(selectedLocale);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const storedLocale = getStoredLocale();

    fetchActiveLocaleConfig()
      .then(({ defaultLocale, locales }) => {
        if (isMounted) applyLocaleConfig(defaultLocale || DEFAULT_LOCALE, locales, storedLocale);
      })
      .catch(() => {
        if (isMounted) setLocaleState(storedLocale ?? DEFAULT_LOCALE);
      })
      .finally(() => {
        if (isMounted) setIsHydrated(true);
      });

    return () => {
      isMounted = false;
    };
  }, [applyLocaleConfig]);

  useEffect(() => {
    const refreshLocaleConfig = () => {
      fetchActiveLocaleConfig()
        .then(({ defaultLocale, locales }) => {
          applyLocaleConfig(defaultLocale || DEFAULT_LOCALE, locales, getStoredLocale());
        })
        .catch(() => undefined);
    };

    window.addEventListener('focus', refreshLocaleConfig);
    return () => window.removeEventListener('focus', refreshLocaleConfig);
  }, [applyLocaleConfig]);

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
          if (process.env.NODE_ENV === 'development') {
            console.error(`Failed to load translation namespace: ${ns}`, error);
          }
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

      // Eagerly load 'products' namespace to avoid spec keys showing as fallback
      loadNamespace('products');

      // Rule #1: Load fallback translations asynchronously for offline support
      // This ensures translations are available even if namespace is not loaded yet
      (async () => {
        try {
          const fallbacks = await translationService.getFallbackTranslations(locale, fallbackControllerRef.current?.signal);
          if (!fallbackControllerRef.current?.signal.aborted) {
            setFallbackTranslations(fallbacks);
          }
        } catch (error) {
          // Silently fail - not critical for UI
          if (error instanceof Error && error.name !== 'AbortError') {
            console.debug('[LanguageContext] Fallback translations load skipped:', error.message);
          }
        }
      })();
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
      const availableLocales = localeConfigs.length
        ? localeConfigs.map((item) => item.code as Locale)
        : SUPPORTED_LOCALES;
      if (!availableLocales.includes(newLocale) || newLocale === locale) return;

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
        if (fallbackControllerRef.current) {
          fallbackControllerRef.current.abort();
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

          // Also load 'products' namespace immediately to avoid spec fallback
          const productsController = new AbortController();
          abortControllerRef.current = productsController;
          const productsTranslations = await translationService.getStaticTranslations(newLocale, 'products', productsController.signal);
          if (!productsController.signal.aborted) {
            const productsCacheKey = `${newLocale}_products`;
            setLoadedTranslations((prev) => ({
              ...prev,
              [productsCacheKey]: productsTranslations,
            }));
          }
        }

        // Fetch fallback translations asynchronously (Rule #1: Offline support)
        const fallbackController = new AbortController();
        fallbackControllerRef.current = fallbackController;

        translationService.getFallbackTranslations(newLocale, fallbackController.signal)
          .then((fallbacks) => {
            if (!fallbackController.signal.aborted) {
              setFallbackTranslations(fallbacks);
            }
          })
          .catch((error) => {
            if (error instanceof Error && error.name !== 'AbortError') {
              if (process.env.NODE_ENV === 'development') {
                console.debug('[LanguageContext] Fallback translations load failed:', error.message);
              }
            }
          });
      } finally {
        setIsChangingLocale(false);
      }
    },
    [locale, localeConfigs]
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

      // Try fallback translations if not found in loaded namespaces (Rule #1: Offline support)
      if (fallbackTranslations && typeof fallbackTranslations === 'object') {
        for (const nsData of Object.values(fallbackTranslations)) {
          if (nsData && typeof nsData === 'object') {
            const result = getNestedValue(nsData, keyPath);
            if (result !== keyPath) {
              return result;
            }
          }
        }
      }

      // Return key as fallback if not found in any namespace or fallback
      return keyPath;
    },
    [locale, loadedTranslations, fallbackTranslations, loadingNamespaces]
  );

  useEffect(() => {
    setApiErrorTranslator(t);
    return () => setApiErrorTranslator();
  }, [t]);

  const availableLocales = localeConfigs.length
    ? localeConfigs.map((item) => item.code as Locale)
    : SUPPORTED_LOCALES;

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, setLocale, t, loadNamespace, isLoadingNamespace, isChangingLocale, isHydrated, availableLocales, localeConfigs }),
    [locale, setLocale, t, loadNamespace, isLoadingNamespace, isChangingLocale, isHydrated, availableLocales, localeConfigs]
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
