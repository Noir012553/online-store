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
  t: (keyPath: string, defaultNamespace?: Namespace, fallback?: string) => string;
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

const LOCAL_UI_FALLBACKS: Partial<Record<Locale, Record<string, string>>> = {
  vi: {
    brand_initials: 'LS',
    brand_name: 'Laptop Store',
    home: 'Trang chủ',
    products: 'Sản phẩm',
    allProducts: 'Tất cả sản phẩm',
    about: 'Giới thiệu',
    contact: 'Liên hệ',
    search_placeholder: 'Tìm kiếm sản phẩm...',
    shopping_cart: 'Giỏ hàng',
    change_language: 'Đổi ngôn ngữ',
    login: 'Đăng nhập',
    profile: 'Tài khoản',
    myOrders: 'Đơn hàng của tôi',
    admin: 'Quản trị',
    logout: 'Đăng xuất',
    toggle_menu: 'Mở menu',
    view_all_products: 'Xem tất cả sản phẩm',
    loading: 'Đang tải...',
    hours_label: 'Giờ',
    minutes_label: 'Phút',
    seconds_label: 'Giây',
    flash_deal_title: 'Ưu đãi chớp nhoáng',
    limited_time_offer: 'Ưu đãi có thời hạn',
    go_to_deal_slide: 'Chuyển đến ưu đãi',
    scroll_to_top: 'Về đầu trang',
    banner_previous: 'Banner trước',
    banner_next: 'Banner tiếp theo',
    banner_indicator: 'Chuyển đến banner',
    carousel_previous: 'Mục trước',
    carousel_next: 'Mục sau',
    no_products_found: 'Không tìm thấy sản phẩm',
    clear_all: 'Xóa tìm kiếm',
    items_count: 'sản phẩm',
    view_all: 'Xem tất cả',
    gaming_powerhouse_title: 'Bứt phá cùng laptop gaming',
    gaming_powerhouse_subtitle: 'Hiệu năng mạnh mẽ cho mọi trận đấu',
    gaming_powerhouse_desc: 'Khám phá những mẫu laptop gaming sẵn sàng đồng hành cùng bạn.',
    explore_gaming_laptops: 'Khám phá laptop gaming',
    professional_productivity_title: 'Tối ưu công việc mỗi ngày',
    professional_productivity_subtitle: 'Mỏng nhẹ, linh hoạt và hiệu quả',
    professional_productivity_desc: 'Chọn laptop văn phòng phù hợp cho nhịp sống hiện đại.',
    browse_office_laptops: 'Xem laptop văn phòng',
    innovation_quality_title: 'Công nghệ và chất lượng',
    innovation_quality_subtitle: 'Thiết bị đáng tin cậy cho mọi nhu cầu',
    innovation_quality_desc: 'Tìm sản phẩm phù hợp với phong cách và mục tiêu của bạn.',
    learn_more: 'Tìm hiểu thêm',
    feature_shipping_title: 'Giao hàng nhanh chóng',
    feature_shipping_desc: 'Đóng gói cẩn thận, giao hàng tận nơi.',
    feature_warranty_title: 'Bảo hành an tâm',
    feature_warranty_desc: 'Hỗ trợ bảo hành rõ ràng và đáng tin cậy.',
    feature_support_title: 'Hỗ trợ tận tình',
    feature_support_desc: 'Đội ngũ luôn sẵn sàng giải đáp thắc mắc.',
    feature_payment_title: 'Thanh toán an toàn',
    feature_payment_desc: 'Nhiều phương thức thanh toán tiện lợi.',
    brands_title: 'Thương hiệu nổi bật',
    brands_empty: 'Danh sách thương hiệu đang được cập nhật.',
    products_unavailable_title: 'Sản phẩm chưa sẵn sàng',
    products_unavailable_description: 'Không thể tải dữ liệu sản phẩm lúc này. Bạn vẫn có thể xem toàn bộ danh mục.',
    description: 'Thiết bị công nghệ chính hãng cho công việc, học tập và giải trí.',
    support: 'Hỗ trợ',
    aboutUs: 'Về chúng tôi',
    contactUs: 'Liên hệ với chúng tôi',
    warrantyPolicy: 'Chính sách bảo hành',
    returnPolicy: 'Chính sách đổi trả',
    shoppingGuide: 'Hướng dẫn mua hàng',
    noCategories: 'Danh mục đang được cập nhật.',
    address: 'Thành phố Hồ Chí Minh, Việt Nam',
    contactTitle: 'Liên hệ',
    contact_phone_display: '1900 0000',
    contact_email_display: 'support@laptopstore.vn',
    shippingPartners: 'Đơn vị vận chuyển',
    paymentMethods: 'Phương thức thanh toán',
    downloadApp: 'Tải ứng dụng',
    termsOfService: 'Điều khoản dịch vụ',
    privacyPolicy: 'Chính sách bảo mật',
    sitemap: 'Sơ đồ trang',
    separator: '|',
    copyright: '© 2025 Laptop Store. Bảo lưu mọi quyền.',
    madeWith: 'Phát triển với sự tận tâm.',
    ghn_icon_alt: 'Logo GHN',
    vnpay_logo_alt: 'Logo VNPay',
    app_store_alt: 'Tải trên App Store',
    google_play_alt: 'Tải trên Google Play',
    zalo_logo_alt: 'Logo Zalo',
    social_facebook: 'Facebook',
    social_instagram: 'Instagram',
    social_youtube: 'YouTube',
    social_twitter: 'Twitter',
    social_zalo: 'Zalo',
    brand: 'Thương hiệu',
    emailPlaceholder: 'Email của bạn',
    phonePlaceholder: 'Số điện thoại của bạn',
    emailLabel: 'Email',
    phoneLabel: 'Số điện thoại',
    subscribe: 'Đăng ký',
    sending: 'Đang gửi...',
    thankYouTitle: 'Cảm ơn bạn!',
    thankYouMessage: 'Thông tin của bạn đã được ghi nhận.',
    invalidEmail: 'Vui lòng nhập email hợp lệ.',
    invalidPhone: 'Vui lòng nhập số điện thoại hợp lệ.',
    successMessage: 'Đăng ký thành công.',
    errorMessage: 'Không thể đăng ký lúc này. Vui lòng thử lại.',
  },
  en: {
    brand_initials: 'LS',
    brand_name: 'Laptop Store',
    home: 'Home',
    products: 'Products',
    allProducts: 'All products',
    about: 'About',
    contact: 'Contact',
    search_placeholder: 'Search products...',
    shopping_cart: 'Shopping cart',
    change_language: 'Change language',
    login: 'Log in',
    profile: 'Profile',
    myOrders: 'My orders',
    admin: 'Admin',
    logout: 'Log out',
    toggle_menu: 'Open menu',
    view_all_products: 'View all products',
    loading: 'Loading...',
    hours_label: 'Hours',
    minutes_label: 'Minutes',
    seconds_label: 'Seconds',
    flash_deal_title: 'Flash deals',
    limited_time_offer: 'Limited-time offers',
    go_to_deal_slide: 'Go to deal',
    scroll_to_top: 'Back to top',
    banner_previous: 'Previous banner',
    banner_next: 'Next banner',
    banner_indicator: 'Go to banner',
    carousel_previous: 'Previous item',
    carousel_next: 'Next item',
    no_products_found: 'No products found',
    clear_all: 'Clear search',
    items_count: 'items',
    view_all: 'View all',
    gaming_powerhouse_title: 'Power through every game',
    gaming_powerhouse_subtitle: 'Performance built for every match',
    gaming_powerhouse_desc: 'Discover gaming laptops ready for your next challenge.',
    explore_gaming_laptops: 'Explore gaming laptops',
    professional_productivity_title: 'Make every workday better',
    professional_productivity_subtitle: 'Slim, flexible, and productive',
    professional_productivity_desc: 'Find the right office laptop for your daily workflow.',
    browse_office_laptops: 'Browse office laptops',
    innovation_quality_title: 'Innovation meets quality',
    innovation_quality_subtitle: 'Reliable devices for every need',
    innovation_quality_desc: 'Find technology that fits your style and goals.',
    learn_more: 'Learn more',
    feature_shipping_title: 'Fast delivery',
    feature_shipping_desc: 'Careful packing and reliable delivery.',
    feature_warranty_title: 'Reliable warranty',
    feature_warranty_desc: 'Clear and dependable warranty support.',
    feature_support_title: 'Friendly support',
    feature_support_desc: 'Our team is ready to help.',
    feature_payment_title: 'Secure payment',
    feature_payment_desc: 'Convenient payment options.',
    brands_title: 'Featured brands',
    brands_empty: 'Brand information is being updated.',
    products_unavailable_title: 'Products are temporarily unavailable',
    products_unavailable_description: 'We could not load product data right now. You can still browse the full catalog.',
    description: 'Genuine technology for work, study, and entertainment.',
    support: 'Support',
    aboutUs: 'About us',
    contactUs: 'Contact us',
    warrantyPolicy: 'Warranty policy',
    returnPolicy: 'Return policy',
    shoppingGuide: 'Shopping guide',
    noCategories: 'Categories are being updated.',
    address: 'Ho Chi Minh City, Vietnam',
    contactTitle: 'Contact',
    contact_phone_display: '1900 0000',
    contact_email_display: 'support@laptopstore.com',
    shippingPartners: 'Shipping partners',
    paymentMethods: 'Payment methods',
    downloadApp: 'Download the app',
    termsOfService: 'Terms of service',
    privacyPolicy: 'Privacy policy',
    sitemap: 'Sitemap',
    separator: '|',
    copyright: '© 2025 Laptop Store. All rights reserved.',
    madeWith: 'Built with care.',
    ghn_icon_alt: 'GHN logo',
    vnpay_logo_alt: 'VNPay logo',
    app_store_alt: 'Download on the App Store',
    google_play_alt: 'Get it on Google Play',
    zalo_logo_alt: 'Zalo logo',
    social_facebook: 'Facebook',
    social_instagram: 'Instagram',
    social_youtube: 'YouTube',
    social_twitter: 'Twitter',
    social_zalo: 'Zalo',
    brand: 'Brand',
    emailPlaceholder: 'Your email',
    phonePlaceholder: 'Your phone number',
    emailLabel: 'Email',
    phoneLabel: 'Phone number',
    subscribe: 'Subscribe',
    sending: 'Sending...',
    thankYouTitle: 'Thank you!',
    thankYouMessage: 'Your information has been received.',
    invalidEmail: 'Please enter a valid email.',
    invalidPhone: 'Please enter a valid phone number.',
    successMessage: 'Subscription successful.',
    errorMessage: 'Unable to subscribe right now. Please try again.',
  },
};

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
    (keyPath: string, defaultNamespace: Namespace = 'common', fallback?: string): string => {
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

      const localFallback = LOCAL_UI_FALLBACKS[locale]?.[keyPath]
        ?? LOCAL_UI_FALLBACKS.en?.[keyPath];

      return fallback ?? localFallback ?? keyPath;
    },
    [locale, loadedTranslations, fallbackTranslations, loadingNamespaces]
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
