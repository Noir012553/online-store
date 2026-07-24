import { useLanguage, useTranslation } from '../../../lib/i18n';
import { formatCurrencyByCode, formatDate } from '../../../lib/utils';
import { Badge } from '../../ui/badge';

const getCouponValueLabel = (coupon: any, locale?: string) => {
  if (coupon.discountType === 'percentage') {
    return `${coupon.discountValue}%`;
  }

  return coupon.formattedDiscountValue || formatCurrencyByCode(coupon.discountValue, coupon.currencyCode, locale);
};

interface CouponDetail {
  type: 'coupon';
  title: string;
  item: any;
}

interface DetailViewCouponProps {
  detail: CouponDetail;
}

export function DetailViewCoupon({ detail }: DetailViewCouponProps) {
  const { t } = useTranslation();
  const { locale } = useLanguage();

  return (
    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('detail_discount_label')}
        </div>
        <div className="mt-1 font-semibold text-gray-900">
          {getCouponValueLabel(detail.item, locale)}
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('detail_uses_label')}
        </div>
        <div className="mt-1 font-semibold text-gray-900">
          {detail.item.currentUses || 0}/{detail.item.maxUses || t('admin_unlimited_uses')}
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('detail_min_order_label')}
        </div>
        <div className="mt-1 font-semibold text-gray-900">
          {detail.item.formattedMinOrderAmount || formatCurrencyByCode(detail.item.minOrderAmount, detail.item.currencyCode, locale)}
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('detail_active_label')}
        </div>
        <div className="mt-1 font-semibold text-gray-900">
          {detail.item.isActive ? t('detail_active_yes') : t('detail_active_no')}
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('detail_start_label')}
        </div>
        <div className="mt-1 font-semibold text-gray-900">
          {formatDate(detail.item.startDate, locale)}
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('detail_end_label')}
        </div>
        <div className="mt-1 font-semibold text-gray-900">
          {formatDate(detail.item.endDate, locale)}
        </div>
      </div>
    </div>
  );
}
