import { useState, useEffect, useRef, type TouchEvent } from "react";
import { useLanguage } from "../lib/i18n";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../lib/i18n/types";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, Gamepad2, LaptopMinimal, Briefcase, Palette, GraduationCap, Building, Laptop as LaptopIcon, Truck, Shield, Headphones, CreditCard, Keyboard, Mouse, Zap, Monitor, MonitorPlay, Volume2 } from "lucide-react";
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
import { EmojiSvg } from "../components/EmojiSvg";
import { UI_EMOJI } from "../lib/uiEmoji";
import { ProductSkeleton } from "../components/ProductSkeleton";


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
  } | string;
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

const HOMEPAGE_ROUTE_ALIASES: Record<string, string> = {
  '/products/laptop-gaming': '/products/gaming-laptop',
  '/products/laptop-van-phong': '/products/laptop-office',
};

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

export default function Home() {
  const { loadNamespace, t, locale, isHydrated } = useLanguage();
  const { categories } = useCategories();
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
  const [currentCategorySlides, setCurrentCategorySlides] = useState<Record<string, number>>({});
  const [dealCardsPerView, setDealCardsPerView] = useState(getDealCardsPerView);
  const [timeLeft, setTimeLeft] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [dealEndTime, setDealEndTime] = useState<number | null>(null);
  const [allProducts, setAllProducts] = useState<BackendProduct[]>([]);
  const [categoryProducts, setCategoryProducts] = useState<Record<string, BackendProduct[]>>({});
  const [dealProducts, setDealProducts] = useState<BackendProduct[]>([]);
  const [homepageHeroBanners, setHomepageHeroBanners] = useState<BannerRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasProductLoadError, setHasProductLoadError] = useState(false);
  const [isDealQuickViewOpen, setIsDealQuickViewOpen] = useState(false);
  const heroTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Detect if hero carousel or footer is visible - hide banners when they are
  const { isBannerVisible } = useBannerVisibility({
    heroSelector: 'section.relative.bg-gray-900.overflow-hidden',
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
  }, [heroSlidesToRender.length]);

  // Fetch products from backend
  useEffect(() => {
    // Only fetch after hydration is complete to ensure locale is correct
    if (!isHydrated) {
      setIsLoading(false);
      return;
    }

    let isMounted = true; // Track if component is still mounted

    const fetchData = async () => {
      setIsLoading(true);
      setHasProductLoadError(false);
      try {
        const [productsResult, dealsResult] = await Promise.allSettled([
          productAPI.getFeaturedProducts(
            1,
            undefined,
            undefined,
            undefined,
            12,
            undefined,
            undefined,
            true,
            locale,
            locale,
            currencyCode,
          ),
          productAPI.getFeaturedProducts(
            1,
            undefined,
            undefined,
            undefined,
            12,
            undefined,
            undefined,
            true,
            locale,
            locale,
            currencyCode,
            undefined,
            undefined,
            true,
          ),
        ]);

        if (!isMounted) return;
        if (productsResult.status === 'rejected') throw productsResult.reason;

        setAllProducts(productsResult.value.products || []);

        const dealCandidates: BackendProduct[] = dealsResult.status === 'fulfilled'
          ? dealsResult.value.products || []
          : [];
        const deals = dealCandidates
          .filter((product: BackendProduct) => isActiveDeal(product.deal))
          .sort((first: BackendProduct, second: BackendProduct) => {
            const specsDifference = Number(hasProductSpecs(second)) - Number(hasProductSpecs(first));
            if (specsDifference !== 0) return specsDifference;

            const discountDifference = Number(second.deal?.discount || 0) - Number(first.deal?.discount || 0);
            if (discountDifference !== 0) return discountDifference;

            const firstEnd = getDealEndTimestamp(first.deal) ?? Number.MAX_SAFE_INTEGER;
            const secondEnd = getDealEndTimestamp(second.deal) ?? Number.MAX_SAFE_INTEGER;
            return firstEnd - secondEnd;
          })
          .slice(0, 10);

        setDealProducts(deals);
        const dealEndTimes = deals
          .map((product) => getDealEndTimestamp(product.deal))
          .filter((endTime): endTime is number => endTime !== null);
        setDealEndTime(dealEndTimes.length > 0 ? Math.min(...dealEndTimes) : null);

        const categoryResults = await Promise.allSettled(
          categories.map(async (category) => {
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
            );

            return [category._id, response.products || []] as const;
          }),
        );

        if (!isMounted) return;

        setCategoryProducts(Object.fromEntries(
          categoryResults
            .filter((result): result is PromiseFulfilledResult<readonly [string, BackendProduct[]]> => result.status === 'fulfilled')
            .map((result) => result.value),
        ));
      } catch (error) {
        if (isMounted) {
          setAllProducts([]);
          setCategoryProducts({});
          setDealProducts([]);
          setHasProductLoadError(true);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    // Cleanup function: mark component as unmounted
    return () => {
      isMounted = false;
    };
  }, [categories, currencyCode, locale, isHydrated]);

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

  // Auto-rotate hero slides
  useEffect(() => {
    if (heroSlidesToRender.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlidesToRender.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [heroSlidesToRender.length]);

  useEffect(() => {
    const updateDealCardsPerView = () => setDealCardsPerView(getDealCardsPerView());
    updateDealCardsPerView();
    window.addEventListener('resize', updateDealCardsPerView);
    return () => window.removeEventListener('resize', updateDealCardsPerView);
  }, []);

  useEffect(() => {
    setCurrentDealSlide((prev) => Math.min(prev, Math.max(dealProducts.length - dealCardsPerView, 0)));
  }, [dealProducts.length, dealCardsPerView]);

  // Auto-rotate deal carousel slides (paused when quick view is open)
  useEffect(() => {
    if (dealProducts.length > dealCardsPerView && !isDealQuickViewOpen) {
      const timer = setInterval(() => {
        setCurrentDealSlide((prev) => {
          const next = prev + 1;
          return next >= dealProducts.length - dealCardsPerView + 1 ? 0 : next;
        });
      }, 6500);
      return () => clearInterval(timer);
    }
  }, [dealCardsPerView, dealProducts.length, isDealQuickViewOpen]);

  useEffect(() => {
    if (!dealEndTime) {
      setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
      return;
    }

    const updateTimeLeft = () => {
      const remainingSeconds = Math.max(0, Math.floor((dealEndTime - Date.now()) / 1000));
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

  const handleHeroTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (window.innerWidth >= 1024) return;

    const touch = event.touches[0];
    heroTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleHeroTouchEnd = (event: TouchEvent<HTMLElement>) => {
    if (window.innerWidth >= 1024) {
      heroTouchStartRef.current = null;
      return;
    }

    const start = heroTouchStartRef.current;
    heroTouchStartRef.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    if (deltaX < 0) {
      nextSlide();
    } else {
      prevSlide();
    }
  };

  const nextDealSlide = () => {
    setCurrentDealSlide((prev) => Math.min(prev + 1, Math.max(dealProducts.length - dealCardsPerView, 0)));
  };

  const prevDealSlide = () => {
    setCurrentDealSlide((prev) => Math.max(prev - 1, 0));
  };

  const nextCategorySlide = (categoryId: string, productCount: number) => {
    setCurrentCategorySlides((prev) => ({
      ...prev,
      [categoryId]: Math.min((prev[categoryId] ?? 0) + 1, Math.max(productCount - 1, 0)),
    }));
  };

  const prevCategorySlide = (categoryId: string) => {
    setCurrentCategorySlides((prev) => ({
      ...prev,
      [categoryId]: Math.max((prev[categoryId] ?? 0) - 1, 0),
    }));
  };

  const categorySections = (Array.isArray(categories) ? categories as HomeCategory[] : [])
    .map((category) => ({
      category,
      products: (categoryProducts[category._id] || []).slice(0, 8),
    }))
    .filter(({ products }) => products.length > 0);
  const sectionsToRender = categorySections.length > 0
    ? categorySections
    : allProducts.length > 0
      ? [{ category: { _id: 'all-products', name: t('view_all_products') }, products: allProducts.slice(0, 8) }]
      : [];

  return (
    <div className="animate-in fade-in duration-500 bg-white">
      <section
        className="relative h-[420px] overflow-hidden bg-gray-900 sm:h-[calc(100vh-80px)]"
        onTouchStart={handleHeroTouchStart}
        onTouchEnd={handleHeroTouchEnd}
      >
        {heroSlidesToRender.map((slide, index) => {
          const href = slide.link?.trim();
          const isInternalLink = Boolean(href && href.startsWith('/'));

          return (
            <div
              key={`${slide.title}-${index}`}
              className={`absolute inset-0 transition-all duration-1000 ${index === currentSlide ? "opacity-100 scale-100" : "opacity-0 scale-105"
                }`}
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
              <div className="absolute inset-0 mx-auto flex w-full items-center px-4 sm:px-6 lg:px-8">
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
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-50 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            >
              <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
            <button
              onClick={nextSlide}
              aria-label={t('banner_next', 'banner')}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-50 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
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
            className={`sticky-side-banner fixed left-[5px] z-30 hidden h-fit w-[240px] pointer-events-none transition-opacity duration-300 xl:block 2xl:w-[280px] ${!isBannerVisible ? 'opacity-0 pointer-events-none [&_*]:pointer-events-none' : 'opacity-100'}`}
          >
            <BannerSlot slot="homepage_left" variant="image-only" className="w-full" limit={3} />
          </div>

          {/* RIGHT BANNER - sticky with scroll constraints, confined to container, hidden when hero/footer visible */}
          <div
            aria-hidden={!isBannerVisible}
            className={`sticky-side-banner fixed right-[5px] z-30 hidden h-fit w-[240px] pointer-events-none transition-opacity duration-300 xl:block 2xl:w-[280px] ${!isBannerVisible ? 'opacity-0 pointer-events-none [&_*]:pointer-events-none' : 'opacity-100'}`}
          >
            <BannerSlot slot="homepage_right" variant="image-only" className="w-full" limit={3} />
          </div>
          {Array.isArray(categories) && categories.length > 0 && (
            <section className="bg-white container mx-auto section-container-px py-4 sm:py-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                {categories.map((category) => {
                  const iconKey = getCategoryIconKey(category);
                  const Icon = iconMap[iconKey] || LaptopIcon;
                  const displayName = getCategoryName(category, locale);
                  const slug = category.slug || category._id;

                  return (
                    <Link
                      key={category._id}
                      href={`/products/${slug}`}
                      className="category-card flex flex-col items-center gap-2 sm:gap-3 p-3 sm:p-4 lg:p-6 border rounded-lg hover:border-red-600 hover:shadow-lg transition-all"
                    >
                      <div className="category-icon-container w-12 h-12 sm:w-16 sm:h-16 bg-red-50 rounded-full flex items-center justify-center overflow-hidden">
                        <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-red-600" />
                      </div>
                      <span className="category-name text-center text-xs sm:text-sm">{displayName}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

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
                      <div className="hidden lg:grid grid-cols-4 gap-4 sm:gap-6">
                        {products.map((product) => (
                          <ProductCard key={product._id} laptop={product} />
                        ))}
                      </div>

                      <div className="relative flex items-center gap-2 sm:gap-4 lg:hidden">
                        {products.length > 1 && (
                          <button
                            onClick={() => prevCategorySlide(category._id)}
                            className="shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black hover:bg-gray-800 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={(currentCategorySlides[category._id] ?? 0) === 0}
                            aria-label={t('carousel_previous', 'components')}
                          >
                            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                          </button>
                        )}

                        <div className="flex-1 overflow-hidden">
                          <div
                            key={`${category._id}-${currentCategorySlides[category._id] ?? 0}`}
                            className="grid grid-cols-1 gap-4 sm:gap-6 animate-in fade-in slide-in-from-right-4 duration-1000 ease-out"
                          >
                            {products
                              .slice(currentCategorySlides[category._id] ?? 0, (currentCategorySlides[category._id] ?? 0) + 1)
                              .map((product) => (
                                <ProductCard key={product._id} laptop={product} />
                              ))}
                          </div>
                        </div>

                        {products.length > 1 && (
                          <button
                            onClick={() => nextCategorySlide(category._id, products.length)}
                            className="shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black hover:bg-gray-800 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={(currentCategorySlides[category._id] ?? 0) >= products.length - 1}
                            aria-label={t('carousel_next', 'components')}
                          >
                            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center">
                  <AlertCircle className="mx-auto mb-4 h-10 w-10 text-gray-400" />
                  <h2 className="text-lg font-semibold text-gray-900">
                    {hasProductLoadError ? t('products_unavailable_title') : t('no_products_found')}
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                    {t('products_unavailable_description')}
                  </p>
                  <Link href="/products" className="mt-5 inline-flex text-sm font-medium text-red-600 hover:text-red-700 hover:underline">
                    {t('view_all_products')}
                  </Link>
                </div>
              )}

              <div className="mt-10 mb-8">
                <BannerSlot slot="homepage_inline" variant="strip" limit={3} />
              </div>

              <div className="flex justify-center">
                <Link href="/products">
                  <Button className="bg-red-600 hover:bg-red-700 text-black hover:text-yellow-400">{t('view_all_products')}</Button>
                </Link>
              </div>
            </div>
          </section>

          {dealProducts.length > 0 && (
            <section className="bg-white container mx-auto section-container-px py-8 sm:py-12">
              <div className="bg-cyan-100 rounded-lg sm:rounded-2xl p-4 sm:p-8 border-2 border-red-500">
                <div className="text-center mb-6 sm:mb-8">
                  <h2 className="text-black mb-3 sm:mb-4 flex items-center justify-center gap-2 font-bold text-xl sm:text-2xl">
                    <EmojiSvg emoji={UI_EMOJI.flashDeal} className="w-5 h-5 sm:w-6 sm:h-6" />
                    {t('flash_deal_title', 'home')}
                  </h2>
                  <p className="text-lg sm:text-xl mb-3 sm:mb-4 text-black font-bold">{t('limited_time_offer', 'home')}</p>
                  <div className="flex justify-center gap-1 sm:gap-2 md:gap-4">
                    <div className="bg-white px-2 sm:px-4 py-2 rounded text-xs sm:text-sm">
                      <div className="text-lg sm:text-2xl md:text-3xl text-red-500">{String(timeLeft.hours).padStart(2, "0")}</div>
                      <div className="text-xs text-gray-600">{t('hours_label')}</div>
                    </div>
                    <div className="text-lg sm:text-2xl md:text-3xl text-black">:</div>
                    <div className="bg-white px-2 sm:px-4 py-2 rounded text-xs sm:text-sm">
                      <div className="text-lg sm:text-2xl md:text-3xl text-red-500">{String(timeLeft.minutes).padStart(2, "0")}</div>
                      <div className="text-xs text-gray-600">{t('minutes_label')}</div>
                    </div>
                    <div className="text-lg sm:text-2xl md:text-3xl text-black">:</div>
                    <div className="bg-white px-2 sm:px-4 py-2 rounded text-xs sm:text-sm">
                      <div className="text-lg sm:text-2xl md:text-3xl text-red-500">{String(timeLeft.seconds).padStart(2, "0")}</div>
                      <div className="text-xs text-gray-600">{t('seconds_label')}</div>
                    </div>
                  </div>
                </div>

                {/* Auto-Carousel for Deal Products - Responsive: 1 on mobile, 2 on tablet, 3 on desktop */}
                <div className="relative overflow-visible flex items-center gap-2 sm:gap-4">
                  {/* Previous Button - Always visible but styled differently on mobile */}
                  {dealProducts.length > dealCardsPerView && (
                    <button
                      onClick={prevDealSlide}
                      className="shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black hover:bg-gray-800 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={currentDealSlide === 0}
                      aria-label={t('carousel_previous', 'components')}
                    >
                      <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  )}

                  {/* Main Carousel Container */}
                  <div className="flex-1 overflow-hidden">
                    <div
                      key={`${currentDealSlide}-${dealCardsPerView}`}
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 animate-in fade-in slide-in-from-right-4 duration-1000 ease-out"
                    >
                      {dealProducts
                        .slice(currentDealSlide, currentDealSlide + dealCardsPerView)
                        .map((product) => (
                          <ProductCard
                            key={product._id}
                            laptop={product}
                            onQuickViewToggle={setIsDealQuickViewOpen}
                          />
                        ))}
                    </div>
                  </div>

                  {/* Next Button - Always visible but styled differently on mobile */}
                  {dealProducts.length > dealCardsPerView && (
                    <button
                      onClick={nextDealSlide}
                      className="shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black hover:bg-gray-800 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={currentDealSlide >= dealProducts.length - dealCardsPerView}
                      aria-label={t('carousel_next', 'components')}
                    >
                      <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  )}
                </div>

                {/* Carousel Indicators */}
                {dealProducts.length > dealCardsPerView && (
                  <div className="flex justify-center gap-1.5 sm:gap-2 mt-4 sm:mt-6">
                    {Array.from({ length: dealProducts.length - dealCardsPerView + 1 }).map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentDealSlide(index)}
                        className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-colors ${index === currentDealSlide ? "bg-red-600" : "bg-red-300"
                          }`}
                        aria-label={`${t('go_to_deal_slide', 'components')} ${index + 1}`}
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
              <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">{t('brands_title')}</h2>
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
                {t('brands_empty')}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
