import { useState, useEffect, useRef, type FocusEvent, type KeyboardEvent, type UIEvent } from "react";
import { useLanguage } from "../lib/i18n";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../lib/i18n/types";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Gamepad2, LaptopMinimal, Briefcase, Palette, GraduationCap, Building, Laptop as LaptopIcon, Truck, Shield, Headphones, CreditCard, Keyboard, Mouse, Zap, Monitor, MonitorPlay, Volume2, PackageSearch } from "lucide-react";
import { features, getCategoryName, getDealEndTimestamp, isActiveDeal } from "../lib/data";
import { bannerAPI, productAPI, type BannerRecord } from "../lib/api";
import { useCategories } from "../lib/context/CategoryContext";
import { useCurrencyContext } from "../lib/context/CurrencyContext";
import { onBannerCreated, onBannerUpdated, onBannerDeleted, onBannerRestored, offEvent } from "../lib/socket";
import { useStickyBannerScroll } from "../hooks/useStickyBannerScroll";
import { useBannerVisibility } from "../hooks/useBannerVisibility";
import { useBrands } from "../hooks/useBrands";
import { ProductCard } from "../components/ProductCard";
import { BannerSlot } from "../components/BannerSlot";
import { Button } from "../components/ui/button";
import { ImageWithFallback } from "../components/image/ImageWithFallback";
import { ProductSkeleton } from "../components/ProductSkeleton";
import { EmptyState } from "../components/EmptyState";


const iconMap = {
  Gamepad2,
  LaptopMinimal,
  Briefcase,
  Palette,
  GraduationCap,
  Building,
  Laptop: LaptopIcon,
  Truck,
  Shield,
  Headphones,
  Headphone: Headphones,
  CreditCard,
  Keyboard,
  Mouse,
  Zap,
  Monitor,
  MonitorPlay,
  Volume2,
};


interface BackendProduct {
  _id: string;
  id?: string;
  name: string;
  brand: string;
  image?: string;
  price: number;
  baseCurrencyCode: string;
  originalPrice?: number;
  rating?: number;
  numReviews?: number;
  countInStock?: number;
  featured?: boolean;
  deal?: {
    discount: number;
    endTime?: string | Date;
  };
  category?: {
    _id?: string;
    id?: string;
    name?: string;
    slug?: string;
  } | string;
  categoryId?: string;
  specs?: Record<string, string | number>;
  description?: string;
  [key: string]: any;
}

type HeroSlide = {
  title: string;
  subtitle: string;
  description: string;
  image: string;
  cta?: string;
  link?: string;
  openInNewTab?: boolean;
  sortOrder?: number;
};

type HomeCategory = {
  _id: string;
  name: string;
  slug?: string;
  key?: string;
  translationKey?: string;
  sourceNames?: string[];
  icon?: string;
};

const debugHomepage = (..._args: unknown[]): void => {};

const describeProductPayload = (payload: any) => ({
  payloadType: Array.isArray(payload) ? 'array' : payload === null ? 'null' : typeof payload,
  productCount: Array.isArray(payload?.products) ? payload.products.length : undefined,
  productIds: Array.isArray(payload?.products)
    ? payload.products.map((product: any) => product?._id || product?.id).filter(Boolean)
    : undefined,
  page: payload?.page,
  pages: payload?.pages,
  total: payload?.total,
  keys: payload && typeof payload === 'object' ? Object.keys(payload) : undefined,
});

const HOMEPAGE_ROUTE_ALIASES: Record<string, string> = {
  '/products/laptop-gaming': '/products/gaming-laptop',
  '/products/laptop-van-phong': '/products/office-laptop',
  '/products/laptop-office': '/products/office-laptop',
};

const FLASH_SALE_CATEGORY_SLUGS = new Set(['gaming-laptop', 'office-laptop']);
const CATEGORY_CARDS_PER_VIEW = 4;
const PRODUCT_CARDS_PER_VIEW = 4;

const normalizeCategorySlug = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const isFlashSaleCategory = (category: HomeCategory): boolean => (
  FLASH_SALE_CATEGORY_SLUGS.has(normalizeCategorySlug(category.slug))
);

const normalizeHomepageTargetUrl = (targetUrl?: string): string => {
  if (!targetUrl) return '';

  const [path, query] = targetUrl.split('?');
  const normalizedPath = HOMEPAGE_ROUTE_ALIASES[path] || path;
  return query ? `${normalizedPath}?${query}` : normalizedPath;
};

const normalizeCategoryKey = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const hasProductSpecs = (product: BackendProduct): boolean => (
  Boolean(product.specs && Object.keys(product.specs).length > 0)
);

const getCategoryIconKey = (category: HomeCategory): keyof typeof iconMap => {
  const categoryText = [category.name, ...(category.sourceNames || [])]
    .map(normalizeCategoryKey)
    .join(' ');

  if (/keyboard|bàn phím|teclado|clavier|tastatur|tangentbord/.test(categoryText)) return 'Keyboard';
  if (/mouse|chuột|souris|maus|mus/.test(categoryText)) return 'Mouse';
  if (/headphones?|tai nghe|casque|kopfhörer|hörlurar/.test(categoryText)) return 'Headphone';
  if (/gaming laptop|laptop gaming|gaming-laptop|laptop chơi game/.test(categoryText)) return 'Laptop';
  if (/office laptop|laptop office|laptop văn phòng|laptop bureau|office-laptop/.test(categoryText)) return 'LaptopMinimal';
  if (/audio|âm thanh|loa/.test(categoryText)) return 'Volume2';
  if (/gaming monitor|màn hình gaming/.test(categoryText)) return 'MonitorPlay';
  if (/monitor|màn hình/.test(categoryText)) return 'Monitor';

  return (category.icon || 'Laptop') as keyof typeof iconMap;
};

const getDealCardsPerView = (): number => {
  if (typeof window === 'undefined') return 3;
  if (window.matchMedia('(max-width: 639px)').matches) return 1;
  if (window.matchMedia('(max-width: 1023px)').matches) return 2;
  return 3;
};

function getCircularItems<T>(items: T[], startIndex: number, count: number): T[] {
  if (items.length === 0 || count <= 0) return [];

  const normalizedStart = ((startIndex % items.length) + items.length) % items.length;
  return Array.from({ length: Math.min(count, items.length) }, (_, index) => (
    items[(normalizedStart + index) % items.length]
  ));
}

function getRepeatedItems<T>(items: T[]): T[] {
  return items.length > 1 ? [...items, ...items, ...items] : items;
}

export default function Home() {
  const { loadNamespace, t, locale, isHydrated } = useLanguage();
  const { categories, isLoading: isLoadingCategories } = useCategories();
  const { currencyCode } = useCurrencyContext();
  const { brands } = useBrands();

  const buildHeroSlides = (): HeroSlide[] => {
    const safeCats = Array.isArray(categories) ? categories : [];
    const gamingCategory = safeCats.find((c: any) => c.translationKey === 'category_gaming_laptop' || c._id === process.env.NEXT_PUBLIC_GAMING_CATEGORY_ID);
    const officeCategory = safeCats.find((c: any) => c.translationKey === 'category_office_laptop' || c._id === process.env.NEXT_PUBLIC_OFFICE_CATEGORY_ID);

    const gamingSlug = gamingCategory ? (gamingCategory.slug || gamingCategory._id) : null;
    const officeSlug = officeCategory ? (officeCategory.slug || officeCategory._id) : null;

    return [
      {
        sortOrder: 0,
        title: t('gaming_powerhouse_title', 'home'),
        subtitle: t('gaming_powerhouse_subtitle', 'home'),
        description: t('gaming_powerhouse_desc', 'home'),
        image: "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?w=1200",
        cta: t('explore_gaming_laptops', 'home'),
        link: gamingSlug ? `/products/${gamingSlug}` : "/products",
      },
      {
        sortOrder: 1,
        title: t('professional_productivity_title', 'home'),
        subtitle: t('professional_productivity_subtitle', 'home'),
        description: t('professional_productivity_desc', 'home'),
        image: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?w=1200",
        cta: t('browse_office_laptops', 'home'),
        link: officeSlug ? `/products/${officeSlug}` : "/products",
      },
      {
        sortOrder: 2,
        title: t('innovation_quality_title', 'home'),
        subtitle: t('innovation_quality_subtitle', 'home'),
        description: t('innovation_quality_desc', 'home'),
        image: "https://images.unsplash.com/photo-1706101035106-119828e7b564?w=1200",
        cta: t('learn_more', 'home'),
        link: "/about",
      },
    ];
  };

  const fallbackHeroSlides = buildHeroSlides();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentDealSlide, setCurrentDealSlide] = useState(0);
  const [currentCategoryCardSlide, setCurrentCategoryCardSlide] = useState(0);
  const [currentCategorySlides, setCurrentCategorySlides] = useState<Record<string, number>>({});
  const [dealCardsPerView, setDealCardsPerView] = useState(getDealCardsPerView);
  const [timeLeft, setTimeLeft] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [dealEndTime, setDealEndTime] = useState<number | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<Record<string, BackendProduct[]>>({});
  const [dealProducts, setDealProducts] = useState<BackendProduct[]>([]);
  const [homepageHeroBanners, setHomepageHeroBanners] = useState<BannerRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [productLoadError, setProductLoadError] = useState(false);
  const [productRetryKey, setProductRetryKey] = useState(0);
  const [isDealQuickViewOpen, setIsDealQuickViewOpen] = useState(false);
  const [isHeroPaused, setIsHeroPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const heroCarouselRef = useRef<HTMLElement>(null);
  const categoryNavigationMobileCarouselRef = useRef<HTMLDivElement>(null);
  const categoryMobileCarouselRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dealMobileCarouselRef = useRef<HTMLDivElement>(null);
  const categoryCount = Array.isArray(categories) ? categories.length : 0;

  // Detect if hero carousel or footer is visible - hide banners when they are
  const { isBannerVisible } = useBannerVisibility({
    heroSelector: '#homepage-hero',
    footerSelector: 'footer',
    triggerThreshold: 0.3, // Hide banners when 30% of hero/footer is visible
  });

  // Sticky banner scroll with constraints - confined within content wrapper
  // minBannerTopDocument = banner won't go above this distance from page top (px)
  // Adjust this value based on your hero section height
  const { bannerRef } = useStickyBannerScroll({
    containerSelector: '#homepage-content-wrapper',
    minBannerTopDocument: 700, // Adjust this number to control minimum position
    headerHeight: 80,
    maxBottomOffset: 20,
    isVisible: isBannerVisible,
  });

  const getTextByLang = (field: any, currentLang: string): string => {
    if (typeof field === 'object') {
      if (field[currentLang]) return field[currentLang] || '';
      const fallbackChain = [currentLang, ...SUPPORTED_LOCALES.filter(l => l !== currentLang)];
      for (const lang of fallbackChain) {
        if (lang !== currentLang && field[lang]) return field[lang];
      }
      const firstLang = Object.keys(field)[0];
      if (firstLang) return field[firstLang] || '';
    }
    return field || '';
  };

  const adminHeroSlides: HeroSlide[] = homepageHeroBanners.map((banner, index) => {
    const currentLang = locale || DEFAULT_LOCALE;

    return {
      sortOrder: banner.sortOrder ?? index,
      title: getTextByLang(banner.title, currentLang),
      subtitle: getTextByLang(banner.subtitle, currentLang),
      description: getTextByLang(banner.description, currentLang),
      image: banner.image,
      cta: getTextByLang(banner.ctaText, currentLang),
      link: normalizeHomepageTargetUrl(banner.targetUrl),
      openInNewTab: banner.openInNewTab,
    };
  });

  const heroSlideMap = new Map<number, HeroSlide>();
  fallbackHeroSlides.forEach((slide, index) => {
    heroSlideMap.set(slide.sortOrder ?? index, slide);
  });
  adminHeroSlides.forEach((slide, index) => {
    heroSlideMap.set(slide.sortOrder ?? index, slide);
  });

  const heroSlidesToRender: HeroSlide[] = Array.from(heroSlideMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, slide]) => slide);

  useEffect(() => {
    loadNamespace('products');
    loadNamespace('components');
    loadNamespace('categories');
    loadNamespace('banner');
  }, [loadNamespace]);

  useEffect(() => {
    setCurrentSlide(0);
    const carousel = heroCarouselRef.current;
    if (!carousel || window.innerWidth >= 1024 || heroSlidesToRender.length <= 1) return;

    requestAnimationFrame(() => {
      carousel.scrollTo({ left: carousel.clientWidth, behavior: 'auto' });
    });
  }, [heroSlidesToRender.length]);

  // Fetch products from backend
  useEffect(() => {
    if (!isHydrated || isLoadingCategories) {
      debugHomepage('products:skipped-not-ready', {
        locale,
        currencyCode,
        isHydrated,
        isLoadingCategories,
      });
      setIsLoading(true);
      return;
    }

    let isMounted = true;
    const requestController = new AbortController();
    const contentCategories = Array.isArray(categories) ? categories : [];
    const flashSaleCategories = contentCategories.filter(isFlashSaleCategory);
    const flashSaleCategoryIds = new Set(flashSaleCategories.map((category) => category._id));

    const fetchCategoryProducts = async (category: HomeCategory) => {
      const requestDetails = {
        categoryId: category._id,
        categoryName: category.name,
        categorySlug: category.slug,
        mode: 'content',
        pageNumber: 1,
        pageSize: 8,
        lang: locale,
        locale,
        currencyCode,
        inStock: true,
        hasSpecs: true,
        highlighted: true,
      };
      debugHomepage('category:request-start', requestDetails);

      const response = await productAPI.getFeaturedProducts(
        1,
        undefined,
        category._id,
        undefined,
        8,
        undefined,
        undefined,
        true,
        locale,
        locale,
        currencyCode,
        true,
        undefined,
        undefined,
        true,
        undefined,
        undefined,
        { skipErrorToast: true, signal: requestController.signal },
      );

      debugHomepage('category:response-success', {
        ...requestDetails,
        ...describeProductPayload(response),
        products: response.products || [],
      });
      return [category._id, response.products || []] as const;
    };

    const fetchFlashSaleProducts = async (category: HomeCategory) => {
      const requestDetails = {
        categoryId: category._id,
        categoryName: category.name,
        categorySlug: category.slug,
        mode: 'flash',
        pageNumber: 1,
        pageSize: 8,
        lang: locale,
        locale,
        currencyCode,
        inStock: true,
        hasSpecs: true,
        hasDeal: true,
      };
      debugHomepage('flash-sale:request-start', requestDetails);

      const response = await productAPI.getFeaturedProducts(
        1,
        undefined,
        category._id,
        undefined,
        8,
        undefined,
        undefined,
        true,
        locale,
        locale,
        currencyCode,
        true,
        undefined,
        true,
        undefined,
        undefined,
        undefined,
        { skipErrorToast: true, signal: requestController.signal },
      );

      debugHomepage('flash-sale:response-success', {
        ...requestDetails,
        ...describeProductPayload(response),
        products: response.products || [],
      });
      return response.products || [];
    };

    const fetchData = async () => {
      const fetchStartedAt = Date.now();
      debugHomepage('products:fetch-start', {
        locale,
        currencyCode,
        categoryCount: contentCategories.length,
        flashSaleCategoryCount: flashSaleCategories.length,
        categories: contentCategories,
      });
      setIsLoading(true);
      setProductLoadError(false);

      try {
        const [categoryResults, flashResults] = await Promise.all([
          Promise.allSettled(contentCategories.map((category) => fetchCategoryProducts(category))),
          Promise.allSettled(flashSaleCategories.map((category) => fetchFlashSaleProducts(category))),
        ]);

        if (!isMounted) return;

        const categoryProductMap = Object.fromEntries(
          categoryResults
            .filter((result): result is PromiseFulfilledResult<readonly [string, BackendProduct[]]> => result.status === 'fulfilled')
            .map((result) => result.value),
        );
        const hasRequestFailure = [...categoryResults, ...flashResults]
          .some((result) => result.status === 'rejected');
        const dealCandidates = flashResults
          .filter((result): result is PromiseFulfilledResult<BackendProduct[]> => result.status === 'fulfilled')
          .flatMap((result) => result.value)
          .filter((product) => (
            typeof product.categoryId === 'string'
            && flashSaleCategoryIds.has(product.categoryId)
          ));
        const uniqueDeals = [...new Map(
          dealCandidates.map((product) => [product._id || product.id, product]),
        ).values()];
        const deals = uniqueDeals
          .filter((product) => isActiveDeal(product.deal))
          .sort((first, second) => {
            const specsDifference = Number(hasProductSpecs(second)) - Number(hasProductSpecs(first));
            if (specsDifference !== 0) return specsDifference;

            const discountDifference = Number(second.deal?.discount || 0) - Number(first.deal?.discount || 0);
            if (discountDifference !== 0) return discountDifference;

            const firstEnd = getDealEndTimestamp(first.deal) ?? Number.MAX_SAFE_INTEGER;
            const secondEnd = getDealEndTimestamp(second.deal) ?? Number.MAX_SAFE_INTEGER;
            return firstEnd - secondEnd;
          })
          .slice(0, 10);

        debugHomepage('categories:settled', {
          durationMs: Date.now() - fetchStartedAt,
          content: categoryResults,
          flashSale: flashResults,
        });
        debugHomepage('deals:transformed', {
          candidateCount: dealCandidates.length,
          activeDealCount: deals.length,
          productIds: deals.map((product) => product._id || product.id),
        });

        setCategoryProducts(categoryProductMap);
        setDealProducts(deals);
        setProductLoadError(hasRequestFailure);
        const dealEndTimes = deals
          .map((product) => getDealEndTimestamp(product.deal))
          .filter((endTime): endTime is number => endTime !== null);
        setDealEndTime(dealEndTimes.length > 0 ? Math.min(...dealEndTimes) : null);
      } catch (error) {
        debugHomepage('products:fetch-error', {
          durationMs: Date.now() - fetchStartedAt,
          errorName: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
        });
        if (isMounted && !requestController.signal.aborted) {
          setCategoryProducts({});
          setDealProducts([]);
          setProductLoadError(true);
        }
      } finally {
        debugHomepage('products:fetch-finish', {
          durationMs: Date.now() - fetchStartedAt,
          isMounted,
        });
        if (isMounted) setIsLoading(false);
      }
    };

    void fetchData().catch((error) => {
      if (!requestController.signal.aborted) {
        debugHomepage('products:unhandled-fetch-error', {
          errorName: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
    return () => {
      isMounted = false;
      requestController.abort();
    };
  }, [categories, currencyCode, isHydrated, isLoadingCategories, locale, productRetryKey]);

  useEffect(() => {
    const handleRuntimeError = (event: ErrorEvent) => {
      debugHomepage('runtime:error', {
        message: event.message,
        filename: event.filename,
        lineNumber: event.lineno,
        columnNumber: event.colno,
        stack: event.error?.stack,
      });
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      debugHomepage('runtime:unhandled-rejection', {
        errorName: reason instanceof Error ? reason.name : typeof reason,
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };

    window.addEventListener('error', handleRuntimeError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleRuntimeError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Fetch homepage hero banners and refresh them when admin changes are broadcast.
  useEffect(() => {
    if (!isHydrated) return;

    let isMounted = true;

    const refetchBanners = async () => {
      try {
        const response = await bannerAPI.getBanners('homepage_hero', true, 1, 10, locale as any);
        if (!isMounted) return;
        setHomepageHeroBanners(Array.isArray(response.banners) ? response.banners : []);
      } catch (error) {
        if (isMounted) {
          setHomepageHeroBanners([]);
        }
      }
    };

    const handleBannerCreated = () => refetchBanners();
    const handleBannerUpdated = () => refetchBanners();
    const handleBannerDeleted = () => refetchBanners();
    const handleBannerRestored = () => refetchBanners();

    void refetchBanners();
    onBannerCreated(handleBannerCreated);
    onBannerUpdated(handleBannerUpdated);
    onBannerDeleted(handleBannerDeleted);
    onBannerRestored(handleBannerRestored);

    return () => {
      isMounted = false;
      offEvent('banner-created', handleBannerCreated);
      offEvent('banner-updated', handleBannerUpdated);
      offEvent('banner-deleted', handleBannerDeleted);
      offEvent('banner-restored', handleBannerRestored);
    };
  }, [locale, isHydrated]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleMotionPreferenceChange);
    return () => mediaQuery.removeEventListener('change', handleMotionPreferenceChange);
  }, []);

  useEffect(() => {
    if (heroSlidesToRender.length <= 1 || isHeroPaused || prefersReducedMotion) return;

    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlidesToRender.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [heroSlidesToRender.length, isHeroPaused, prefersReducedMotion]);

  useEffect(() => {
    const carousel = heroCarouselRef.current;
    if (!carousel || window.innerWidth >= 1024 || heroSlidesToRender.length <= 1) return;

    carousel.scrollTo({
      left: (currentSlide + heroSlidesToRender.length) * carousel.clientWidth,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [currentSlide, heroSlidesToRender.length, prefersReducedMotion]);

  useEffect(() => {
    const updateDealCardsPerView = () => setDealCardsPerView(getDealCardsPerView());
    updateDealCardsPerView();
    window.addEventListener('resize', updateDealCardsPerView);
    return () => window.removeEventListener('resize', updateDealCardsPerView);
  }, []);

  useEffect(() => {
    setCurrentDealSlide((prev) => (dealProducts.length > 0 ? prev % dealProducts.length : 0));
    const mobileCarousel = dealMobileCarouselRef.current;
    if (mobileCarousel && dealProducts.length > 1) {
      requestAnimationFrame(() => {
        mobileCarousel.scrollLeft = mobileCarousel.scrollWidth / 3;
      });
    }
  }, [dealProducts.length]);

  useEffect(() => {
    setCurrentCategoryCardSlide((prev) => (categoryCount > 0 ? prev % categoryCount : 0));
    if (categoryCount <= 1) return;

    requestAnimationFrame(() => {
      const navigationCarousel = categoryNavigationMobileCarouselRef.current;
      if (navigationCarousel) navigationCarousel.scrollLeft = navigationCarousel.scrollWidth / 3;

      Object.values(categoryMobileCarouselRefs.current).forEach((carousel) => {
        if (carousel) carousel.scrollLeft = carousel.scrollWidth / 3;
      });
    });
  }, [categoryCount]);

  // Auto-rotate deal carousel slides (paused when quick view is open)
  useEffect(() => {
    if (dealProducts.length > 1 && !isDealQuickViewOpen) {
      const timer = setInterval(() => {
        setCurrentDealSlide((prev) => (prev + 1) % dealProducts.length);
      }, 6500);
      return () => clearInterval(timer);
    }
  }, [dealProducts.length, isDealQuickViewOpen]);

  useEffect(() => {
    if (!dealEndTime) {
      setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
      return;
    }

    const updateTimeLeft = () => {
      const remainingSeconds = Math.max(0, Math.floor((dealEndTime - Date.now()) / 1000));
      if (remainingSeconds === 0) {
        setDealProducts([]);
        setDealEndTime(null);
        return;
      }

      setTimeLeft({
        hours: Math.floor(remainingSeconds / 3600),
        minutes: Math.floor((remainingSeconds % 3600) / 60),
        seconds: remainingSeconds % 60,
      });
    };

    updateTimeLeft();
    const timer = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [dealEndTime]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % heroSlidesToRender.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + heroSlidesToRender.length) % heroSlidesToRender.length);
  };

  const handleHeroKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      prevSlide();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      nextSlide();
    }
  };

  const handleHeroBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsHeroPaused(false);
    }
  };

  const handleHeroScroll = (event: UIEvent<HTMLElement>) => {
    if (window.innerWidth >= 1024 || heroSlidesToRender.length <= 1) return;

    const slideWidth = event.currentTarget.clientWidth;
    const slideCount = heroSlidesToRender.length;
    if (!slideWidth) return;

    let rawIndex = Math.round(event.currentTarget.scrollLeft / slideWidth);
    if (rawIndex < slideCount) {
      event.currentTarget.scrollLeft += slideCount * slideWidth;
      rawIndex += slideCount;
    } else if (rawIndex >= slideCount * 2) {
      event.currentTarget.scrollLeft -= slideCount * slideWidth;
      rawIndex -= slideCount;
    }

    const nextIndex = (rawIndex - slideCount + slideCount) % slideCount;
    setCurrentSlide((prev) => (prev === nextIndex ? prev : nextIndex));
  };

  const nextDealSlide = () => {
    if (dealProducts.length <= 1) return;
    setCurrentDealSlide((prev) => (prev + 1) % dealProducts.length);
  };

  const prevDealSlide = () => {
    if (dealProducts.length <= 1) return;
    setCurrentDealSlide((prev) => (prev - 1 + dealProducts.length) % dealProducts.length);
  };

  const nextCategoryCardSlide = () => {
    if (categoryCount <= 1) return;
    setCurrentCategoryCardSlide((prev) => (prev + 1) % categoryCount);
  };

  const prevCategoryCardSlide = () => {
    if (categoryCount <= 1) return;
    setCurrentCategoryCardSlide((prev) => (prev - 1 + categoryCount) % categoryCount);
  };

  const nextCategorySlide = (categoryId: string, productCount: number) => {
    if (productCount <= 1) return;
    setCurrentCategorySlides((prev) => ({
      ...prev,
      [categoryId]: ((prev[categoryId] ?? 0) + 1) % productCount,
    }));
  };

  const prevCategorySlide = (categoryId: string, productCount: number) => {
    if (productCount <= 1) return;
    setCurrentCategorySlides((prev) => ({
      ...prev,
      [categoryId]: ((prev[categoryId] ?? 0) - 1 + productCount) % productCount,
    }));
  };

  const handleInfiniteCarouselScroll = (event: UIEvent<HTMLDivElement>, itemCount: number) => {
    if (itemCount <= 1) return;

    const carousel = event.currentTarget;
    const blockWidth = carousel.scrollWidth / 3;
    if (!blockWidth) return;

    if (carousel.scrollLeft <= 0) {
      carousel.scrollLeft += blockWidth;
    } else if (carousel.scrollLeft >= blockWidth * 2) {
      carousel.scrollLeft -= blockWidth;
    }
  };

  const categorySections = (Array.isArray(categories) ? categories as HomeCategory[] : [])
    .map((category) => ({
      category,
      products: (categoryProducts[category._id] || []).slice(0, 8),
    }))
    .filter(({ products }) => products.length > 0);
  const sectionsToRender = categorySections;

  debugHomepage('render:sections', {
    isLoading,
    categoryCount: Array.isArray(categories) ? categories.length : 0,
    categorySections: categorySections.map(({ category, products }) => ({
      categoryId: category._id,
      categoryName: category.name,
      categorySlug: category.slug,
      productCount: products.length,
      productIds: products.map((product) => product._id || product.id),
    })),
    sectionsToRender: sectionsToRender.map(({ category, products }) => ({
      categoryId: category._id,
      categoryName: category.name,
      productCount: products.length,
      productIds: products.map((product) => product._id || product.id),
    })),
  });

  return (
    <div className="animate-in fade-in duration-500 bg-white">
      <section
        ref={heroCarouselRef}
        id="homepage-hero"
        className="relative flex h-[420px] snap-x snap-mandatory overflow-x-auto hide-scrollbar bg-gray-900 sm:h-[calc(100vh-80px)] lg:block lg:overflow-hidden"
        role="region"
        aria-roledescription="carousel"
        aria-label={t('banner_homepage_hero', 'banner')}
        tabIndex={0}
        onKeyDown={handleHeroKeyDown}
        onMouseEnter={() => setIsHeroPaused(true)}
        onMouseLeave={() => setIsHeroPaused(false)}
        onFocusCapture={() => setIsHeroPaused(true)}
        onBlurCapture={handleHeroBlur}
        onScroll={handleHeroScroll}
      >
        {getRepeatedItems(heroSlidesToRender).map((slide, index) => {
          const slideCount = heroSlidesToRender.length;
          const logicalIndex = slideCount > 0 ? index % slideCount : 0;
          const isDesktopSlide = index < slideCount;
          const href = slide.link?.trim();
          const isInternalLink = Boolean(href && href.startsWith('/'));

          return (
            <div
              key={`${slide.title}-${index}`}
              aria-hidden={logicalIndex !== currentSlide}
              className={`relative h-full min-w-full snap-start ${isDesktopSlide ? `lg:absolute lg:inset-0 ${logicalIndex === currentSlide ? "lg:opacity-100 lg:scale-100" : "lg:pointer-events-none lg:opacity-0 lg:scale-105"}` : 'lg:hidden'} ${prefersReducedMotion ? '' : 'lg:transition-all lg:duration-1000'}`}
            >
              <ImageWithFallback
                src={slide.image}
                alt={slide.title}
                fill
                sizes="100vw"
                className="object-cover"
                loading={index === currentSlide ? 'eager' : 'lazy'}
                fetchPriority={index === currentSlide ? 'high' : 'low'}
              />
              <div className="absolute inset-0 bg-black/50" />
              <div className="absolute inset-0 mx-auto flex w-full items-center px-3 sm:px-4 lg:px-8">
                <div className="max-w-xl text-white">
                  <h1 className="mb-4 text-2xl font-bold sm:text-3xl lg:text-5xl">{slide.title}</h1>
                  {slide.subtitle && <p className="mb-2 text-base font-medium sm:text-lg lg:text-2xl">{slide.subtitle}</p>}
                  {slide.description && <p className="mb-6 text-xs sm:text-sm lg:text-lg">{slide.description}</p>}
                  {href && slide.cta ? (
                    isInternalLink ? (
                      <Button asChild size="sm" className="bg-red-600 hover:bg-red-700">
                        <Link href={href}>{slide.cta}</Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm" className="bg-red-600 hover:bg-red-700">
                        <a href={href} target={slide.openInNewTab ? '_blank' : undefined} rel={slide.openInNewTab ? 'noreferrer' : undefined}>
                          {slide.cta}
                        </a>
                      </Button>
                    )
                  ) : slide.cta ? (
                    <span className="inline-flex rounded-md bg-red-600 px-4 py-2 text-xs font-medium text-white sm:px-5 sm:py-3 sm:text-sm">
                      {slide.cta}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}

        {heroSlidesToRender.length > 1 && (
          <>
            <button
              onClick={prevSlide}
              aria-label={t('banner_previous', 'banner')}
              className="absolute left-2 top-1/2 z-50 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 lg:block sm:left-4"
            >
              <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
            <button
              onClick={nextSlide}
              aria-label={t('banner_next', 'banner')}
              className="absolute right-2 top-1/2 z-50 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 lg:block sm:right-4"
            >
              <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>

            <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-2">
              {heroSlidesToRender.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  aria-label={`${t('banner_indicator', 'banner')} ${index + 1}`}
                  aria-current={index === currentSlide ? 'true' : undefined}
                  onFocus={() => setIsHeroPaused(true)}
                  className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-colors ${index === currentSlide ? "bg-red-600" : "bg-white/50"
                    }`}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <div className="relative bg-white">
        {/* MAIN CONTENT WRAPPER with side banners */}
        <div id="homepage-content-wrapper" className="relative overflow-x-hidden bg-white">
          {/* LEFT BANNER - sticky with scroll constraints, confined to container, hidden when hero/footer visible */}
          <div
            ref={bannerRef}
            aria-hidden={!isBannerVisible}
            className={`sticky-side-banner fixed left-[5px] z-30 hidden h-fit w-[240px] transition-opacity duration-300 xl:block 2xl:w-[280px] ${!isBannerVisible ? 'opacity-0 pointer-events-none [&_*]:pointer-events-none' : 'opacity-100 pointer-events-auto'}`}
          >
            <BannerSlot slot="homepage_left" variant="image-only" className="w-full" limit={3} />
          </div>

          {/* RIGHT BANNER - sticky with scroll constraints, confined to container, hidden when hero/footer visible */}
          <div
            aria-hidden={!isBannerVisible}
            className={`sticky-side-banner fixed right-[5px] z-30 hidden h-fit w-[240px] transition-opacity duration-300 xl:block 2xl:w-[280px] ${!isBannerVisible ? 'opacity-0 pointer-events-none [&_*]:pointer-events-none' : 'opacity-100 pointer-events-auto'}`}
          >
            <BannerSlot slot="homepage_right" variant="image-only" className="w-full" limit={3} />
          </div>
          {categoryCount > 0 && (
            <section
              className="bg-white container mx-auto section-container-px py-4 sm:py-6"
              role={categoryCount > 1 ? 'region' : undefined}
              aria-roledescription={categoryCount > 1 ? 'carousel' : undefined}
              aria-label={categoryCount > 1 ? t('category_carousel', 'categories', 'Danh mục sản phẩm') : undefined}
            >
              <div
                ref={categoryNavigationMobileCarouselRef}
                className="hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto lg:hidden"
                onScroll={(event) => handleInfiniteCarouselScroll(event, categoryCount)}
              >
                {getRepeatedItems(categories).map((category, index) => {
                  const iconKey = getCategoryIconKey(category);
                  const Icon = iconMap[iconKey] || LaptopIcon;
                  const displayName = getCategoryName(category, locale);
                  const slug = category.slug || category._id;

                  return (
                    <Link
                      key={`${category._id}-${index}`}
                      href={`/products/${slug}`}
                      className="category-card flex min-w-[calc((100vw-3rem)/2)] snap-start flex-col items-center gap-2 rounded-lg border p-3 transition-all hover:border-red-600 hover:shadow-lg sm:min-w-[calc((100vw-5rem)/3)] sm:gap-3 sm:p-4"
                    >
                      <div className="category-icon-container w-12 h-12 sm:w-16 sm:h-16 bg-red-50 rounded-full flex items-center justify-center overflow-hidden">
                        <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-red-600" />
                      </div>
                      <span className="category-name text-center text-xs sm:text-sm">{displayName}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="hidden lg:flex lg:items-center lg:gap-3">
                {categoryCount > 1 && (
                  <button
                    onClick={prevCategoryCardSlide}
                    className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-black text-white transition-colors hover:bg-gray-800"
                    aria-label={t('carousel_previous', 'components')}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}

                <div className="flex-1 overflow-hidden">
                  <div
                    key={currentCategoryCardSlide}
                    className="grid grid-cols-4 gap-3 sm:gap-4 animate-in fade-in slide-in-from-right-4 duration-700"
                  >
                    {getCircularItems(categories, currentCategoryCardSlide, CATEGORY_CARDS_PER_VIEW)
                      .map((category, index) => {
                        const iconKey = getCategoryIconKey(category);
                        const Icon = iconMap[iconKey] || LaptopIcon;
                        const displayName = getCategoryName(category, locale);
                        const slug = category.slug || category._id;

                        return (
                          <Link
                            key={`${category._id}-${index}`}
                            href={`/products/${slug}`}
                            className="category-card flex flex-col items-center gap-3 border rounded-lg p-6 transition-all hover:border-red-600 hover:shadow-lg"
                          >
                            <div className="category-icon-container flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-red-50">
                              <Icon className="h-8 w-8 text-red-600" />
                            </div>
                            <span className="category-name text-center text-sm">{displayName}</span>
                          </Link>
                        );
                      })}
                  </div>
                </div>

                {categoryCount > 1 && (
                  <button
                    onClick={nextCategoryCardSlide}
                    className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-black text-white transition-colors hover:bg-gray-800"
                    aria-label={t('carousel_next', 'components')}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                )}
              </div>

              {categoryCount > 1 && (
                <div className="hidden lg:flex justify-center gap-2 mt-4" aria-label={t('category_carousel', 'categories', 'Danh mục sản phẩm')}>
                  {categories.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentCategoryCardSlide(index)}
                      className={`h-2.5 w-2.5 rounded-full transition-colors ${index === currentCategoryCardSlide ? 'bg-red-600' : 'bg-gray-300'}`}
                      aria-label={`${t('go_to_category_slide', 'categories', 'Đi tới nhóm danh mục')} ${index + 1}`}
                      aria-current={index === currentCategoryCardSlide ? 'true' : undefined}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {!isLoading && productLoadError && (
            <section className="bg-white py-6 sm:py-8">
              <div className="container mx-auto section-container-px">
                <EmptyState
                  icon={PackageSearch}
                  title={t('products_unavailable_title')}
                  description={t('products_unavailable_description')}
                  actionLabel={t('retry', 'common', 'Thử lại')}
                  onAction={() => setProductRetryKey((value) => value + 1)}
                />
              </div>
            </section>
          )}

          {(isLoading || sectionsToRender.length > 0) && (
            <section className="mt-4 bg-white pt-6 pb-6 sm:mt-0 sm:pt-8 sm:pb-8">
              <div className="container mx-auto section-container-px">
              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
                  {Array(8).fill(null).map((_, index) => (
                    <ProductSkeleton key={index} />
                  ))}
                </div>
              ) : sectionsToRender.length > 0 ? (
                <div className="space-y-10">
                  {sectionsToRender.map(({ category, products }) => (
                    <div key={category._id}>
                      <div className="flex items-center justify-between gap-4 mb-4 sm:mb-6">
                        <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                          {getCategoryName(category, locale)}
                        </h2>
                        <Link
                          href={category._id === 'all-products' ? '/products' : `/products/${category.slug || category._id}`}
                          className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline whitespace-nowrap"
                        >
                          {t('view_all_products', 'components')}
                        </Link>
                      </div>
                      <div className="relative hidden lg:flex lg:items-center lg:gap-3">
                        <button
                          onClick={() => prevCategorySlide(category._id, products.length)}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white transition-colors hover:bg-gray-800"
                          aria-label={t('carousel_previous', 'components')}
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>

                        <div className="flex-1 overflow-hidden">
                          <div className="grid grid-cols-4 gap-4 sm:gap-6 animate-in fade-in slide-in-from-right-4 duration-700">
                            {getCircularItems(products, currentCategorySlides[category._id] ?? 0, PRODUCT_CARDS_PER_VIEW)
                              .map((product, index) => (
                                <ProductCard key={`${product._id}-${index}`} laptop={product} />
                              ))}
                          </div>
                        </div>

                        <button
                          onClick={() => nextCategorySlide(category._id, products.length)}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white transition-colors hover:bg-gray-800"
                          aria-label={t('carousel_next', 'components')}
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </div>

                      <div
                        ref={(element) => {
                          categoryMobileCarouselRefs.current[category._id] = element;
                        }}
                        className="hide-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto lg:hidden sm:gap-6"
                        onScroll={(event) => handleInfiniteCarouselScroll(event, products.length)}
                      >
                        {getRepeatedItems(products).map((product, index) => (
                          <div key={`${product._id}-${index}`} className="min-w-[78vw] snap-start sm:min-w-[20rem]">
                            <ProductCard laptop={product} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-10 mb-8">
                <BannerSlot slot="homepage_inline" variant="strip" limit={3} />
              </div>

              </div>
            </section>
          )}

          {dealProducts.length > 0 && (
            <section className="bg-white container mx-auto section-container-px py-8 sm:py-12">
              <div className="bg-cyan-100 rounded-lg sm:rounded-2xl p-4 sm:p-8 border-2 border-red-500">
                <div className="text-center mb-6 sm:mb-8">
                  <h2 className="text-black mb-3 sm:mb-4 flex items-center justify-center gap-2 font-bold text-xl sm:text-2xl">
                    <Zap className="w-5 h-5 sm:w-6 sm:h-6" />
                    {t('flash_deal_title', 'home')}
                  </h2>
                  <p className="text-lg sm:text-xl mb-3 sm:mb-4 text-black font-bold">{t('limited_time_offer', 'home')}</p>
                  <div className="flex justify-center gap-1 sm:gap-2 md:gap-4">
                    <div className="bg-white px-2 sm:px-4 py-2 rounded text-xs sm:text-sm">
                      <div className="text-lg sm:text-2xl md:text-3xl text-red-500">{String(timeLeft.hours).padStart(2, "0")}</div>
                      <div className="text-xs text-gray-600">{t('hours_label', 'components')}</div>
                    </div>
                    <div className="text-lg sm:text-2xl md:text-3xl text-black">:</div>
                    <div className="bg-white px-2 sm:px-4 py-2 rounded text-xs sm:text-sm">
                      <div className="text-lg sm:text-2xl md:text-3xl text-red-500">{String(timeLeft.minutes).padStart(2, "0")}</div>
                      <div className="text-xs text-gray-600">{t('minutes_label', 'components')}</div>
                    </div>
                    <div className="text-lg sm:text-2xl md:text-3xl text-black">:</div>
                    <div className="bg-white px-2 sm:px-4 py-2 rounded text-xs sm:text-sm">
                      <div className="text-lg sm:text-2xl md:text-3xl text-red-500">{String(timeLeft.seconds).padStart(2, "0")}</div>
                      <div className="text-xs text-gray-600">{t('seconds_label', 'components')}</div>
                    </div>
                  </div>
                </div>

                <div className="relative hidden items-center gap-3 overflow-visible lg:flex">
                  {dealProducts.length > 1 && (
                    <button
                      onClick={prevDealSlide}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white transition-colors hover:bg-gray-800"
                      aria-label={t('carousel_previous', 'components')}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  )}

                  <div className="flex-1 overflow-hidden">
                    <div className="grid grid-cols-3 gap-4 sm:gap-6 animate-in fade-in slide-in-from-right-4 duration-700">
                      {getCircularItems(dealProducts, currentDealSlide, dealCardsPerView)
                        .map((product, index) => (
                          <ProductCard
                            key={`${product._id}-${index}`}
                            laptop={product}
                            onQuickViewToggle={setIsDealQuickViewOpen}
                          />
                        ))}
                    </div>
                  </div>

                  {dealProducts.length > 1 && (
                    <button
                      onClick={nextDealSlide}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white transition-colors hover:bg-gray-800"
                      aria-label={t('carousel_next', 'components')}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  )}
                </div>

                <div
                  ref={dealMobileCarouselRef}
                  className="hide-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto lg:hidden sm:gap-6"
                  onScroll={(event) => handleInfiniteCarouselScroll(event, dealProducts.length)}
                >
                  {getRepeatedItems(dealProducts).map((product, index) => (
                    <div key={`${product._id}-${index}`} className="min-w-[78vw] snap-start sm:min-w-[20rem]">
                      <ProductCard laptop={product} onQuickViewToggle={setIsDealQuickViewOpen} />
                    </div>
                  ))}
                </div>

                {dealProducts.length > 1 && (
                  <div className="mt-4 hidden justify-center gap-2 lg:flex" aria-label={t('go_to_deal_slide', 'components')}>
                    {dealProducts.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentDealSlide(index)}
                        className={`h-2.5 w-2.5 rounded-full transition-colors ${index === currentDealSlide ? "bg-red-600" : "bg-red-300"}`}
                        aria-label={`${t('go_to_deal_slide', 'components')} ${index + 1}`}
                        aria-current={index === currentDealSlide ? 'true' : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="bg-white py-8 sm:py-12">
            <div className="container mx-auto section-container-px">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                {features.map((feature, index) => {
                  const Icon = iconMap[feature.icon as keyof typeof iconMap];
                  return (
                    <div
                      key={index}
                      className="bg-white p-4 sm:p-6 rounded-lg text-center hover:shadow-lg transition-shadow"
                    >
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                        <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-red-600" />
                      </div>
                      <h3 className="mb-2 text-sm sm:text-base font-medium">{t(feature.titleKey)}</h3>
                      <p className="text-xs sm:text-sm text-gray-600">{t(feature.descKey)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="bg-white container mx-auto section-container-px py-8 sm:py-12">
            <div className="mb-5 flex items-end justify-between gap-4 sm:mb-6">
              <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">{t('brands_title', 'products')}</h2>
            </div>
            {brands.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-6">
                {brands.map((brand) => (
                  <div
                    key={brand._id}
                    className="group flex items-center justify-center rounded-lg border-2 border-gray-100 bg-white p-6 transition-all duration-300 animate-in fade-in zoom-in hover:border-red-200 hover:shadow-xl"
                  >
                    <div className="relative flex h-20 w-full items-center justify-center">
                      {brand.logo ? (
                        <ImageWithFallback
                          src={brand.logo}
                          alt={brand.name || t('brand', 'common')}
                          loading="lazy"
                          className="max-h-full max-w-full object-contain grayscale transition-all duration-300 group-hover:scale-110 group-hover:grayscale-0"
                        />
                      ) : (
                        <span className="text-center text-sm font-semibold text-gray-600">{brand.name}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                {t('brands_empty', 'products')}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
