'use client';

import { useLanguage } from '@/lib/context/LanguageContext';

export function LoadingGate() {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
      <div className="flex flex-col items-center justify-center gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="text-sm text-gray-600">{t('loading', 'ui-loading')}</p>
      </div>
    </div>
  );
}
