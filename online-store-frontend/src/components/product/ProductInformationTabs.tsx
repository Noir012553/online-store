import { useLanguage } from '../../lib/i18n';
import { FileText, Gift, MessageCircle } from 'lucide-react';
import { Laptop } from '../../lib/data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ProductDescriptionFormatter } from '../ProductDescriptionFormatter';
import { ProductReviews, type ProductReview, type ProductReviewForm } from './ProductReviews';

const PROMOTIONS_TAB_LABELS: Record<string, string> = {
  vi: 'Khuyến mãi',
  en: 'Promotions',
  de: 'Sonderangebote',
  es: 'Promociones',
  fr: 'Promotions',
  it: 'Promozioni',
  nl: 'Promoties',
  pt: 'Promoções',
  sv: 'Kampanjer',
};

const EMPTY_PROMOTIONS_LABELS: Record<string, string> = {
  vi: 'Sản phẩm này chưa có khuyến mãi',
  en: 'This product has no promotions',
  de: 'Dieses Produkt hat derzeit keine Sonderangebote',
  es: 'Este producto no tiene promociones',
  fr: 'Ce produit n’a aucune promotion',
  it: 'Questo prodotto non ha promozioni',
  nl: 'Dit product heeft momenteel geen promoties',
  pt: 'Este produto não tem promoções',
  sv: 'Den här produkten har inga kampanjer',
};

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
  const { t, locale } = useLanguage();
  const promotionsTabLabel = PROMOTIONS_TAB_LABELS[locale] || PROMOTIONS_TAB_LABELS.en;
  const emptyPromotionsLabel = EMPTY_PROMOTIONS_LABELS[locale] || EMPTY_PROMOTIONS_LABELS.en;

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="mb-10 sm:mb-14">
      <TabsList className="grid h-14 w-full grid-cols-3 rounded-2xl border border-slate-200/90 bg-slate-100/90 p-1.5 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.55)] sm:h-12 sm:p-1">
        <TabsTrigger value="description" className="group min-w-0 rounded-xl px-2 text-xs font-semibold text-slate-500 transition-all hover:bg-white/70 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-red-500/30 data-[state=active]:bg-white data-[state=active]:text-red-600 data-[state=active]:shadow-md data-[state=active]:shadow-slate-200/70 sm:gap-2 sm:px-3 sm:text-sm">
          <FileText className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=active]:-rotate-3 sm:h-4 sm:w-4" aria-hidden="true" />
          <span className="truncate">{t('section_description', 'products')}</span>
        </TabsTrigger>
        <TabsTrigger value="promotions" className="group min-w-0 rounded-xl px-2 text-xs font-semibold text-slate-500 transition-all hover:bg-white/70 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-red-500/30 data-[state=active]:bg-white data-[state=active]:text-red-600 data-[state=active]:shadow-md data-[state=active]:shadow-slate-200/70 sm:gap-2 sm:px-3 sm:text-sm">
          <Gift className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=active]:-rotate-3 sm:h-4 sm:w-4" aria-hidden="true" />
          <span className="truncate">{t('tab_promotions', 'products', promotionsTabLabel)}</span>
        </TabsTrigger>
        <TabsTrigger value="reviews" className="group min-w-0 rounded-xl px-2 text-xs font-semibold text-slate-500 transition-all hover:bg-white/70 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-red-500/30 data-[state=active]:bg-white data-[state=active]:text-red-600 data-[state=active]:shadow-md data-[state=active]:shadow-slate-200/70 sm:gap-2 sm:px-3 sm:text-sm">
          <MessageCircle className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=active]:-rotate-3 sm:h-4 sm:w-4" aria-hidden="true" />
          <span className="truncate">{t('tab_reviews', 'products')} ({reviewCount})</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="description" id="product-description-container" className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)] sm:mt-4 sm:p-6">
        <ProductDescriptionFormatter text={product.description} />
      </TabsContent>
      <TabsContent value="promotions" id="product-promotions-container" className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)] sm:mt-4 sm:p-6">
        {product.promotions && product.promotions.length > 0 ? (
          <div className="space-y-3">
            {product.promotions.map((promotion, index) => (
              <article key={`${promotion.type}-${promotion.title}-${index}`} className="rounded-xl border border-red-100 bg-gradient-to-br from-red-50/80 to-white p-4 shadow-sm">
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
          <p className="py-8 text-center text-gray-500">{t('empty_no_promotions', 'products', emptyPromotionsLabel)}</p>
        )}
      </TabsContent>
      <TabsContent value="reviews" className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)] sm:mt-4 sm:p-6">
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
