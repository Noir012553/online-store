import { useLanguage } from '../../lib/i18n';
import { Laptop } from '../../lib/data';
import { getImageUrl } from '../../lib/utils';
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
  const descriptionText = product.description?.trim() || '';

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
          {descriptionText && (
            <div>
              <h3 className="text-lg font-bold mb-4 text-gray-900">{t('section_description', 'products')}</h3>
              <ProductDescriptionFormatter
                text={descriptionText}
                specs={product.specs}
                specLabels={product.specLabels}
              />
            </div>
          )}

          {product.descriptionImages && product.descriptionImages.length > 0 && (
            <div>
              <h3 className="text-lg font-bold mb-4 text-gray-900">
                {t('description_images', 'products', 'Ảnh trong mô tả')}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {product.descriptionImages.map((image, index) => {
                  const src = getImageUrl(image.url);
                  if (!src) return null;
                  return (
                    <button
                      key={`${src}-${index}`}
                      type="button"
                      className="overflow-hidden rounded-lg border bg-white text-left transition hover:border-red-300"
                      onClick={() => onOpenImage(src, image.alt || product.name)}
                    >
                      <img src={src} alt={image.alt || product.name} className="h-auto w-full object-contain" loading="lazy" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {product.promotions && product.promotions.length > 0 && (
            <div>
              <h3 className="text-lg font-bold mb-4 text-gray-900">
                {t('promotions', 'products', 'Ưu đãi đi kèm')}
              </h3>
              <div className="space-y-3">
                {product.promotions.map((promotion, index) => (
                  <article key={`${promotion.type}-${promotion.title}-${index}`} className="rounded-lg border border-red-100 bg-red-50/50 p-4">
                    <p className="font-semibold text-gray-900">{promotion.title}</p>
                    {promotion.type && (
                      <p className="mt-1 text-sm text-gray-700">
                        {t('promotion_type', 'products', 'Loại ưu đãi')}: {promotion.type}
                      </p>
                    )}
                    {promotion.scope && (
                      <p className="mt-1 text-sm text-gray-700">
                        {t('promotion_scope', 'products', 'Phạm vi áp dụng')}: {promotion.scope}
                      </p>
                    )}
                    {promotion.giftProductName && (
                      <p className="mt-1 text-sm text-gray-700">
                        {promotion.giftQuantity ? `${promotion.giftQuantity} x ` : ''}{promotion.giftProductName}
                        {typeof promotion.giftValueVND === 'number' && ` (${new Intl.NumberFormat('vi-VN').format(promotion.giftValueVND)} VND)`}
                      </p>
                    )}
                    {promotion.giftProductUrl && (
                      <a
                        href={promotion.giftProductUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-sm text-red-600 underline"
                      >
                        {t('view_promotion_product', 'products', 'Xem sản phẩm tặng')}
                      </a>
                    )}
                    {promotion.discountText && <p className="mt-1 text-sm text-gray-700">{promotion.discountText}</p>}
                  </article>
                ))}
              </div>
            </div>
          )}

          {!descriptionText && !product.descriptionImages?.length && !product.promotions?.length && (
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
