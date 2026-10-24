'use client';

import { useLanguage } from '@/lib/context/LanguageContext';
import { HamsterLoader } from './HamsterLoader';

export function LoadingGate() {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
      <div className="flex flex-col items-center justify-center gap-4">
        <HamsterLoader size={120} />
        <p className="text-sm text-gray-600">{t('loading', 'ui-loading')}</p>
      </div>
    </div>
  );
}
