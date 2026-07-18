import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Globe, Plus, Trash2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { getAuthToken } from '../../lib/api';
import { getLanguageLabelKey } from '../../lib/i18n/localeLabels';
import { useLanguage, SUPPORTED_LOCALES, AVAILABLE_LOCALES, type Locale } from '../../lib/i18n';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface BannerTranslation {
  _id?: string;
  bannerId: string;
  language: Locale;
  title: string;
  subtitle: string;
  description: string;
  ctaText: string;
  createdAt?: string;
  updatedAt?: string;
}

interface BannerTranslationManagerProps {
  bannerId: string;
  bannerTitle?: string;
  onClose?: () => void;
}

export function BannerTranslationManager({ bannerId, bannerTitle, onClose }: BannerTranslationManagerProps) {
  const router = useRouter();
  const { t, locale, loadNamespace } = useLanguage();

  const [translations, setTranslations] = useState<BannerTranslation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoTranslating, setIsAutoTranslating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadNamespace('admin-banners');
  }, [loadNamespace]);

  useEffect(() => {
    fetchTranslations();
  }, [bannerId]);

  const fetchTranslations = async () => {
    if (!bannerId) {
      setTranslations([]);
      return;
    }

    try {
      setIsLoading(true);
      const token = getAuthToken();
      const response = await fetch(`/api/banners/${bannerId}/translations?lang=${locale}`, {
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });

      if (!response.ok) {
        throw new Error(t('error_fetch_translations', 'admin-banners'));
      }

      const data = await response.json();
      if (data.success) {
        setTranslations(Array.isArray(data.data) ? data.data : []);
      } else {
        setTranslations([]);
      }
    } catch (error) {
      toast.error(t('error_load_data', 'admin-banners'));
      setTranslations([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (translationId: string) => {
    setDeleteConfirm(translationId);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;

    try {
      setIsSubmitting(true);
      const token = getAuthToken();
      const response = await fetch(
        `/api/banners/${bannerId}/translations/${deleteConfirm}?lang=${locale}`,
        {
          method: 'DELETE',
          headers: {
            ...(token && { 'Authorization': `Bearer ${token}` }),
          },
        }
      );

      if (!response.ok) {
        throw new Error(t('error_delete_translation', 'admin-banners'));
      }

      const data = await response.json();
      if (data.success) {
        toast.success(t('success_delete', 'admin-banners'));
        await fetchTranslations();
      } else {
        toast.error(data.message || t('error_delete_translation', 'admin-banners'));
      }
    } catch (error) {
      toast.error(t('error_delete_translation', 'admin-banners'));
    } finally {
      setIsSubmitting(false);
      setDeleteConfirm(null);
    }
  };

  const handleAutoTranslate = async () => {
    try {
      setIsAutoTranslating(true);
      const token = getAuthToken();
      const response = await fetch(`/api/banners/${bannerId}/auto-translate?lang=${locale}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({
          targetLanguages: [],
          field: 'all',
        }),
      });

      if (!response.ok) {
        throw new Error(t('error_auto_translate', 'admin-banners'));
      }

      const data = await response.json();
      if (data.success) {
        toast.success(t('banner_success_update', 'admin-banners'));
        await fetchTranslations();
      } else {
        toast.error(data.message || t('error_save_translation', 'admin-banners'));
      }
    } catch (error) {
      toast.error(t('error_save_translation', 'admin-banners'));
    } finally {
      setIsAutoTranslating(false);
    }
  };

  const getLanguageName = (lang: Locale): string => {
    return t(getLanguageLabelKey(lang), 'admin-banners');
  };

  const getTranslationLanguages = (): Locale[] => {
    return translations.map((t) => t.language);
  };

  const getMissingLanguages = (): Locale[] => {
    const translatedLangs = getTranslationLanguages();
    return SUPPORTED_LOCALES.filter((lang) => !translatedLangs.includes(lang));
  };

  const missingLanguages = getMissingLanguages();

  return (
    <>
      <Dialog open={!!deleteConfirm} onOpenChange={() => !isSubmitting && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirm_delete_translation_title', 'admin-banners')}</DialogTitle>
            <DialogDescription>
              {t('confirm_delete_translation_desc', 'admin-banners')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={isSubmitting}
            >
              {t('cancel', 'common')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? t('deleting', 'common') : t('delete', 'common')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        <div className="rounded-xl bg-gradient-to-r from-blue-50 to-blue-100 p-5 border border-blue-200 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Globe className="h-6 w-6 text-blue-600" />
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{t('banner_translation_manager_title', 'admin-banners')}</p>
                <p className="text-sm text-gray-700 mt-1">{bannerTitle}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                onClick={handleAutoTranslate}
                variant="outline"
                size="sm"
                disabled={isAutoTranslating || translations.length === 0}
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                {isAutoTranslating ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-700" />
                    {t('banner_translation_auto_translating', 'admin-banners')}
                  </>
                ) : (
                  <>
                    <Globe className="mr-2 h-4 w-4" />
                    {t('banner_translation_auto_translate', 'admin-banners')}
                  </>
                )}
              </Button>
              <Button
                onClick={() => router.push(`/admin/bannerTranslations/${bannerId}/translate`)}
                variant="outline"
                size="sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('add_translation', 'admin-banners')}
              </Button>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-blue-200">
            <p className="text-xs font-medium text-gray-600 mb-2">{t('language_coverage', 'admin-banners') || 'Ngôn ngữ được hỗ trợ'}:</p>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_LOCALES.map((lang) => {
                const isTranslated = translations.some((t) => t.language === lang);
                return (
                  <div key={lang} className="flex items-center gap-1">
                    <span className="text-lg">{AVAILABLE_LOCALES[lang].flag}</span>
                    <Badge
                      variant={isTranslated ? 'default' : 'outline'}
                      className={isTranslated ? 'bg-emerald-600 text-white' : 'border-gray-300 text-gray-600'}
                    >
                      {isTranslated ? (
                        <Check className="mr-1 h-3 w-3" />
                      ) : null}
                      {t(AVAILABLE_LOCALES[lang].labelKey, 'admin-translation')}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            {t('banner_translation_loading', 'admin-banners')}
          </div>
        ) : translations.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
            <Globe className="mx-auto mb-3 h-8 w-8 text-gray-400" />
            <p className="font-medium text-gray-900">{t('no_translations_yet', 'admin-banners')}</p>
            <p className="text-sm text-gray-600 mt-1">{t('click_add_translation_to_start', 'admin-banners') || 'Click nút "Thêm dịch thuật" để bắt đầu'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {translations.map((translation) => (
              <div
                key={translation._id}
                className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">{AVAILABLE_LOCALES[translation.language].flag}</span>
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                        {getLanguageName(translation.language)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="border-b border-gray-100 pb-2">
                        <span className="font-semibold text-gray-700 block">{t('banner_translation_field_title', 'admin-banners')}</span>
                        <p className="text-gray-600 mt-1 line-clamp-2">{translation.title}</p>
                      </div>
                      <div className="border-b border-gray-100 pb-2">
                        <span className="font-semibold text-gray-700 block">{t('banner_translation_field_subtitle', 'admin-banners')}</span>
                        <p className="text-gray-600 mt-1 line-clamp-2">{translation.subtitle}</p>
                      </div>
                      <div className="border-b border-gray-100 pb-2">
                        <span className="font-semibold text-gray-700 block">{t('banner_translation_field_description', 'admin-banners')}</span>
                        <p className="text-gray-600 mt-1 line-clamp-2">{translation.description}</p>
                      </div>
                      <div>
                        <span className="font-semibold text-gray-700 block">{t('banner_translation_field_cta', 'admin-banners')}</span>
                        <p className="text-gray-600 mt-1">{translation.ctaText}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      onClick={() => router.push(`/admin/bannerTranslations/${bannerId}/translate?translationId=${translation._id}`)}
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                      className="whitespace-nowrap"
                    >
                      {t('edit', 'common')}
                    </Button>
                    <Button
                      onClick={() => translation._id && handleDelete(translation._id)}
                      variant="ghost"
                      size="sm"
                      disabled={isSubmitting}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {missingLanguages.length > 0 && translations.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm font-medium text-amber-900 mb-2">Các ngôn ngữ chưa được dịch:</p>
            <div className="flex flex-wrap gap-2">
              {missingLanguages.map((lang) => (
                <Badge
                  key={lang}
                  variant="outline"
                  className="border-amber-300 text-amber-800 cursor-pointer hover:bg-amber-100"
                  onClick={() => router.push(`/admin/bannerTranslations/${bannerId}/translate`)}
                >
                  <span className="mr-2">{AVAILABLE_LOCALES[lang].flag}</span>
                  {t(AVAILABLE_LOCALES[lang].labelKey, 'admin-translation')}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
