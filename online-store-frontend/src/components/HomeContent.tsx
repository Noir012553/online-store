import { useState, useEffect } from "react";
import { useLanguage } from "../lib/i18n";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../lib/i18n/types";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Gamepad2, Briefcase, Palette, GraduationCap, Building, Laptop as LaptopIcon, Truck, Shield, Headphones, CreditCard, Keyboard, Mouse, Zap } from "lucide-react";
import { features, getCategoryName } from "../lib/data";
import { bannerAPI, productAPI, type BannerRecord } from "../lib/api";
import { useCategories } from "../lib/context/CategoryContext";
import { onBannerCreated, onBannerUpdated, onBannerDeleted, onBannerRestored, offEvent } from "../lib/socket";
import { useStickyBannerScroll } from "../hooks/useStickyBannerScroll";
import { useBannerVisibility } from "../hooks/useBannerVisibility";
import { useBrands } from "../hooks/useBrands";
import { ProductCard } from "../components/ProductCard";
import { BannerSlot } from "../components/BannerSlot";
import { Button } from "../components/ui/button";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { EmojiSvg } from "../components/EmojiSvg";
import { ProductSkeleton } from "../components/ProductSkeleton";


const iconMap = {
  Gamepad2,
  Briefcase,
  Palette,
  GraduationCap,
  Building,
  Laptop: LaptopIcon,
  Truck,
  Shield,
  Headphones,
  CreditCard,
  Keyboard,
  Mouse,
  Zap,
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
  features?: string[];
  [key: string]: any;
}

interface BackendCategory {
  _id: string;
  name: string;
  description?: string;
  icon?: string;
  slug?: string;
  translationKey?: string;
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

export default function Home() {
  const { loadNamespace, t, locale, isHydrated } = useLanguage();
  const { categories: categoriesFromContext } = useCategories();
  const { brands } = useBrands();
  const [categories, setCategories] = useState<BackendCategory[]>([]);

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
  const [timeLeft, setTimeLeft] = useState({
    hours: 23,
    minutes: 59,
    seconds: 59,
  });
  const [allProducts, setAllProducts] = useState<BackendProduct[]>([]);
  const [dealProducts, setDealProducts] = useState<BackendProduct[]>([]);
  const [homepageHeroBanners, setHomepageHeroBanners] = useState<BannerRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDealQuickViewOpen, setIsDealQuickViewOpen] = useState(false);

  // Sticky banner scroll with constraints - confined within content wrapper
  // minBannerTopDocument = banner won't go above this distance from page top (px)
  // Adjust this value based on your hero section height
  const { bannerTop } = useStickyBannerScroll({
    containerSelector: '#homepage-content-wrapper',
    minBannerTopDocument: 700, // Adjust this number to control minimum position
    headerHeight: 80,
    maxBottomOffset: 20,
  });

  // Detect if hero carousel or footer is visible - hide banners when they are
  const { isBannerVisible } = useBannerVisibility({
    heroSelector: 'section.relative.bg-gray-900.overflow-hidden',
    footerSelector: 'footer',
    triggerThreshold: 0.3, // Hide banners when 30% of hero/footer is visible
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
      link: banner.targetUrl || '',
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
    // Sync categories from context whenever locale or context changes
    if (Array.isArray(categoriesFromContext)) {
      setCategories(categoriesFromContext);
    }
  }, [loadNamespace, locale, categoriesFromContext]);

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
      try {
        // Fetch all products using optimized featured endpoint (no reviews populate, faster)
        // Increased pageSize to 200 to ensure we get all demo products (laptops are often at the end)
        const productsResponse = await productAPI.getFeaturedProducts(1, undefined, undefined, undefined, 200, undefined, undefined, undefined, locale);

        // Check if component is still mounted before updating state
        if (!isMounted) return;

        const allProductsList = productsResponse.products || [];

        // Categories are now fetched from CategoryContext, not here
        const cats = Array.isArray(categories) ? categories : [];

        // Find category IDs for office and gaming laptops by translationKey or ID
        const officeCategory = cats.find((c: any) => c.translationKey === 'category_office_laptop' || c._id === process.env.NEXT_PUBLIC_OFFICE_CATEGORY_ID);
        const gamingCategory = cats.find((c: any) => c.translationKey === 'category_gaming_laptop' || c._id === process.env.NEXT_PUBLIC_GAMING_CATEGORY_ID);

        // Helper to get category ID from category object or string
        const getCategoryId = (cat: any): string | undefined => {
          if (typeof cat === 'string') return cat;
          if (cat && typeof cat === 'object') return cat._id || cat.id;
          return undefined;
        };

        // Organize products: 8 office laptops + 8 gaming laptops + 12 others
        // If categories not found, fallback to showing all products
        let displayProducts: BackendProduct[] = [];

        if (officeCategory && gamingCategory) {
          const officeProducts = allProductsList.filter((p: BackendProduct) => {
            const catId = getCategoryId(p.category);
            const isOffice = catId === officeCategory._id;
            return isOffice && (p.countInStock || 0) > 0;
          });

          const gamingProducts = allProductsList.filter((p: BackendProduct) => {
            const catId = getCategoryId(p.category);
            const isGaming = catId === gamingCategory._id;
            return isGaming && (p.countInStock || 0) > 0;
          });

          const otherProducts = allProductsList.filter((p: BackendProduct) => {
            const catId = getCategoryId(p.category);
            const isLaptop =
              catId === officeCategory._id ||
              catId === gamingCategory._id;
            return (p.countInStock || 0) > 0 && !isLaptop;
          });

          // Combine: 8 office + 8 gaming + 12 others (28 total for 4 columns x 7 rows)
          displayProducts = [
            ...officeProducts.slice(0, 8),
            ...gamingProducts.slice(0, 8),
            ...otherProducts.slice(0, 12),
          ];
        } else {
          // Fallback: if categories not found, show all in-stock products
          displayProducts = allProductsList.filter((p: BackendProduct) => (p.countInStock || 0) > 0).slice(0, 28);
        }

        // Final check before setting state
        if (!isMounted) return;

        setAllProducts(displayProducts);

        // Get deal products
        const deals = allProductsList.filter((p: BackendProduct) => p.deal && (p.countInStock || 0) > 0);
        setDealProducts(deals.slice(0, 10));
      } catch (error) {
        // Error fetching products - will show empty state
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
  }, [categories, locale, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;

    let isMounted = true;

    const fetchHomepageHeroBanners = async () => {
      try {
        const response = await bannerAPI.getBanners('homepage_hero', true, 1, 10, locale as any);
        if (!isMounted) return;
        const bannerList = Array.isArray(response.banners) ? response.banners : [];
        setHomepageHeroBanners(bannerList);
      } catch (error) {
        if (isMounted) {
          setHomepageHeroBanners([]);
        }
      }
    };

    void fetchHomepageHeroBanners();

    return () => {
      isMounted = false;
    };
  }, [locale, isHydrated]);

  // Listen for banner changes (create, update, delete, restore) and refetch
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

    // Subscribe to banner events
    const handleBannerCreated = () => refetchBanners();
    const handleBannerUpdated = () => refetchBanners();
    const handleBannerDeleted = () => refetchBanners();
    const handleBannerRestored = () => refetchBanners();

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

  // Auto-rotate deal carousel slides (paused when quick view is open)
  useEffect(() => {
    if (dealProducts.length > 3 && !isDealQuickViewOpen) {
      const timer = setInterval(() => {
        setCurrentDealSlide((prev) => {
          const next = prev + 1;
          return next >= dealProducts.length - 2 ? 0 : next;
        });
      }, 4000);
      return () => clearInterval(timer);
    }
  }, [dealProducts.length, isDealQuickViewOpen]);

  // Countdown timer for deals
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        } else if (prev.hours > 0) {
          return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % heroSlidesToRender.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + heroSlidesToRender.length) % heroSlidesToRender.length);
  };

  const nextDealSlide = () => {
    setCurrentDealSlide((prev) => Math.min(prev + 1, dealProducts.length - 3));
  };

  const prevDealSlide = () => {
    setCurrentDealSlide((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="animate-in fade-in duration-500 bg-white">
      <section className="relative bg-gray-900 overflow-hidden" style={{ height: "calc(100vh - 80px)" }}>
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
                      <Link href={href}>
                        <Button size="sm" className="bg-red-600 hover:bg-red-700">
                          {slide.cta}
                        </Button>
                      </Link>
                    ) : (
                      <a href={href} target={slide.openInNewTab ? '_blank' : undefined} rel={slide.openInNewTab ? 'noreferrer' : undefined}>
                        <Button size="sm" className="bg-red-600 hover:bg-red-700">
                          {slide.cta}
                        </Button>
                      </a>
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
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-50 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            >
              <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
            <button
              onClick={nextSlide}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-50 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            >
              <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>

            <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-2">
              {heroSlidesToRender.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
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
          <div className={`hidden xl:block fixed w-[240px] 2xl:w-[280px] h-fit z-30 pointer-events-none transition-opacity duration-300 ${!isBannerVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ left: '5px', top: `${bannerTop}px` }}>
            <BannerSlot slot="homepage_left" variant="image-only" className="w-full" limit={3} />
          </div>

          {/* RIGHT BANNER - sticky with scroll constraints, confined to container, hidden when hero/footer visible */}
          <div className={`hidden xl:block fixed w-[240px] 2xl:w-[280px] h-fit z-30 pointer-events-none transition-opacity duration-300 ${!isBannerVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ right: '5px', top: `${bannerTop}px` }}>
            <BannerSlot slot="homepage_right" variant="image-only" className="w-full" limit={3} />
          </div>
          {Array.isArray(categories) && categories.length > 0 && (
            <section className="bg-white container mx-auto section-container-px py-4 sm:py-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                {categories.map((category) => {
                  const iconKey = (category.icon || 'Laptop') as keyof typeof iconMap;
                  const Icon = iconMap[iconKey] || LaptopIcon;
                  const displayName = getCategoryName(category);
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

          <section className="bg-white pt-6 pb-6 sm:pt-8 sm:pb-8">
            <div className="container mx-auto section-container-px">

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
                {isLoading ? (
                  <>
                    {Array(28).fill(null).map((_, i) => (
                      <ProductSkeleton key={i} />
                    ))}
                  </>
                ) : allProducts.length > 0 ? (
                  allProducts.map((product) => (
                    <ProductCard key={product._id} laptop={product} />
                  ))
                ) : null}
              </div>

              <div className="mb-8">
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
                    <EmojiSvg emoji="⚡" className="w-5 h-5 sm:w-6 sm:h-6" />
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
                  {dealProducts.length > 3 && (
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 transition-all duration-700">
                      {dealProducts
                        .slice(currentDealSlide, currentDealSlide + 3)
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
                  {dealProducts.length > 3 && (
                    <button
                      onClick={nextDealSlide}
                      className="shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black hover:bg-gray-800 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={currentDealSlide >= dealProducts.length - 3}
                      aria-label={t('carousel_next', 'components')}
                    >
                      <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  )}
                </div>

                {/* Carousel Indicators */}
                {dealProducts.length > 3 && (
                  <div className="flex justify-center gap-1.5 sm:gap-2 mt-4 sm:mt-6">
                    {Array.from({ length: dealProducts.length - 2 }).map((_, index) => (
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
              {brands.map((brand, index) => (
                <div
                  key={index}
                  className="group flex items-center justify-center p-6 bg-white border-2 border-gray-100 rounded-lg hover:border-red-200 hover:shadow-xl transition-all duration-300 animate-in fade-in zoom-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="relative w-full h-20 flex items-center justify-center">
                    <ImageWithFallback
                      src={brand.logo}
                      alt={brand.name || t('brand', 'common')}
                      loading="lazy"
                      className="max-w-full max-h-full object-contain grayscale group-hover:grayscale-0 transition-all duration-300 group-hover:scale-110"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
