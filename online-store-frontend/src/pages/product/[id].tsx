import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../lib/i18n";
import { useRouter } from "next/router";
import Link from "next/link";
import { productAPI, reviewAPI } from "../../lib/api";
import { useCart } from "../../lib/context/CartContext";
import { useAuth } from "../../lib/context/AuthContext";
import { useCurrencyContext } from "../../lib/context/CurrencyContext";
import { useProductTranslation } from "../../hooks/useProductTranslation";
import { getIntlLocale } from "../../lib/localeUtils";
import { useCloudinaryUpload } from "../../hooks/useCloudinaryUpload";
import { Laptop, isActiveDeal } from "../../lib/data";
import { Button } from "../../components/ui/button";
import { ProductGallery } from "../../components/product/ProductGallery";
import { ProductRecommendations } from "../../components/product/ProductRecommendations";
import { ProductOverview } from "../../components/product/ProductOverview";
import { ProductInformationTabs } from "../../components/product/ProductInformationTabs";
import { type ProductReview, type ProductReviewForm } from "../../components/product/ProductReviews";
import { useRecentlyViewedProducts } from "../../hooks/useRecentlyViewedProducts";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { BannerSlot } from "../../components/BannerSlot";
import { ImageViewer } from "../../components/ImageViewer";
import { toast } from "sonner";
import { getImageUrl, isLoginPath } from "../../lib/utils";
import { interpolateTranslation } from "../../lib/translationInterpolate";
import type { Locale } from "../../lib/i18n/types";

const TAB_VALUES = ['specs', 'description', 'reviews'] as const;
type ProductTab = (typeof TAB_VALUES)[number];

const getSafeProductTab = (value: unknown): ProductTab => {
  if (typeof value !== 'string') return 'specs';
  return (TAB_VALUES as readonly string[]).includes(value) ? (value as ProductTab) : 'specs';
};

const formatProductAmount = (
  value: unknown,
  formattedValue: unknown,
  locale: Locale,
  currencyCode: string,
): string | undefined => {
  if (typeof formattedValue === 'string' && formattedValue.trim()) {
    return formattedValue;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: 'currency',
    currency: currencyCode,
  }).format(value);
};

const cleanProductDescription = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const description = value.trim();
  return /^(?:thông số|specifications?)\s*:\s*\{\s*\}$/i.test(description) ? '' : description;
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
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [totalReviews, setTotalReviews] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState<{ src: string; alt: string; images?: string[]; initialIndex?: number } | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState<ProductReviewForm>({ rating: 5, comment: '', avatar: null });
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
        setSelectedImage(0);
        setQuantity(1);

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
  const localizedDescription = cleanProductDescription(
    isSourceLocale ? laptop.description : translation?.description?.trim() || laptop.description,
  );
  const localizedBrand = isSourceLocale ? laptop.brand : translation?.brand?.trim() || laptop.brand;
  const sourceSpecs = laptop.specs ?? {};
  const localizedSpecs = isSourceLocale
    ? sourceSpecs
    : { ...sourceSpecs, ...(translation?.specs ?? {}) };
  const specLabels = isSourceLocale
    ? (laptop.specLabels ?? {})
    : (translation?.specLabels ?? laptop.specLabels ?? {});
  const category = laptop.category;
  const categoryId = typeof category === 'object' && category !== null
    ? category._id ?? category.id
    : category;
  const formattedPrice = formatProductAmount(laptop.price, laptop.formattedPrice, locale, laptop.baseCurrencyCode);
  const formattedOriginalPrice = formatProductAmount(
    laptop.originalPrice,
    laptop.formattedOriginalPrice,
    locale,
    laptop.baseCurrencyCode,
  );
  const canDisplayPrice = Boolean(formattedPrice && Number.isFinite(laptop.price) && laptop.price > 0);

  const convertedLaptop: Laptop = {
    id: laptop._id,
    name: localizedName,
    brand: localizedBrand ?? t('no_brand', 'products'),
    category: categoryId ?? t('no_category', 'admin'),
    price: laptop.price,
    formattedPrice,
    baseCurrencyCode: laptop.baseCurrencyCode,
    originalPrice: laptop.originalPrice,
    formattedOriginalPrice,
    image: images[0] ?? '',
    images,
    rating: laptop.rating ?? 0,
    reviews: laptop.numReviews ?? (
      Array.isArray(laptop.reviews) ? laptop.reviews.length : Number(laptop.reviews) || 0
    ),
    inStock: (laptop.countInStock ?? 0) > 0,
    specs: localizedSpecs,
    specLabels,
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

  const discount = Math.max(0, laptop.discountPercentage ?? 0);

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
          hasDeal={isActiveDeal(laptop.deal)}
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
          onQuantityChange={(nextQuantity) => setQuantity(Math.min(laptop.countInStock > 0 ? laptop.countInStock : 1, Math.max(1, nextQuantity)))}
          onAddToCart={handleAddToCart}
          onBuyNow={handleBuyNow}
        />
      </div>

      <ProductInformationTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        product={convertedLaptop}
        reviewCount={Math.max(totalReviews, reviews.length, laptop.numReviews || 0)}
        reviews={reviews}
        user={user}
        loginHref={loginHref}
        showReviewForm={showReviewForm}
        reviewForm={reviewForm}
        isSubmittingReview={isSubmittingReview}
        onShowReviewForm={() => setShowReviewForm(true)}
        onReviewFormChange={(updates) => setReviewForm((current) => ({ ...current, ...updates }))}
        onReviewSubmit={handleSubmitReview}
        onReviewCancel={() => setShowReviewForm(false)}
        onOpenImage={(src, alt) => {
          setViewerImage({ src, alt });
          setIsImageViewerOpen(true);
        }}
      />

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
      />
    </div>
  );
}
