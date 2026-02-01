import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Gamepad2, Briefcase, Palette, GraduationCap, Building, Laptop as LaptopIcon, Truck, Shield, Headphones, CreditCard, Keyboard, Mouse, Zap } from "lucide-react";
import { brands, features } from "../lib/data";
import { productAPI, categoryAPI } from "../lib/api";
import { categoryToSlug } from "../lib/categoryUtils";
import { ProductCard } from "../components/ProductCard";
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

const categoryIconMap: { [key: string]: keyof typeof iconMap } = {
  'Bàn phím': 'Keyboard',
  'Chuột': 'Mouse',
  'Tai nghe': 'Headphones',
  'Tản nhiệt': 'Zap',
  'Laptop Gaming': 'Gamepad2',
  'Laptop Văn phòng': 'Briefcase',
};

const heroSlides = [
  {
    title: "Khuyến mãi cuối năm",
    subtitle: "Giảm giá lên đến 30%",
    description: "Cho tất cả laptop gaming và đồ họa",
    image: "https://images.unsplash.com/photo-1640955014216-75201056c829?w=1200",
    cta: "Mua ngay",
    link: "/products/laptop-gaming",
  },
  {
    title: "Laptop văn phòng",
    subtitle: "Giá tốt nhất thị trường",
    description: "Trả góp 0% lãi suất",
    image: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?w=1200",
    cta: "Xem thêm",
    link: "/products/laptop-van-phong",
  },
  {
    title: "Bảo hành chính hãng",
    subtitle: "Đổi mới trong 15 ngày",
    description: "Hỗ trợ 24/7",
    image: "https://images.unsplash.com/photo-1706101035106-119828e7b564?w=1200",
    cta: "Tìm hiểu thêm",
    link: "/about",
  },
];

interface BackendProduct {
  _id: string;
  name: string;
  image: string;
  price: number;
  originalPrice?: number;
  rating?: number;
  numReviews?: number;
  featured?: boolean;
  deal?: {
    discount: number;
    endTime: string;
  };
  brand?: string;
  category?: {
    _id: string;
    name: string;
  };
  [key: string]: any;
}

interface BackendCategory {
  _id: string;
  name: string;
  description?: string;
}

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentDealSlide, setCurrentDealSlide] = useState(0);
  const [timeLeft, setTimeLeft] = useState({
    hours: 23,
    minutes: 59,
    seconds: 59,
  });
  const [allProducts, setAllProducts] = useState<BackendProduct[]>([]);
  const [dealProducts, setDealProducts] = useState<BackendProduct[]>([]);
  const [categories, setCategories] = useState<BackendCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDealQuickViewOpen, setIsDealQuickViewOpen] = useState(false);

  // Fetch products and categories from backend
  useEffect(() => {
    let isMounted = true; // Track if component is still mounted

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch all products using optimized featured endpoint (no reviews populate, faster)
        const productsResponse = await productAPI.getFeaturedProducts(1, undefined, undefined, undefined, 100);

        // Check if component is still mounted before updating state
        if (!isMounted) return;

        const allProductsList = productsResponse.products || [];

        // Fetch categories - request deduplication will prevent duplicate calls in React Strict Mode
        const categoriesResponse = await categoryAPI.getCategories();

        // Check if component is still mounted before updating state
        if (!isMounted) return;

        const categoriesList = categoriesResponse.categories || categoriesResponse;
        const cats = Array.isArray(categoriesList) ? categoriesList : [];

        // Find category IDs for office and gaming laptops
        const officeCategory = cats.find((c: BackendCategory) => c.name.includes('Văn phòng'));
        const gamingCategory = cats.find((c: BackendCategory) => c.name.includes('Gaming'));

        // Organize products: 8 office laptops + 8 gaming laptops + 12 others
        const officeProducts = officeCategory
          ? allProductsList.filter((p: BackendProduct) =>
              p.category?._id === officeCategory._id && (p.countInStock || 0) > 0
            )
          : [];

        const gamingProducts = gamingCategory
          ? allProductsList.filter((p: BackendProduct) =>
              p.category?._id === gamingCategory._id && (p.countInStock || 0) > 0
            )
          : [];

        const otherProducts = allProductsList.filter((p: BackendProduct) =>
          (p.countInStock || 0) > 0 &&
          !(officeCategory && p.category?._id === officeCategory._id) &&
          !(gamingCategory && p.category?._id === gamingCategory._id)
        );

        // Combine: 8 office + 8 gaming + 12 others (28 total for 4 columns x 7 rows)
        const displayProducts = [
          ...officeProducts.slice(0, 8),
          ...gamingProducts.slice(0, 8),
          ...otherProducts.slice(0, 12),
        ];

        // Final check before setting state
        if (!isMounted) return;

        setAllProducts(displayProducts);

        // Get deal products
        const deals = allProductsList.filter((p: BackendProduct) => p.deal && (p.countInStock || 0) > 0);
        setDealProducts(deals.slice(0, 10));

        setCategories(cats.slice(0, 6));
      } catch (error) {
        // Keep showing skeleton or empty state
        // Silently fail - user will see skeleton loaders
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
  }, []);

  // Auto-rotate hero slides
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

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
    setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);
  };

  const nextDealSlide = () => {
    setCurrentDealSlide((prev) => Math.min(prev + 1, dealProducts.length - 3));
  };

  const prevDealSlide = () => {
    setCurrentDealSlide((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="animate-in fade-in duration-500">
      <section className="relative bg-gray-900 overflow-hidden" style={{ height: "calc(100vh - 80px)" }}>
        {heroSlides.map((slide, index) => (
          <div
            key={index}
            className={`absolute inset-0 transition-all duration-1000 ${
              index === currentSlide ? "opacity-100 scale-100" : "opacity-0 scale-105"
            }`}
          >
            <ImageWithFallback
              src={slide.image}
              alt={slide.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50" />
            <div className="absolute inset-0 container mx-auto px-4 flex items-center">
              <div className="text-white max-w-2xl">
                <h1 className="text-5xl mb-4">{slide.title}</h1>
                <p className="text-3xl mb-2">{slide.subtitle}</p>
                <p className="text-xl mb-6">{slide.description}</p>
                <Link href={slide.link}>
                  <Button size="lg" className="bg-red-600 hover:bg-red-700">
                    {slide.cta}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={prevSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          onClick={nextSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {heroSlides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-3 h-3 rounded-full transition-colors ${
                index === currentSlide ? "bg-red-600" : "bg-white/50"
              }`}
            />
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {categories.length > 0 ? (
            categories.map((category) => {
              // Map category name to appropriate icon
              const iconKey = categoryIconMap[category.name] || 'Laptop';
              const Icon = iconMap[iconKey] || LaptopIcon;
              return (
                <Link
                  key={category._id}
                  href={`/products/${categoryToSlug(category.name)}`}
                  className="flex flex-col items-center gap-3 p-6 border rounded-lg hover:border-red-600 hover:shadow-lg transition-all"
                >
                  <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                    <Icon className="w-8 h-8 text-red-600" />
                  </div>
                  <span className="text-center">{category.name}</span>
                </Link>
              );
            })
          ) : null}
        </div>
      </section>

      <section className="bg-gray-50 pt-0 pb-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
          <div className="flex justify-center">
            <Link href="/products">
              <Button className="bg-red-600 hover:bg-red-700 text-black hover:text-yellow-400">Xem tất cả</Button>
            </Link>
          </div>
        </div>
      </section>

      {dealProducts.length > 0 && (
        <section className="container mx-auto px-4 py-12">
          <div className="bg-linear-to-r from-red-600 to-red-800 rounded-2xl p-8 text-white">
            <div className="text-center mb-8">
              <h2 className="text-black mb-4 flex items-center justify-center gap-2 font-bold text-2xl">
                <EmojiSvg emoji="⚡" className="w-6 h-6" />
                Deal Sốc Hôm Nay
              </h2>
              <p className="text-xl mb-4 text-black font-bold">Giảm giá đến 30% - Chỉ trong hôm nay!</p>
              <div className="flex justify-center gap-4">
                <div className="bg-white/20 px-4 py-2 rounded">
                  <div className="text-3xl">{String(timeLeft.hours).padStart(2, "0")}</div>
                  <div className="text-sm">Giờ</div>
                </div>
                <div className="text-3xl">:</div>
                <div className="bg-white/20 px-4 py-2 rounded">
                  <div className="text-3xl">{String(timeLeft.minutes).padStart(2, "0")}</div>
                  <div className="text-sm">Phút</div>
                </div>
                <div className="text-3xl">:</div>
                <div className="bg-white/20 px-4 py-2 rounded">
                  <div className="text-3xl">{String(timeLeft.seconds).padStart(2, "0")}</div>
                  <div className="text-sm">Giây</div>
                </div>
              </div>
            </div>

            {/* Auto-Carousel for Deal Products - 3 Items Visible, Scroll 1 at a time */}
            <div className="relative overflow-hidden">
              {/* Main Carousel Container */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-all duration-700">
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

              {/* Navigation Buttons */}
              {dealProducts.length > 3 && (
                <>
                  <button
                    onClick={prevDealSlide}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white bg-black/50 hover:bg-black/70 p-2 rounded-full transition-colors"
                    aria-label="Previous deal"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={nextDealSlide}
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white bg-black/50 hover:bg-black/70 p-2 rounded-full transition-colors"
                    aria-label="Next deal"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {/* Carousel Indicators */}
            {dealProducts.length > 3 && (
              <div className="flex justify-center gap-2 mt-6">
                {Array.from({ length: dealProducts.length - 2 }).map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentDealSlide(index)}
                    className={`w-3 h-3 rounded-full transition-colors ${
                      index === currentDealSlide ? "bg-white" : "bg-white/50"
                    }`}
                    aria-label={`Go to deal slide ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="bg-gray-50 py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => {
              const Icon = iconMap[feature.icon as keyof typeof iconMap];
              return (
                <div
                  key={index}
                  className="bg-white p-6 rounded-lg text-center hover:shadow-lg transition-shadow"
                >
                  <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="mb-2">{feature.title}</h3>
                  <p className="text-gray-600">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {brands.map((brand, index) => (
            <div
              key={index}
              className="group flex items-center justify-center p-6 bg-white border-2 border-gray-100 rounded-lg hover:border-red-200 hover:shadow-xl transition-all duration-300 animate-in fade-in zoom-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="relative w-full h-20 flex items-center justify-center">
                <ImageWithFallback
                  src={brand.logo}
                  alt={brand.name}
                  className="max-w-full max-h-full object-contain grayscale group-hover:grayscale-0 transition-all duration-300 group-hover:scale-110"
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
