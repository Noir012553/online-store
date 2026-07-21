import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { withAdminLayout } from '../../../../components/admin/withAdminLayout';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/textarea';
import { useLanguage, SUPPORTED_LOCALES, AVAILABLE_LOCALES, DEFAULT_LOCALE, type Locale } from '../../../../lib/i18n';
import { getAuthToken } from '../../../../lib/api';
import { getLanguageLabelKey } from '../../../../lib/i18n/localeLabels';
import { toast } from 'sonner';

export async function getServerSideProps() {
  return {
    props: {},
  };
}

interface BannerTranslation {
  _id?: string;
  bannerId: string;
  language: Locale;
  title: string;
  subtitle: string;
  description: string;
  ctaText: string;
}

function TranslateEditContent() {
  const router = useRouter();
  const { bannerId, translationId } = router.query;
  const { t, locale, loadNamespace } = useLanguage();

  const [translation, setTranslation] = useState<BannerTranslation>({
    bannerId: '',
    language: DEFAULT_LOCALE,
    title: '',
    subtitle: '',
    description: '',
    ctaText: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadNamespace('admin-banners');
  }, [loadNamespace]);

  useEffect(() => {
    if (!bannerId || typeof bannerId !== 'string') return;

    if (translationId && typeof translationId === 'string') {
      fetchTranslationFromList();
    } else {
      setTranslation((prev) => ({ ...prev, bannerId }));
      setIsLoading(false);
    }
  }, [bannerId, translationId]);

  const fetchTranslationFromList = async () => {
    try {
      setIsLoading(true);
      const token = getAuthToken();
      const response = await fetch(
        `/api/banners/${bannerId}/translations?lang=${locale}`,
        {
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        }
      );

      if (!response.ok) {
        throw new Error(t('error_fetch_translations', 'admin-banners'));
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.data)) {
        const found = data.data.find((t: BannerTranslation) => t._id === translationId);
        if (found) {
          setTranslation(found);
        } else {
          toast.error(t('banner_not_found', 'admin-banners'));
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching translations:', error);
      }
      toast.error(t('error_load_data', 'admin-banners'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    const title = translation.title.trim();
    const subtitle = translation.subtitle.trim();
    const description = translation.description.trim();
    const ctaText = translation.ctaText.trim();

    // Only title is required; others are optional
    if (!title) {
      toast.error(t('error_title_required', 'admin-banners') || 'Title is required');
      return;
    }

    try {
      setIsSubmitting(true);
      const token = getAuthToken();
      const url = translation._id
        ? `/api/banners/${bannerId}/translations/${translation._id}?lang=${locale}`
        : `/api/banners/${bannerId}/translations?lang=${locale}`;

      const method = translation._id ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          language: translation.language,
          title,
          subtitle,
          description,
          ctaText,
        }),
      });

      if (!response.ok) {
        throw new Error(t('error_save_translation', 'admin-banners'));
      }

      const data = await response.json();
      if (data.success) {
        toast.success(
          translation._id ? t('banner_success_update', 'admin-banners') : t('banner_success_create', 'admin-banners')
        );
        router.back();
      } else {
        toast.error(data.message || t('error_save_translation', 'admin-banners'));
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error saving translation:', error);
      }
      toast.error(t('error_save_translation', 'admin-banners'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getLanguageName = (lang: Locale): string => {
    return t(getLanguageLabelKey(lang), 'admin-banners');
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('action_back', 'common')}
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {translation._id
              ? t('edit_translation', 'admin-banners')
              : t('add_translation', 'admin-banners')}
          </h1>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">{t('loading', 'common')}</div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="space-y-6 max-w-3xl"
          >
            <div className="rounded-lg bg-gradient-to-r from-blue-50 to-blue-100 p-4 border border-blue-200">
              <Label htmlFor="language" className="block text-sm font-semibold text-blue-900 mb-3">
                {t('language', 'admin-banners')}
              </Label>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_LOCALES.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => !translation._id && setTranslation({ ...translation, language: lang })}
                    disabled={!!translation._id}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                      translation.language === lang
                        ? 'bg-blue-600 text-white shadow-md'
                        : translation._id
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-white text-gray-700 hover:bg-blue-100 border border-blue-200'
                    }`}
                  >
                    <span className="text-lg">{AVAILABLE_LOCALES[lang].flag}</span>
                    <span>{getLanguageName(lang)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-semibold">
                  {t('translate_form_title_label', 'admin-banners')}
                </Label>
                <Input
                  id="title"
                  value={translation.title}
                  onChange={(e) =>
                    setTranslation({
                      ...translation,
                      title: e.target.value,
                    })
                  }
                  placeholder={t('translate_form_title_placeholder', 'admin-banners')}
                  disabled={isSubmitting}
                  className="text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtitle" className="text-sm font-semibold">
                  {t('translate_form_subtitle_label', 'admin-banners')}
                </Label>
                <Input
                  id="subtitle"
                  value={translation.subtitle}
                  onChange={(e) =>
                    setTranslation({
                      ...translation,
                      subtitle: e.target.value,
                    })
                  }
                  placeholder={t('translate_form_subtitle_placeholder', 'admin-banners')}
                  disabled={isSubmitting}
                  className="text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-semibold">
                  {t('translate_form_description_label', 'admin-banners')}
                </Label>
                <Textarea
                  id="description"
                  value={translation.description}
                  onChange={(e) =>
                    setTranslation({
                      ...translation,
                      description: e.target.value,
                    })
                  }
                  placeholder={t('translate_form_description_placeholder', 'admin-banners')}
                  disabled={isSubmitting}
                  rows={4}
                  className="text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ctaText" className="text-sm font-semibold">
                  {t('translate_form_cta_label', 'admin-banners')}
                </Label>
                <Input
                  id="ctaText"
                  value={translation.ctaText}
                  onChange={(e) =>
                    setTranslation({
                      ...translation,
                      ctaText: e.target.value,
                    })
                  }
                  placeholder={t('translate_form_cta_placeholder', 'admin-banners')}
                  disabled={isSubmitting}
                  className="text-base"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isSubmitting}
              >
                {t('cancel', 'common')}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSubmitting ? t('saving', 'common') : t('save', 'common')}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default withAdminLayout(TranslateEditContent, {
  permission: 'manage:banners',
  featureName: 'Banner Translation Edit',
});
