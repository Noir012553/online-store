import { useTranslation } from '../../../lib/i18n';

interface CategoryDetail {
  type: 'category';
  title: string;
  item: { label: string; count: number };
}

interface DetailViewCategoryProps {
  detail: CategoryDetail;
}

export function DetailViewCategory({ detail }: DetailViewCategoryProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-gray-100 p-4">
      <div className="text-xs uppercase tracking-wider text-gray-500">
        {t('detail_products')}
      </div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">
        {detail.item.count}
      </div>
    </div>
  );
}
