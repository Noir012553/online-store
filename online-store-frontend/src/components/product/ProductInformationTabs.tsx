import { useLanguage } from '../../lib/i18n';
import { Laptop } from '../../lib/data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ProductDescriptionFormatter } from '../ProductDescriptionFormatter';
import { SpecsTable } from '../SpecsTable';
import { ProductReviews, type ProductReview, type ProductReviewForm } from './ProductReviews';

interface ProductInformationTabsProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  product: Laptop;
  reviewCount: number;
  reviews: ProductReview[];
  isLoadingReviews: boolean;
  reviewsError: string | null;
  user: { name?: string } | null;
  loginHref: string;
  showReviewForm: boolean;
  reviewForm: ProductReviewForm;
  isSubmittingReview: boolean;
  onShowReviewForm: () => void;
  onReviewFormChange: (updates: Partial<ProductReviewForm>) => void;
  onReviewSubmit: () => void;
  onRetryReviews: () => void;
  onReviewCancel: () => void;
  onOpenImage: (src: string, alt: string) => void;
}

export function ProductInformationTabs({
  activeTab,
  onTabChange,
  product,
  reviewCount,
  reviews,
  isLoadingReviews,
  reviewsError,
  user,
  loginHref,
  showReviewForm,
  reviewForm,
  isSubmittingReview,
  onShowReviewForm,
  onReviewFormChange,
  onReviewSubmit,
  onRetryReviews,
  onReviewCancel,
  onOpenImage,
}: ProductInformationTabsProps) {
  const { t } = useLanguage();

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="mb-8 sm:mb-12">
      <TabsList className="grid w-full grid-cols-3 text-xs sm:text-sm">
        <TabsTrigger value="specs" className="text-xs sm:text-sm">{t('tab_specs', 'products')}</TabsTrigger>
        <TabsTrigger value="description" className="text-xs sm:text-sm">{t('tab_description', 'products')}</TabsTrigger>
        <TabsTrigger value="reviews" className="text-xs sm:text-sm">{t('tab_reviews', 'products')} ({reviewCount})</TabsTrigger>
      </TabsList>
      <TabsContent value="specs" id="product-specs-container" className="bg-white p-4 sm:p-6 border rounded-lg">
        <SpecsTable specs={product.specs} specLabels={product.specLabels} />
      </TabsContent>
      <TabsContent value="description" id="product-description-container" className="bg-white p-4 sm:p-6 border rounded-lg">
        <div className="space-y-8">
          {product.description && (
            <div>
              <h3 className="text-lg font-bold mb-4 text-gray-900">{t('section_description', 'products')}</h3>
              <ProductDescriptionFormatter
                text={product.description}
                specs={product.specs}
                specLabels={product.specLabels}
              />
            </div>
          )}

          {!product.description && (
            <p className="text-gray-500 text-center py-8">{t('empty_no_description', 'products')}</p>
          )}
        </div>
      </TabsContent>
      <TabsContent value="reviews" className="bg-white p-6 border rounded-lg">
        <ProductReviews
          reviews={reviews}
          isLoadingReviews={isLoadingReviews}
          reviewsError={reviewsError}
          onRetryReviews={onRetryReviews}
          user={user}
          loginHref={loginHref}
          showReviewForm={showReviewForm}
          reviewForm={reviewForm}
          isSubmittingReview={isSubmittingReview}
          onShowReviewForm={onShowReviewForm}
          onReviewFormChange={onReviewFormChange}
          onReviewSubmit={onReviewSubmit}
          onReviewCancel={onReviewCancel}
          onOpenImage={onOpenImage}
        />
      </TabsContent>
    </Tabs>
  );
}
