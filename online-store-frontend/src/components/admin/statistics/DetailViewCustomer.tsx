import { useLanguage } from '../../../lib/i18n';
import { useTranslation } from '../../../lib/i18n';
import { formatCurrencyByCode, formatDate } from '../../../lib/utils';

interface CustomerDetail {
  type: 'customer';
  title: string;
  item: any;
}

interface DetailViewCustomerProps {
  detail: CustomerDetail;
}

export function DetailViewCustomer({ detail }: DetailViewCustomerProps) {
  const { t } = useTranslation();
  const { locale } = useLanguage();

  return (
    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('detail_orders_label')}
        </div>
        <div className="mt-1 font-semibold text-gray-900">
          {detail.item.totalOrders || 0}
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('detail_spent_label')}
        </div>
        <div className="mt-1 font-semibold text-gray-900">
          {formatCurrencyByCode(detail.item.totalSpent ?? 0, detail.item.currencyCode || 'VND', locale)}
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 p-4 sm:col-span-2">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('detail_joined_label')}
        </div>
        <div className="mt-1 font-semibold text-gray-900">
          {formatDate(detail.item.createdAt, locale)}
        </div>
      </div>
    </div>
  );
}
