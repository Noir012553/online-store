import { useLanguage } from '../../lib/i18n';
import { Laptop } from '../../lib/data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
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
        <TabsTrigger value="description" className="text-xs sm:text-sm">Khuyến mãi</TabsTrigger>
        <TabsTrigger value="reviews" className="text-xs sm:text-sm">{t('tab_reviews', 'products')} ({reviewCount})</TabsTrigger>
      </TabsList>
      <TabsContent value="specs" id="product-specs-container" className="bg-white p-4 sm:p-6 border rounded-lg">
        <SpecsTable specs={product.specs} specLabels={product.specLabels} />
      </TabsContent>
      <TabsContent value="description" id="product-promotions-container" className="bg-white p-4 sm:p-6 border rounded-lg">
        {product.promotions && product.promotions.length > 0 ? (
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
        ) : (
          <p className="py-8 text-center text-gray-500">Sản phẩm này chưa có khuyến mãi</p>
        )}
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
