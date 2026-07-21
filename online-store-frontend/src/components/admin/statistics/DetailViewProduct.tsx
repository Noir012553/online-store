import { useLanguage, useTranslation } from '../../../lib/i18n';
import { formatCurrencyByCode } from '../../../lib/utils';
import { getProductCategoryName, getProductName } from '../../../lib/data';
import { useProductTranslation } from '../../../hooks/useProductTranslation';
import { UI_EMOJI } from '../../../lib/uiEmoji';

function StatisticsCategoryName({ product }: { product: any }) {
  return <>{getProductCategoryName(product)}</>;
}

function StatisticsProductDescription({ product }: { product: any }) {
  const { locale } = useLanguage();
  const { translation } = useProductTranslation(product._id || product.id);

  const displayDescription = translation?.description || product?.description || null;
  return <>{displayDescription}</>;
}

interface ProductDetail {
  type: 'product';
  title: string;
  item: any;
}

interface DetailViewProductProps {
  detail: ProductDetail;
}

export function DetailViewProduct({ detail }: DetailViewProductProps) {
  const { t } = useTranslation();
  const { locale } = useLanguage();

  return (
    <div className="space-y-4 text-sm text-gray-700">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-100 p-4">
          <div className="text-xs uppercase tracking-wider text-gray-500">
            {t('detail_price_label')}
          </div>
          <div className="mt-1 font-semibold text-gray-900">
            {formatCurrencyByCode(detail.item.price, detail.item.baseCurrencyCode, locale)}
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 p-4">
          <div className="text-xs uppercase tracking-wider text-gray-500">
            {t('detail_stock_label')}
          </div>
          <div className="mt-1 font-semibold text-gray-900">
            {detail.item.countInStock ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 p-4">
          <div className="text-xs uppercase tracking-wider text-gray-500">
            {t('detail_rating_label')}
          </div>
          <div className="mt-1 font-semibold text-gray-900">
            {Number(detail.item.rating || 0).toFixed(1)} {UI_EMOJI.ratingStar}
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 p-4">
          <div className="text-xs uppercase tracking-wider text-gray-500">
            {t('detail_reviews_label')}
          </div>
          <div className="mt-1 font-semibold text-gray-900">
            {detail.item.numReviews || 0}
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 p-4 sm:col-span-2">
          <div className="text-xs uppercase tracking-wider text-gray-500">
            {t('detail_category_label')}
          </div>
          <div className="mt-1 font-semibold text-gray-900">
            <StatisticsCategoryName product={detail.item} />
            {!getProductCategoryName(detail.item) && t('not_available')}
          </div>
        </div>
        {detail.item.image && (
          <div className="rounded-xl border border-gray-100 p-4 sm:col-span-2">
            <div className="text-xs uppercase tracking-wider text-gray-500">
              {t('detail_image_label')}
            </div>
            <img
              src={detail.item.image}
              alt={getProductName(detail.item, locale)}
              className="mt-2 h-40 w-full rounded-xl object-cover"
            />
          </div>
        )}
      </div>
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('detail_description_label')}
        </div>
        <div className="mt-1 whitespace-pre-wrap text-gray-700">
          <StatisticsProductDescription product={detail.item} />{' '}
          {!detail.item.description && t('not_available')}
        </div>
      </div>
    </div>
  );
}
