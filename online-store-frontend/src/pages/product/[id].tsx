import { useState, useEffect } from "react";
import { useLanguage } from "../../lib/i18n";
import { useRouter } from "next/router";
import Link from "next/link";
import { Star, ShoppingCart, Minus, Plus, Truck, Shield, CreditCard, LogIn, AlertCircle } from "lucide-react";
import { productAPI, reviewAPI } from "../../lib/api";
import { useCart } from "../../lib/context/CartContext";
import { useAuth } from "../../lib/context/AuthContext";
import { useProductTranslation } from "../../hooks/useProductTranslation";
import { useCurrencyConversion } from "../../hooks/useCurrencyConversion";
import { getIntlLocale } from "../../lib/localeUtils";
import { Laptop } from "../../lib/data";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { ProductCard } from "../../components/ProductCard";
import { ImageWithFallback } from "../../components/figma/ImageWithFallback";
import { EmojiSvg } from "../../components/EmojiSvg";
import { UI_EMOJI } from "../../lib/uiEmoji";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { BannerSlot } from "../../components/BannerSlot";
import { ProductDescriptionFormatter } from "../../components/ProductDescriptionFormatter";
import { SpecsTable } from "../../components/SpecsTable";
import { TranslatedReview } from "../../components/TranslatedReview";
import { toast } from "sonner";
import { getImageUrl, isLoginPath } from "../../lib/utils";

interface Review {
  _id?: string;
  name?: string;
  rating: number;
  comment: string;
  user?: {
    username?: string;
    name?: string;
  };
  createdAt?: string;
}

const TAB_VALUES = ['specs', 'description', 'reviews'] as const;

type ProductTab = (typeof TAB_VALUES)[number];

const getSafeProductTab = (value: unknown): ProductTab => {
  if (typeof value !== 'string') return 'specs';
  return (TAB_VALUES as readonly string[]).includes(value) ? (value as ProductTab) : 'specs';
};

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default function ProductDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { addToCart } = useCart();
  const { user } = useAuth();
  const { loadNamespace, t, locale, isHydrated, isLoadingNamespace } = useLanguage();
  const { translation } = useProductTranslation(id as string);
  const {
    canConvertCurrency,
    formatConvertedPrice,
    isLoading: isLoadingExchangeRates,
  } = useCurrencyConversion();
  const [laptop, setLaptop] = useState<any>(null);
  const [relatedLaptops, setRelatedLaptops] = useState<any[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [totalReviews, setTotalReviews] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '', avatar: null as File | null });
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [activeTab, setActiveTab] = useState<ProductTab>('specs');

  useEffect(() => {
    loadNamespace('products');
    loadNamespace('product-ui');
  }, [loadNamespace, locale]);

  useEffect(() => {
    if (!router.isReady) return;
    setActiveTab(getSafeProductTab(router.query.tab));
  }, [router.isReady, router.query.tab]);

  const handleTabChange = (value: string) => {
    const nextTab = getSafeProductTab(value);
    setActiveTab(nextTab);

    if (!router.isReady) return;

    const currentTab = getSafeProductTab(router.query.tab);
    if (currentTab === nextTab) return;

    const nextQuery = { ...router.query };
    if (nextTab === 'specs') {
      delete nextQuery.tab;
    } else {
      nextQuery.tab = nextTab;
    }

    router.replace(
      {
        pathname: router.pathname,
        query: nextQuery,
      },
      undefined,
      { shallow: true, scroll: false }
    );
  };

  // Fetch product detail from backend
  useEffect(() => {
    if (!id || !isHydrated) return;

    const fetchProduct = async () => {
      try {
        setIsLoading(true);
        const product = await productAPI.getProductById(id as string, locale);
        setLaptop(product);

        // Fetch related products (same category)
        const categoryId = product.category?._id || product.category;
        if (categoryId) {
          const allProducts = await productAPI.getProducts(1, undefined, categoryId, undefined, 4, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, locale);
          setRelatedLaptops(allProducts.products.filter((p: any) => p._id !== product._id).slice(0, 4));
        }

        // Fetch product reviews
        try {
          const reviewsResponse = await reviewAPI.getProductReviews(id as string, locale);
          if (reviewsResponse && typeof reviewsResponse === 'object' && 'reviews' in reviewsResponse) {
            const reviewsList = Array.isArray(reviewsResponse.reviews) ? reviewsResponse.reviews : [];
            setReviews(reviewsList);
            setTotalReviews(reviewsResponse.totalReviews !== undefined ? reviewsResponse.totalReviews : reviewsList.length);
          } else {
            const reviewsList = Array.isArray(reviewsResponse) ? reviewsResponse : [];
            setReviews(reviewsList);
            setTotalReviews(reviewsList.length);
          }
        } catch (reviewErr) {
          setReviews([]);
          setTotalReviews(0);
        }

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('error_load_product', 'products'));
        setLaptop(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProduct();
  }, [id, isHydrated, locale, t]);

  const handleSubmitReview = async () => {
    if (!user) {
      toast.error(t('login_review', 'products'));
      router.push("/login");
      return;
    }

    if (!reviewForm.comment.trim()) {
      toast.error(t('review_comment_required', 'products'));
      return;
    }

    try {
      setIsSubmittingReview(true);
      await reviewAPI.createReview(id as string, reviewForm.rating, reviewForm.comment, reviewForm.avatar || undefined);
      toast.success(t('review_success', 'products'));
      setReviewForm({ rating: 5, comment: '', avatar: null });
      setShowReviewForm(false);

      // Refresh reviews and total count
      await handleSubmitReviewSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('review_error', 'products'));
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="animate-pulse space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="aspect-video bg-gray-200 rounded-lg"></div>
            <div className="space-y-4">
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              <div className="h-6 bg-gray-200 rounded w-1/2"></div>
              <div className="h-12 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !laptop) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h2>{t('error_no_products_found', 'products')}</h2>
        {error && <p className="text-red-600 mt-2">{error}</p>}
        <Link href="/products">
          <Button className="mt-4 bg-red-600 hover:bg-red-700">{t('error_back_to_products', 'products')}</Button>
        </Link>
      </div>
    );
  }

  // Convert backend image URLs using getImageUrl utility
  // Safe to call here because we've already ensured laptop exists (after early returns)
  const imagesList = laptop.images && laptop.images.length > 0 ? laptop.images : (laptop.image ? [laptop.image] : []);
  const images = imagesList.map((img: string) => getImageUrl(img)).filter(Boolean);
  const mainImage = images && images.length > 0 ? images[selectedImage] : undefined;

  // Convert backend product to frontend Laptop format for cart
  const isSourceLocale = locale === 'vi';
  const localizedName = isSourceLocale ? laptop.name : translation?.name?.trim() ?? '';
  const localizedDescription = isSourceLocale ? laptop.description : translation?.description?.trim() ?? '';
  const localizedSpecs = isSourceLocale ? laptop.specs ?? {} : translation?.specs ?? {};
  const localizedFeatures = isSourceLocale ? laptop.features ?? [] : translation?.features ?? [];
  const category = laptop.category;
  const categoryId = typeof category === 'object' && category !== null
    ? category._id ?? category.id
    : category;
  const canDisplayPrice = canConvertCurrency(laptop.baseCurrencyCode);

  const convertedLaptop: Laptop = {
    id: laptop._id,
    name: localizedName,
    brand: laptop.brand ?? t('no_brand', 'products'),
    category: categoryId ?? t('no_category', 'admin'),
    price: laptop.price,
    baseCurrencyCode: laptop.baseCurrencyCode,
    originalPrice: laptop.originalPrice,
    image: images[0] ?? '',
    images,
    rating: laptop.rating ?? 0,
    reviews: laptop.numReviews ?? 0,
    inStock: (laptop.countInStock ?? 0) > 0,
    specs: localizedSpecs,
    description: localizedDescription,
    features: localizedFeatures,
    featured: laptop.featured ?? false,
    deal: laptop.deal,
  };

  const handleAddToCart = () => {
    if (!canDisplayPrice) return;

    addToCart(convertedLaptop, quantity);
    toast.success(t('added_to_cart', 'products'));
  };

  const handleSubmitReviewSuccess = async () => {
    // Refresh reviews and total count
    try {
      const reviewsResponse = await reviewAPI.getProductReviews(id as string, locale);
      if (reviewsResponse && typeof reviewsResponse === 'object' && 'reviews' in reviewsResponse) {
        const reviewsList = Array.isArray(reviewsResponse.reviews) ? reviewsResponse.reviews : [];
        setReviews(reviewsList);
        setTotalReviews(reviewsResponse.totalReviews !== undefined ? reviewsResponse.totalReviews : reviewsList.length);
      } else {
        const reviewsList = Array.isArray(reviewsResponse) ? reviewsResponse : [];
        setReviews(reviewsList);
        setTotalReviews(reviewsList.length);
      }
    } catch (err) {
      // Error refreshing reviews - will keep existing reviews
    }
  };

  const handleBuyNow = () => {
    if (!canDisplayPrice) return;

    addToCart(convertedLaptop, quantity);
    router.push("/cart");
  };

  const discount = laptop.originalPrice != null
    ? Math.round(((laptop.originalPrice - laptop.price) / laptop.originalPrice) * 100)
    : 0;

  const loginHref = isLoginPath(router.asPath) ? '/login' : `/login?from=${encodeURIComponent(router.asPath)}`;

  return (
    <div className="container mx-auto px-4 py-8 animate-in fade-in duration-300">
      <Breadcrumbs
        links={[
          { label: t('breadcrumb_products', 'products'), href: "/products" },
          { label: convertedLaptop.name || '' },
        ]}
      />

      {/* Product Top Banner */}
      <div className="mb-8">
        <BannerSlot slot="product_top" variant="strip" limit={1} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-8 sm:mb-12">
        <div>
          <div className="relative aspect-video mb-3 sm:mb-4 bg-gray-100 rounded-lg overflow-hidden group">
            {mainImage ? (
              <ImageWithFallback
                src={mainImage}
                alt={convertedLaptop.name || ''}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                loading="eager"
                className="object-contain transition-transform duration-300 group-hover:scale-110"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-500">
                <div className="text-center">
                  <p className="text-sm">{t('image_no_image_available', 'products')}</p>
                </div>
              </div>
            )}
            {discount > 0 && (
              <Badge className="absolute top-4 right-4 bg-red-600 text-white text-lg px-4 py-2 animate-in zoom-in duration-300">
                -{discount}%
              </Badge>
            )}
            {laptop.deal && (
              <Badge className="absolute top-4 left-4 bg-black text-white text-lg px-4 py-2 animate-in zoom-in duration-300 flex items-center gap-1">
                <EmojiSvg emoji={UI_EMOJI.hotDeal} className="w-5 h-5" />
                {t('badge_flash_deal', 'products')}
              </Badge>
            )}
          </div>
          {images && images.length > 1 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {images.map((image: string, index: number) => (
                <button
                  key={index}
                  onClick={() => setSelectedImage(index)}
                  className={`relative aspect-video border-2 rounded overflow-hidden transition-all duration-300 hover:shadow-lg ${
                    selectedImage === index ? "border-red-600 scale-105" : "border-gray-200"
                  }`}
                >
                  <ImageWithFallback
                    src={image}
                    alt={`${convertedLaptop.name} ${index + 1}`}
                    fill
                    sizes="96px"
                    loading="lazy"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1 className="mb-3 sm:mb-4 text-xl sm:text-2xl">
            {convertedLaptop.name || ''}
          </h1>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
            <div className="flex items-center gap-1 sm:gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 sm:w-5 sm:h-5 ${
                    i < Math.floor(laptop.rating || 0)
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-gray-300"
                  }`}
                />
              ))}
              <span className="text-sm sm:text-base">{(laptop.rating || 0).toFixed(1)}</span>
            </div>
            <span className="text-xs sm:text-sm text-gray-500">({Math.max(totalReviews, reviews.length, laptop.numReviews || 0)} {t('reviews_label', 'product-ui')})</span>
            <Badge variant={(laptop.countInStock || 0) > 0 ? "default" : "destructive"} className="text-xs sm:text-sm">
              {(laptop.countInStock || 0) > 0 ? `${t('filter_in_stock', 'products')} (${laptop.countInStock})` : t('out_of_stock', 'products')}
            </Badge>
          </div>

          <div className="flex flex-col gap-2 mb-4 sm:mb-6">
            {isLoadingExchangeRates ? (
              <div className="animate-pulse space-y-2" aria-hidden="true">
                {laptop.originalPrice != null && <div className="h-7 w-36 rounded bg-gray-200" />}
                <div className="h-9 w-44 rounded bg-gray-200" />
              </div>
            ) : canDisplayPrice ? (
              <>
                {laptop.originalPrice != null && (
                  <span className="text-lg sm:text-2xl text-red-600 line-through font-semibold">
                    {formatConvertedPrice(laptop.originalPrice, convertedLaptop.baseCurrencyCode)}
                  </span>
                )}
                <span className="text-2xl sm:text-3xl text-green-600 font-bold">{formatConvertedPrice(laptop.price, convertedLaptop.baseCurrencyCode)}</span>
              </>
            ) : null}
          </div>

          {Object.keys(convertedLaptop.specs).length > 0 && (
            <div className="bg-white p-3 sm:p-4 rounded-lg mb-4 sm:mb-6">
              <h3 className="mb-2 sm:mb-3 text-sm sm:text-base font-semibold">{t('section_specifications', 'products')}</h3>
              <div className="space-y-1 sm:space-y-2 text-gray-700">
                {Object.entries(convertedLaptop.specs).slice(0, 5).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4 text-xs sm:text-sm">
                    <span className="font-medium capitalize">• {key}:</span>
                    <span className="text-right">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6 text-sm sm:text-base">
            <span>{t('label_quantity', 'products')}:</span>
            <div className="flex items-center border rounded">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="p-1.5 sm:p-2 hover:bg-gray-100"
              >
                <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <input
                id="quantity"
                name="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-12 sm:w-16 text-center border-x text-sm"
              />
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="p-1.5 sm:p-2 hover:bg-gray-100"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-4 sm:mb-6">
            <Button
              onClick={handleAddToCart}
              disabled={(laptop.countInStock || 0) <= 0}
              variant="outline"
              className="flex-1 text-xs sm:text-sm py-1.5 sm:py-2"
            >
              <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{t('btn_add_to_cart', 'products')}</span>
              <span className="sm:hidden">{t('btn_add_mobile', 'products')}</span>
            </Button>
            <Button
              onClick={handleBuyNow}
              disabled={(laptop.countInStock || 0) <= 0}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm py-1.5 sm:py-2"
            >
              {t('btn_buy_now', 'products')}
            </Button>
          </div>

          <div className="space-y-2 sm:space-y-3 border-t pt-4 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
              <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 shrink-0" />
              <span>{t('benefit_warranty', 'products')}</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 shrink-0" />
              <span>{t('benefit_payment', 'products')}</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="mb-8 sm:mb-12">
        <TabsList className="grid w-full grid-cols-3 text-xs sm:text-sm">
          <TabsTrigger value="specs" className="text-xs sm:text-sm">{t('tab_specs', 'products')}</TabsTrigger>
          <TabsTrigger value="description" className="text-xs sm:text-sm">{t('tab_description', 'products')}</TabsTrigger>
          <TabsTrigger value="reviews" className="text-xs sm:text-sm">{t('tab_reviews', 'products')} ({Math.max(totalReviews, reviews.length, laptop.numReviews || 0)})</TabsTrigger>
        </TabsList>
        <TabsContent value="specs" id="product-specs-container" className="bg-white p-4 sm:p-6 border rounded-lg">
          <SpecsTable specs={convertedLaptop.specs} />
        </TabsContent>
        <TabsContent value="description" id="product-description-container" className="bg-white p-4 sm:p-6 border rounded-lg">
          <div className="space-y-8">
            {convertedLaptop.description && (
              <div>
                <h3 className="text-lg font-bold mb-4 text-gray-900">{t('section_description', 'products')}</h3>
                <ProductDescriptionFormatter
                  text={convertedLaptop.description || ''}
                />
              </div>
            )}

            {/* Featured Features */}
            {(() => {
              const features = convertedLaptop.features || [];

              return features.length > 0 ? (
                <div className="bg-linear-to-br from-red-50 to-orange-50 p-6 rounded-lg border border-red-100">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900">
                    <span>{UI_EMOJI.featured}</span>
                    {t('section_featured_features', 'products')}
                  </h3>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {features.map((feature: string, index: number) => (
                      <li key={index} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-red-100 hover:shadow-md transition-shadow">
                        <span className="text-red-600 mt-0.5 font-bold text-lg shrink-0">{UI_EMOJI.feature}</span>
                        <span className="text-gray-800 font-medium">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })()}

            {!convertedLaptop.description && convertedLaptop.features.length === 0 && (
              <p className="text-gray-500 text-center py-8">{t('empty_no_description', 'products')}</p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="reviews" className="bg-white p-6 border rounded-lg">
          <div className="space-y-6">
            {!showReviewForm && (
              user ? (
                <Button onClick={() => setShowReviewForm(true)} className="bg-red-600 hover:bg-red-700">
                  {t('btn_write_review', 'products')}
                </Button>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <LogIn className="w-5 h-5 text-blue-600" />
                    <p className="text-sm text-blue-800">{t('msg_login_to_review', 'products')}</p>
                  </div>
                  <Link href={loginHref}>
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                      {t('btn_login', 'auth')}
                    </Button>
                  </Link>
                </div>
              )
            )}

            {showReviewForm && (
              <div className="border p-6 rounded-lg bg-white space-y-4 mb-6">
                <h3 className="font-bold">{t('btn_write_review', 'products')}</h3>

                <div>
                  <label className="block text-sm mb-2">{t('label_rating', 'products')}</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setReviewForm({ ...reviewForm, rating: star })}
                        className="p-1"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            star <= reviewForm.rating
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-gray-300"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm mb-2">{t('label_your_review', 'products')}</label>
                  <textarea
                    id="review-comment"
                    name="comment"
                    value={reviewForm.comment}
                    onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                    placeholder={t('placeholder_review_comment', 'products')}
                    className="w-full border rounded-lg p-3 min-h-24"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label htmlFor="review-avatar" className="block text-sm mb-2">{t('label_avatar', 'products')}</label>
                  <div className="relative">
                    <input
                      id="review-avatar"
                      name="avatar"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setReviewForm({ ...reviewForm, avatar: e.target.files?.[0] || null })}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="w-full border rounded-lg p-3 bg-white hover:bg-white transition-colors cursor-pointer flex items-center gap-2 text-gray-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-sm">{reviewForm.avatar ? reviewForm.avatar.name : t('placeholder_no_file', 'products')}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSubmitReview}
                    disabled={isSubmittingReview}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {isSubmittingReview ? t('btn_submitting', 'products') : t('btn_submit_review', 'products')}
                  </Button>
                  <Button
                    onClick={() => setShowReviewForm(false)}
                    variant="outline"
                  >
                    {t('btn_cancel', 'products')}
                  </Button>
                </div>
              </div>
            )}

            {reviews.length > 0 ? (
              reviews.map((review) => {
                const reviewerName = review.name || review.user?.name || t('default_anonymous', 'products');
                const reviewDate = review.createdAt ? new Date(review.createdAt).toLocaleDateString(getIntlLocale(locale)) : t('not_available', 'common');
                const initials = reviewerName[0] || '?';
                return (
                  <div key={review._id} className="border-b pb-6 last:border-b-0">
                    <div className="flex items-center gap-4 mb-2">
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center overflow-hidden">
                        {(review as any).avatar ? (
                          <img src={(review as any).avatar} alt={reviewerName} className="w-full h-full object-cover" />
                        ) : (
                          <span>{initials}</span>
                        )}
                      </div>
                      <div>
                        <p>{reviewerName}</p>
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`w-4 h-4 ${
                                  i < review.rating
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-gray-300"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-sm text-gray-500">
                            {reviewDate}
                          </span>
                        </div>
                      </div>
                    </div>
                    <TranslatedReview review={review} />
                  </div>
                );
              })
            ) : (
              <p className="text-gray-500">{t('empty_no_reviews', 'products')}</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {relatedLaptops.length > 0 && (
        <section>
          <h2 className="mb-4 sm:mb-6 text-lg sm:text-xl">{t('section_related_products', 'products')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {relatedLaptops.map((product) => (
              <ProductCard key={product._id} laptop={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
