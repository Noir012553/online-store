import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../lib/i18n";
import { useRouter } from "next/router";
import Link from "next/link";
import { Star, LogIn } from "lucide-react";
import { productAPI, reviewAPI } from "../../lib/api";
import { useCart } from "../../lib/context/CartContext";
import { useAuth } from "../../lib/context/AuthContext";
import { useCurrencyContext } from "../../lib/context/CurrencyContext";
import { useProductTranslation } from "../../hooks/useProductTranslation";
import { getIntlLocale } from "../../lib/localeUtils";
import { useCloudinaryUpload } from "../../hooks/useCloudinaryUpload";
import { Laptop } from "../../lib/data";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { ProductGallery } from "../../components/product/ProductGallery";
import { ProductRecommendations } from "../../components/product/ProductRecommendations";
import { ProductOverview } from "../../components/product/ProductOverview";
import { useRecentlyViewedProducts } from "../../hooks/useRecentlyViewedProducts";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { BannerSlot } from "../../components/BannerSlot";
import { ProductDescriptionFormatter } from "../../components/ProductDescriptionFormatter";
import { SpecsTable } from "../../components/SpecsTable";
import { TranslatedReview } from "../../components/TranslatedReview";
import { ImageViewer } from "../../components/ImageViewer";
import { toast } from "sonner";
import { getImageUrl, isLoginPath } from "../../lib/utils";
import { interpolateTranslation } from "../../lib/translationInterpolate";

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
  const { currencyCode } = useCurrencyContext();
  const { uploadToCloudinary, validateUploadedImage } = useCloudinaryUpload();
  const [laptop, setLaptop] = useState<any>(null);
  const [relatedLaptops, setRelatedLaptops] = useState<any[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [totalReviews, setTotalReviews] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState<{ src: string; alt: string; images?: string[]; initialIndex?: number } | null>(null);
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

  const productRequestIdRef = useRef(0);

  // Fetch product detail from backend
  useEffect(() => {
    if (!id || !isHydrated) return;

    const requestId = ++productRequestIdRef.current;
    const productId = id as string;
    const controller = new AbortController();
    const isCurrentRequest = () => requestId === productRequestIdRef.current && !controller.signal.aborted;

    const fetchProduct = async () => {
      try {
        setIsLoading(true);
        const product = await productAPI.getProductById(
          productId,
          locale,
          { signal: controller.signal },
          getIntlLocale(locale),
          currencyCode
        );
        if (!isCurrentRequest()) return;
        setLaptop(product);

        // Fetch related products (same category)
        const categoryId = product.category?._id || product.category;
        if (categoryId) {
          const allProducts = await productAPI.getProducts(1, undefined, categoryId, undefined, 4, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, locale, getIntlLocale(locale), currencyCode, { signal: controller.signal });
          if (!isCurrentRequest()) return;
          setRelatedLaptops(allProducts.products.filter((p: any) => p._id !== product._id).slice(0, 4));
        }

        // Fetch product reviews
        try {
          const reviewsResponse = await reviewAPI.getProductReviews(productId, locale, { signal: controller.signal });
          if (!isCurrentRequest()) return;
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
          if (!isCurrentRequest()) return;
          setReviews([]);
          setTotalReviews(0);
        }

        if (isCurrentRequest()) {
          setError(null);
        }
      } catch (err) {
        if (!isCurrentRequest()) return;
        setError(err instanceof Error ? err.message : t('error_load_product', 'products'));
        setLaptop(null);
      } finally {
        if (isCurrentRequest()) {
          setIsLoading(false);
        }
      }
    };

    fetchProduct();

    return () => {
      controller.abort();
    };
  }, [currencyCode, id, isHydrated, locale]);

  const recentlyViewedProducts = useRecentlyViewedProducts(laptop);

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
      const uploadResult = reviewForm.avatar
        ? await uploadToCloudinary(reviewForm.avatar, 'reviewers')
        : null;

      if (reviewForm.avatar && (!uploadResult || !uploadResult.claimId || !await validateUploadedImage(uploadResult))) {
        return;
      }

      await reviewAPI.createReview(
        id as string,
        reviewForm.rating,
        reviewForm.comment,
        uploadResult?.claimId
          ? { url: uploadResult.secure_url, publicId: uploadResult.public_id, claimId: uploadResult.claimId }
          : undefined
      );
      toast.success(t('review_success', 'products'));
      setReviewForm({ rating: 5, comment: '', avatar: null });
      setShowReviewForm(false);

      // Refresh reviews and total count
      await handleSubmitReviewSuccess();
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      const message = error instanceof Error && code !== 'REVIEW_CREATION_FAILED'
        ? error.message
        : t('review_error', 'products');
      toast.error(message);
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
  const localizedName = isSourceLocale ? laptop.name : translation?.name?.trim() || laptop.name;
  const localizedDescription = isSourceLocale ? laptop.description : translation?.description?.trim() || laptop.description;
  const localizedBrand = isSourceLocale ? laptop.brand : translation?.brand?.trim() || laptop.brand;
  const localizedSpecs = isSourceLocale ? laptop.specs ?? {} : translation?.specs ?? laptop.specs ?? {};
  const category = laptop.category;
  const categoryId = typeof category === 'object' && category !== null
    ? category._id ?? category.id
    : category;
  const canDisplayPrice = Boolean(laptop.formattedPrice);

  const convertedLaptop: Laptop = {
    id: laptop._id,
    name: localizedName,
    brand: localizedBrand ?? t('no_brand', 'products'),
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
    featured: laptop.featured ?? false,
    deal: laptop.deal,
  };

  const handleAddToCart = () => {
    if (!canDisplayPrice) return;

    addToCart(convertedLaptop, quantity);
    toast.success(interpolateTranslation(t('added_to_cart', 'products'), { quantity }));
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
        <ProductGallery
          productName={convertedLaptop.name || ''}
          images={images}
          mainImage={mainImage}
          selectedImage={selectedImage}
          discount={discount}
          hasDeal={Boolean(laptop.deal)}
          dealLabel={t('badge_flash_deal', 'products')}
          noImageLabel={t('image_no_image_available', 'products')}
          onSelectImage={setSelectedImage}
          onOpenViewer={() => {
            setViewerImage({ src: mainImage || '', alt: convertedLaptop.name || '', images, initialIndex: selectedImage });
            setIsImageViewerOpen(true);
          }}
        />

        <ProductOverview
          product={convertedLaptop}
          stockCount={laptop.countInStock || 0}
          reviewCount={Math.max(totalReviews, reviews.length, laptop.numReviews || 0)}
          canDisplayPrice={canDisplayPrice}
          quantity={quantity}
          onQuantityChange={setQuantity}
          onAddToCart={handleAddToCart}
          onBuyNow={handleBuyNow}
        />
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

            {!convertedLaptop.description && (
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
                          <button
                            type="button"
                            onClick={() => {
                              setViewerImage({ src: (review as any).avatar, alt: reviewerName });
                              setIsImageViewerOpen(true);
                            }}
                            className="h-full w-full cursor-zoom-in"
                            aria-label={reviewerName}
                          >
                            <img src={(review as any).avatar} alt={reviewerName} className="w-full h-full object-cover" />
                          </button>
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

      {isImageViewerOpen && viewerImage && (
        <ImageViewer
          src={viewerImage.src}
          alt={viewerImage.alt}
          images={viewerImage.images}
          initialIndex={viewerImage.initialIndex}
          onClose={() => setIsImageViewerOpen(false)}
        />
      )}

      <ProductRecommendations
        relatedProducts={relatedLaptops}
        recentlyViewedProducts={recentlyViewedProducts}
        relatedTitle={t('section_related_products', 'products')}
        recentlyViewedTitle={t('section_recently_viewed_products', 'products')}
        locale={locale}
      />
    </div>
  );
}
