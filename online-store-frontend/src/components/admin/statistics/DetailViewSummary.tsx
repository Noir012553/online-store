import { useLanguage, useTranslation } from '../../../lib/i18n';
import { formatCurrencyByCode } from '../../../lib/utils';
import { Badge } from '../../ui/badge';

const getCouponValueLabel = (coupon: any, locale?: string) => {
  if (coupon.discountType === 'percentage') {
    return `${coupon.discountValue}%`;
  }

  return formatCurrencyByCode(coupon.discountValue, coupon.currencyCode, locale);
};

interface SummaryDetail {
  type: 'summary';
  title: string;
  subtitle?: string;
  items: any[];
  kind: 'promotion' | 'order-status' | 'payment';
}

interface DetailViewSummaryProps {
  detail: SummaryDetail;
}

export function DetailViewSummary({ detail }: DetailViewSummaryProps) {
  const { t } = useTranslation();
  const { locale } = useLanguage();

  return (
    <div className="space-y-3">
      {detail.items.length > 0 ? (
        detail.items.map((item, index) => (
          <div key={`${detail.kind}-${index}`} className="rounded-xl border border-gray-100 p-4 text-sm">
            {detail.kind === 'promotion' && (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">{item.code}</p>
                  <p className="text-gray-500">
                    {item.currentUses || 0}/{item.maxUses || t('detail_infinity_symbol')} · {t(`coupon_discount_type_${item.discountType}`, 'coupons')}
                  </p>
                </div>
                <Badge variant="outline" className="border-red-200 text-red-700">
                  {getCouponValueLabel(item, locale)}
                </Badge>
              </div>
            )}
            {detail.kind === 'order-status' && (
              <div className="flex items-center justify-between">
                <span className="text-gray-700">{t(item.name)}</span>
                <span className="font-semibold text-gray-900">{item.value}</span>
              </div>
            )}
            {detail.kind === 'payment' && (
              <div className="flex items-center justify-between">
                <span className="text-gray-700">{item.name}</span>
                <span className="font-semibold text-gray-900">{item.value}</span>
              </div>
            )}
          </div>
        ))
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500">
          {t('no_products_found')}
        </div>
      )}
    </div>
  );
}
