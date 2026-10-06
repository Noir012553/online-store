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
  refreshLocaleConfig: () => Promise<void>;
}

const LANGUAGE_CONFIG_UPDATED_EVENT = 'language-config-updated';
const LANGUAGE_CONFIG_UPDATED_STORAGE_KEY = 'laptopstore_language_config_updated';

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
  const [loadingNamespaces, setLoadingNamespaces] = useState<Record<string, boolean>>({});
  const [isChangingLocale, setIsChangingLocale] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [localeConfigs, setLocaleConfigs] = useState<ActiveLocaleConfig[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const namespacesToLoadRef = useRef<Set<Namespace>>(new Set());
  const missingTranslationWarningsRef = useRef(new Set<string>());
  const pendingLoadRef = useRef(false);

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

  const refreshLocaleConfig = useCallback(async () => {
    const { defaultLocale, locales } = await fetchActiveLocaleConfig();
    applyLocaleConfig(defaultLocale || DEFAULT_LOCALE, locales, getStoredLocale());
  }, [applyLocaleConfig]);

  useEffect(() => {
    const refreshOnConfigChange = () => {
      refreshLocaleConfig().catch(() => undefined);
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === LANGUAGE_CONFIG_UPDATED_STORAGE_KEY) {
        refreshOnConfigChange();
      }
    };

    window.addEventListener('focus', refreshOnConfigChange);
    window.addEventListener(LANGUAGE_CONFIG_UPDATED_EVENT, refreshOnConfigChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('focus', refreshOnConfigChange);
      window.removeEventListener(LANGUAGE_CONFIG_UPDATED_EVENT, refreshOnConfigChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [refreshLocaleConfig]);

  const loadingRef = useRef<Record<string, boolean>>({});
  const loadedTranslationsRef = useRef(loadedTranslations);

  useEffect(() => {
    loadedTranslationsRef.current = loadedTranslations;
  }, [loadedTranslations]);

  const loadNamespace = useCallback(
    async (ns: Namespace) => {
      const cacheKey = `${locale}_${ns}`;

      const isAlreadyCached = loadedTranslationsRef.current[cacheKey] !== undefined;
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
    [locale]
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

      // Eagerly load shared interface namespaces to avoid visible fallback keys.
      loadNamespace('products');
      loadNamespace('components');
      loadNamespace('pagination');

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

      try {
        // Update locale immediately (SWR: keep old data, show loading indicator)
        setLocaleState(newLocale);
        setStoredLocale(newLocale);
        document.documentElement.lang = newLocale;

        // Cancel any in-flight requests from previous language
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        // Clear namespace loading states
        setLoadingNamespaces({});
        loadingRef.current = {};
        namespacesToLoadRef.current.clear();
        pendingLoadRef.current = false;

        // Load translations for new locale asynchronously
        // 'common' is the main namespace loaded on mount
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const cacheKey = `${newLocale}_common`;
        const translations = await translationService.getStaticTranslations(newLocale, 'common', controller.signal);

        if (!controller.signal.aborted) {
          setLoadedTranslations((prev) => ({
            ...prev,
            [cacheKey]: translations,
          }));

          // Also load 'products' namespace immediately to avoid spec fallback
          const productsController = new AbortController();
          abortControllerRef.current = productsController;
          const productsCacheKey = `${newLocale}_products`;
          const productsTranslations = await translationService.getStaticTranslations(newLocale, 'products', productsController.signal);
          if (!productsController.signal.aborted) {
            setLoadedTranslations((prev) => ({
              ...prev,
              [productsCacheKey]: productsTranslations,
            }));
          }
        }

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
      const warnMissingTranslation = (source: string) => {
        if (process.env.NODE_ENV !== 'development') return;
        const warningKey = `${locale}:${namespace}:${keyPath}`;
        if (missingTranslationWarningsRef.current.has(warningKey)) return;
        missingTranslationWarningsRef.current.add(warningKey);
        console.warn(`[i18n] Missing ${locale}/${namespace}:${keyPath}; resolved from ${source}.`);
      };

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
        if (result !== keyPath) return result;
      }

      // Fallback to common namespace if not found in specific namespace
      if (commonData) {
        const result = getNestedValue(commonData, keyPath);
        if (result !== keyPath) return result;
      }

      // If still not found, search through all loaded namespaces
      for (const [cKey, nsData] of Object.entries(loadedTranslations)) {
        // Skip the namespaces we already checked
        if (cKey === cacheKey || cKey === commonCacheKey || !cKey.startsWith(`${locale}_`)) {
          continue;
        }
        const result = getNestedValue(nsData, keyPath);
        if (result !== keyPath) return result;
      }

      if (namespaceData || commonData) {
        warnMissingTranslation('the translation key itself');
      }

      return keyPath;
    },
    [locale, loadedTranslations, loadingNamespaces]
  );

  useEffect(() => {
    setApiErrorTranslator(t);
    return () => setApiErrorTranslator();
  }, [t]);

  const availableLocales = useMemo(
    () => (localeConfigs.length
      ? localeConfigs.map((item) => item.code as Locale)
      : SUPPORTED_LOCALES),
    [localeConfigs]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, setLocale, t, loadNamespace, isLoadingNamespace, isChangingLocale, isHydrated, availableLocales, localeConfigs, refreshLocaleConfig }),
    [locale, setLocale, t, loadNamespace, isLoadingNamespace, isChangingLocale, isHydrated, availableLocales, localeConfigs, refreshLocaleConfig]
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
