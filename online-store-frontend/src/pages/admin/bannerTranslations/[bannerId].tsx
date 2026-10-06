import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { withAdminLayout } from '../../../components/admin/withAdminLayout';
import { BannerTranslationManager } from '../../../components/admin/BannerTranslationManager';
import { Button } from '../../../components/ui/button';
import { bannerAPI, type BannerRecord } from '../../../lib/api';
import { useLanguage } from '../../../lib/i18n';
import { getTranslatedValue } from '../../../lib/data';
import { toast } from 'sonner';

export async function getServerSideProps() {
  return {
    props: {},
  };
}

function BannerTranslationsContent() {
  const router = useRouter();
  const { bannerId } = router.query;
  const { t, locale } = useLanguage();
  const [banner, setBanner] = useState<BannerRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!bannerId || typeof bannerId !== 'string') return;

    const fetchBanner = async () => {
      try {
        setIsLoading(true);
        const response = await bannerAPI.getBannerById(bannerId, locale as any);
        if (response) {
          setBanner(response);
        }
      } catch (error) {
        toast.error(t('error_load_data', 'admin-banners'));
        if (process.env.NODE_ENV === 'development') {
          console.error('Error fetching banner:', error);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchBanner();
  }, [bannerId, locale, t]);

  const handleGoBack = () => {
    router.back();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={handleGoBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('action_back', 'common')}
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{t('banner_translation_manager_title', 'admin-banners')}</h1>
          {banner && (
            <p className="mt-1 text-sm text-gray-600">{getTranslatedValue(banner.title, locale)}</p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">{t('loading', 'common')}</div>
        </div>
      ) : banner ? (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <BannerTranslationManager
            bannerId={bannerId as string}
            bannerTitle={getTranslatedValue(banner.title, locale)}
            onClose={handleGoBack}
          />
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
          <p className="text-gray-600">{t('banner_not_found', 'admin-banners')}</p>
        </div>
      )}
    </div>
  );
}

export default withAdminLayout(BannerTranslationsContent, {
  permission: 'manage:banners',
  featureName: 'Banner Translations',
});
