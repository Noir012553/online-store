import { useLanguage, useTranslation } from '../../../lib/i18n';
import { formatCurrencyByCode, formatDate } from '../../../lib/utils';

interface OrderDetail {
  type: 'order';
  title: string;
  item: any;
}

interface DetailViewOrderProps {
  detail: OrderDetail;
}

export function DetailViewOrder({ detail }: DetailViewOrderProps) {
  const { t } = useTranslation();
  const { locale } = useLanguage();

  return (
    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('detail_total')}
        </div>
        <div className="mt-1 font-semibold text-gray-900">
          {formatCurrencyByCode(detail.item.totalPrice, detail.item.currencyCode, locale)}
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('admin_status')}
        </div>
        <div className="mt-1 font-semibold text-gray-900">
          {t(detail.item.isDelivered ? 'my_orders_status_delivered' : detail.item.isPaid ? 'my_orders_status_paid' : 'pending_payment')}
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('detail_payment')}
        </div>
        <div className="mt-1 font-semibold text-gray-900">
          {t(`payment_method_${detail.item.paymentMethod || 'unknown'}`, 'checkout')}
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('detail_date')}
        </div>
        <div className="mt-1 font-semibold text-gray-900">
          {formatDate(detail.item.createdAt, locale)}
        </div>
      </div>
    </div>
  );
}
