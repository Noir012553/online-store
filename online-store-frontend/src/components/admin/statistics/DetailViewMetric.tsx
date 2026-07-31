import { useTranslation } from '../../../lib/i18n';

interface MetricDetail {
  type: 'metric';
  title: string;
  subtitle?: string;
  value: string | number;
  meta?: Record<string, string | number>;
}

interface DetailViewMetricProps {
  detail: MetricDetail;
}

export function DetailViewMetric({ detail }: DetailViewMetricProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 text-sm text-gray-700">
      <div className="rounded-xl bg-white p-4">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {t('admin_value')}
        </div>
        <div className="mt-1 text-2xl font-semibold text-gray-900">
          {detail.value}
        </div>
      </div>
      {detail.meta && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Object.entries(detail.meta).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-gray-100 p-4">
              <div className="text-xs uppercase tracking-wider text-gray-500">
                {label}
              </div>
              <div className="mt-1 font-semibold text-gray-900">
                {String(value)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
