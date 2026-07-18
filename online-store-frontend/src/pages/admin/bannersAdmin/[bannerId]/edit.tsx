import { useRouter } from 'next/router';
import { useEffect, useState, type ChangeEvent, useMemo } from 'react';
import { ArrowLeft, Upload, CheckCircle2, Circle } from 'lucide-react';
import { withAdminLayout } from '../../../../components/admin/withAdminLayout';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import { bannerAPI, type BannerRecord } from '../../../../lib/api';
import { useLanguage, SUPPORTED_LOCALES, AVAILABLE_LOCALES, DEFAULT_LOCALE, type Locale } from '../../../../lib/i18n';
import { getTranslatedValue } from '../../../../lib/data';
import { toast } from 'sonner';
import { getImageUrl } from '../../../../lib/utils';
import { useCloudinaryUpload } from '../../../../hooks/useCloudinaryUpload';

export async function getServerSideProps() {
  return {
    props: {},
  };
}

type MultiLangField = Record<Locale, string>;

type BannerFormState = {
  _id?: string;
  title: MultiLangField;
  subtitle: MultiLangField;
  description: MultiLangField;
  ctaText: MultiLangField;
  targetUrl: string;
  slot: string;
  sortOrder: string;
  isActive: boolean;
  openInNewTab: boolean;
  startDate: string;
  endDate: string;
  originalData?: BannerRecord;
};

const DEFAULT_SLOT = 'homepage_hero';

const toDateInputValue = (value?: string | Date) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};


const createEmptyMultiLangField = (): MultiLangField => {
  const field = {} as MultiLangField;
  for (const lang of SUPPORTED_LOCALES) {
    field[lang] = '';
  }
  return field;
};

const convertToMultiLangField = (value: any): MultiLangField => {
  if (typeof value === 'object' && value !== null) {
    const field = createEmptyMultiLangField();
    for (const lang of SUPPORTED_LOCALES) {
      field[lang] = String(value[lang] || '') || '';
    }
    return field;
  }
  const field = createEmptyMultiLangField();
  field[DEFAULT_LOCALE] = String(value || '');
  return field;
};

const formatSlotName = (slot: string) => {
  return slot
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getLanguageCompletionStatus = (banner: BannerFormState, hasCTA: boolean, lang: Locale) => {
  const isHeroSlot = banner.slot === 'homepage_hero';

  if (!isHeroSlot) {
    return banner.title[lang]?.trim() ? 'complete' : 'incomplete';
  }

  if (hasCTA) {
    const hasTitle = banner.title[lang]?.trim();
    const hasSubtitle = banner.subtitle[lang]?.trim();
    const hasDescription = banner.description[lang]?.trim();
    const hasCtaText = banner.ctaText[lang]?.trim();

    if (hasTitle && hasSubtitle && hasDescription && hasCtaText) {
      return 'complete';
    }
    if (hasTitle || hasSubtitle || hasDescription || hasCtaText) {
      return 'partial';
    }
    return 'incomplete';
  }

  return 'incomplete';
};

const getCompleteLanguages = (banner: BannerFormState, hasCTA: boolean): Locale[] => {
  return SUPPORTED_LOCALES.filter(lang => {
    const status = getLanguageCompletionStatus(banner, hasCTA, lang);
    return status === 'complete';
  });
};

const getPartialLanguages = (banner: BannerFormState, hasCTA: boolean): Locale[] => {
  return SUPPORTED_LOCALES.filter(lang => {
    const status = getLanguageCompletionStatus(banner, hasCTA, lang);
    return status === 'partial';
  });
};

const getIncompleteOptionalLanguages = (banner: BannerFormState, hasCTA: boolean): Locale[] => {
  return SUPPORTED_LOCALES.filter(lang => {
    const status = getLanguageCompletionStatus(banner, hasCTA, lang);
    return status === 'partial' || status === 'incomplete';
  });
};

const validateMultiLanguage = (banner: BannerFormState, hasCTA: boolean): string | null => {
  const isHeroSlot = banner.slot === 'homepage_hero';
  const completeLanguages = getCompleteLanguages(banner, hasCTA && isHeroSlot);

  // Flexible validation: require at least ONE complete language
  if (completeLanguages.length === 0) {
    if (isHeroSlot && hasCTA) {
      return 'banner_error_lang_at_least_one_complete_cta';
    }
    return 'banner_error_lang_at_least_one_complete';
  }

  return null;
};

function BannerEditPageContent() {
  const router = useRouter();
  const { bannerId } = router.query;
  const { t, locale, loadNamespace } = useLanguage();
  const { uploadToCloudinary, validateUploadedImage, uploadProgress } = useCloudinaryUpload();

  useEffect(() => {
    loadNamespace('admin-banners');
  }, [loadNamespace]);

  const [banner, setBanner] = useState<BannerFormState | null>(null);
  const [slotOptions, setSlotOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [selectedLang, setSelectedLang] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const loadSlots = async () => {
      try {
        const response = await bannerAPI.getBannerSlots(locale);
        const apiSlots = Array.isArray(response.slots) ? response.slots : [];
        setSlotOptions(apiSlots);
      } catch {
        const slotMap: Record<string, string> = {
          homepage_hero: t('slot_homepage_hero', 'admin-banners'),
          homepage_left: t('slot_homepage_left', 'admin-banners'),
          homepage_right: t('slot_homepage_right', 'admin-banners'),
          homepage_inline: t('slot_homepage_inline', 'admin-banners'),
        };
        setSlotOptions(
          Object.entries(slotMap).map(([value, label]) => ({
            value,
            label,
          }))
        );
      }
    };

    loadSlots();
  }, [locale, t]);

  useEffect(() => {
    if (!bannerId || typeof bannerId !== 'string') return;

    const fetchBanner = async () => {
      try {
        setIsLoading(true);
        const response = await bannerAPI.getBannerById(bannerId, locale as any);
        if (response) {
          const formState: BannerFormState = {
            _id: response._id,
            title: convertToMultiLangField(response.title),
            subtitle: convertToMultiLangField(response.subtitle),
            description: convertToMultiLangField(response.description),
            ctaText: convertToMultiLangField(response.ctaText),
            targetUrl: response.targetUrl || '',
            slot: response.slot || DEFAULT_SLOT,
            sortOrder: String(response.sortOrder ?? 0),
            isActive: response.isActive ?? true,
            openInNewTab: response.openInNewTab ?? false,
            startDate: toDateInputValue(response.startDate),
            endDate: toDateInputValue(response.endDate),
            originalData: response,
          };
          setBanner(formState);
          setImagePreview(getImageUrl(response.image) || '');
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

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!banner) return;

    const slot = banner.slot.trim();
    const targetUrl = banner.targetUrl.trim();
    const isHeroSlot = slot === 'homepage_hero';

    if (!slot) {
      toast.error(t('banner_error_no_slot', 'admin-banners'));
      return;
    }

    const hasCTA = selectedSlotGuidance?.hasCTA || false;
    const langError = validateMultiLanguage(banner, hasCTA);
    if (langError) {
      toast.error(t(langError, 'admin-banners'));
      return;
    }

    if (isHeroSlot) {
      if (!targetUrl) {
        toast.error(t('banner_error_url_required', 'admin-banners'));
        return;
      }
    }

    if (banner.startDate && banner.endDate && new Date(banner.startDate) >= new Date(banner.endDate)) {
      toast.error(t('banner_error_date_invalid', 'admin-banners'));
      return;
    }

    let imageUrl = '';
    let imagePublicId = '';

    // Handle image upload to Cloudinary if a new image file is provided
    if (imageFile) {
      try {
        setIsSubmitting(true);
        const uploadResult = await uploadToCloudinary(imageFile, 'banners');
        if (!uploadResult) {
          return;
        }

        // Validate the uploaded image
        const isValid = await validateUploadedImage(uploadResult);
        if (!isValid) {
          return;
        }

        imageUrl = uploadResult.secure_url;
        imagePublicId = uploadResult.public_id;
      } catch (error: any) {
        toast.error(error?.message || t('banner_error_load_data', 'admin-banners'));
        setIsSubmitting(false);
        return;
      }
    }

    const formData = new FormData();

    formData.append('title', JSON.stringify(banner.title));
    formData.append('subtitle', JSON.stringify(banner.subtitle));
    formData.append('description', JSON.stringify(banner.description));
    formData.append('ctaText', JSON.stringify(banner.ctaText));
    formData.append('targetUrl', banner.targetUrl);
    formData.append('slot', slot);
    formData.append('sortOrder', banner.sortOrder || '0');
    formData.append('isActive', String(banner.isActive));
    formData.append('openInNewTab', String(banner.openInNewTab));
    formData.append('startDate', banner.startDate);
    formData.append('endDate', banner.endDate);

    if (imageFile) {
      formData.append('image', imageUrl);
      formData.append('imagePublicId', imagePublicId || '');
    }

    try {
      if (banner._id) {
        await bannerAPI.updateBanner(banner._id, formData);
        toast.success(t('banner_success_update', 'admin-banners'));
      } else {
        await bannerAPI.createBanner(formData);
        toast.success(t('banner_success_create', 'admin-banners'));
      }
      router.back();
    } catch (error: any) {
      toast.error(error?.message || t('banner_error_load_data', 'admin-banners'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoBack = () => {
    if (imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }
    router.back();
  };

  const selectedSlotGuidance = banner
    ? {
        homepage_hero: { size: t('hero_size', 'admin-banners'), note: t('hero_note', 'admin-banners'), hasCTA: true },
        homepage_left: { size: t('sidebar_size', 'admin-banners'), note: t('sidebar_note', 'admin-banners'), hasCTA: false },
        homepage_right: { size: t('sidebar_size', 'admin-banners'), note: t('sidebar_note', 'admin-banners'), hasCTA: false },
        homepage_inline: { size: t('inline_size', 'admin-banners'), note: t('inline_note', 'admin-banners'), hasCTA: false },
      }[banner.slot] || { size: '', note: '', hasCTA: false }
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 p-6">
        <div className="text-gray-500">{t('loading', 'common')}</div>
      </div>
    );
  }

  if (!banner) {
    return (
      <div className="space-y-6 p-6">
        <Button variant="outline" size="sm" onClick={handleGoBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('action_back', 'common')}
        </Button>
        <div className="text-center text-gray-600">{t('banner_not_found', 'admin-banners')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoBack}
            disabled={isSubmitting}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('banner_action_back', 'admin-banners') || t('action_back', 'common')}
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">
              {banner._id ? t('banner_edit_title', 'admin-banners') : t('banner_add_title', 'admin-banners')}
            </h1>
          </div>
        </div>

        <div className="grid gap-6 rounded-2xl bg-white p-6 shadow-sm lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="space-y-2">
                <Label>{t('banner_form_position_required', 'admin-banners')}</Label>
                <Select
                  value={banner.slot}
                  onValueChange={(value) =>
                    setBanner({
                      ...banner,
                      slot: value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {slotOptions.map((slot) => (
                      <SelectItem key={slot.value} value={slot.value}>
                        {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  <div className="font-medium">{t('banner_form_quick_tips', 'admin-banners')}</div>
                  <div>{selectedSlotGuidance?.size}</div>
                  <div>{selectedSlotGuidance?.note}</div>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-gray-900">{t('banner_form_languages', 'admin-banners')}</Label>
                  <div className="text-xs text-gray-500">
                    {SUPPORTED_LOCALES.filter(lang => getLanguageCompletionStatus(banner, selectedSlotGuidance?.hasCTA || false, lang) === 'complete').length}/{SUPPORTED_LOCALES.length}
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-600">{t('banner_form_lang_required', 'admin-banners')}</p>
              </div>
              <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
                {SUPPORTED_LOCALES.map((lang) => {
                  const status = getLanguageCompletionStatus(banner, selectedSlotGuidance?.hasCTA || false, lang);
                  const isRequired = true;
                  const isComplete = status === 'complete';

                  return (
                    <button
                      key={lang}
                      onClick={() => setSelectedLang(lang)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        selectedLang === lang
                          ? 'bg-red-100 text-red-700 ring-2 ring-red-300'
                          : isComplete
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : isRequired
                              ? 'bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      title={t('banner_form_lang_required_all', 'admin-banners') || t('banner_form_lang_all_required', 'admin-banners')}
                    >
                      <span>{AVAILABLE_LOCALES[lang].flag}</span>
                      <span>{t(`locale_label_${lang}`, 'admin-translation')}</span>
                      {isComplete && <CheckCircle2 className="h-4 w-4" />}
                      {!isComplete && isRequired && <Circle className="h-4 w-4" />}
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-gray-600 space-y-1 pt-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-yellow-500"></div>
                  <span>{t('banner_form_lang_required_badge', 'admin-banners')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                  <span>{t('banner_form_lang_complete_badge', 'admin-banners')}</span>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-200 text-gray-500">
                  {t('banner_form_lang_optional_note', 'admin-banners') || 'Bạn có thể dịch sang tất cả 9 ngôn ngữ được hỗ trợ'}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">{t('banner_form_title', 'admin-banners')}</Label>
                <Input
                  id="title"
                  value={banner.title[selectedLang] || ''}
                  onChange={(e) =>
                    setBanner({
                      ...banner,
                      title: { ...banner.title, [selectedLang]: e.target.value },
                    })
                  }
                  placeholder={t('banner_form_title_placeholder', 'admin-banners')}
                />
              </div>

              {selectedSlotGuidance?.hasCTA && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="subtitle">{t('banner_form_subtitle', 'admin-banners')}</Label>
                    <Input
                      id="subtitle"
                      value={banner.subtitle[selectedLang] || ''}
                      onChange={(e) =>
                        setBanner({
                          ...banner,
                          subtitle: { ...banner.subtitle, [selectedLang]: e.target.value },
                        })
                      }
                      placeholder={t('banner_form_subtitle_placeholder', 'admin-banners')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">{t('banner_form_description', 'admin-banners')}</Label>
                    <Textarea
                      id="description"
                      value={banner.description[selectedLang] || ''}
                      onChange={(e) =>
                        setBanner({
                          ...banner,
                          description: { ...banner.description, [selectedLang]: e.target.value },
                        })
                      }
                      placeholder={t('banner_form_description_placeholder', 'admin-banners')}
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cta">{t('banner_form_cta_button', 'admin-banners')}</Label>
                    <Input
                      id="cta"
                      value={banner.ctaText[selectedLang] || ''}
                      onChange={(e) =>
                        setBanner({
                          ...banner,
                          ctaText: { ...banner.ctaText, [selectedLang]: e.target.value },
                        })
                      }
                      placeholder={t('banner_form_cta_placeholder', 'admin-banners')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="link">{t('banner_form_link', 'admin-banners')}</Label>
                    <Input
                      id="link"
                      value={banner.targetUrl}
                      onChange={(e) => setBanner({ ...banner, targetUrl: e.target.value })}
                      placeholder={t('banner_linkExample', 'admin-banners')}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sort">{t('banner_form_sort_order', 'admin-banners')}</Label>
              <Input
                id="sort"
                type="number"
                value={banner.sortOrder}
                onChange={(e) => setBanner({ ...banner, sortOrder: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">{t('banner_form_start_date', 'admin-banners')}</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={banner.startDate}
                  onChange={(e) => setBanner({ ...banner, startDate: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">{t('banner_form_end_date', 'admin-banners')}</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={banner.endDate}
                  onChange={(e) => setBanner({ ...banner, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 rounded-xl bg-white p-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={banner.isActive}
                  onChange={(e) => setBanner({ ...banner, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                {t('banner_form_enable', 'admin-banners')}
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={banner.openInNewTab}
                  onChange={(e) => setBanner({ ...banner, openInNewTab: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                {t('banner_form_open_new_tab', 'admin-banners')}
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('banner_form_image_label', 'admin-banners')}</Label>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white p-6 text-center hover:border-red-300 hover:bg-red-50/40">
                <Upload className="mb-3 h-6 w-6 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">{t('banner_form_image_upload', 'admin-banners')}</span>
                <span className="mt-1 text-xs text-gray-500">{t('banner_form_image_formats', 'admin-banners')}</span>
                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              </label>
            </div>

            {imagePreview && (
              <div className="space-y-2">
                <Label>{t('banner_form_image_preview', 'admin-banners')}</Label>
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
                  <img
                    src={imagePreview}
                    alt={banner.title[selectedLang] || t('banner_preview_alt', 'admin-banners')}
                    className="h-56 w-full object-cover"
                  />
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
              <div className="font-medium text-gray-900">{t('banner_form_image_tips', 'admin-banners')}</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>{t('banner_form_image_tip_1', 'admin-banners')}</li>
                <li>{t('banner_form_image_tip_2', 'admin-banners')}</li>
                <li>{t('banner_form_image_tip_3', 'admin-banners')}</li>
                <li>{t('banner_form_image_tip_4', 'admin-banners')}</li>
              </ul>
            </div>
          </div>
        </div>

        {banner && getIncompleteOptionalLanguages(banner, selectedSlotGuidance?.hasCTA || false).length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-sm text-amber-800">
              <div className="font-semibold">{t('banner_form_warning_incomplete_optional', 'admin-banners') || 'Cảnh báo: Một số ngôn ngữ bị incomplete'}</div>
              <div className="mt-2 space-y-1 text-xs">
                {getIncompleteOptionalLanguages(banner, selectedSlotGuidance?.hasCTA || false).map(lang => (
                  <div key={lang} className="flex items-center gap-2">
                    <span>{AVAILABLE_LOCALES[lang].flag}</span>
                    <span>{t(AVAILABLE_LOCALES[lang].labelKey, 'admin-banners')} ({lang.toUpperCase()}) - {t('banner_form_lang_incomplete', 'admin-banners') || 'chưa hoàn tất'}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-amber-700">{t('banner_form_warning_incomplete_note', 'admin-banners') || 'Bạn có thể tiếp tục và dịch những ngôn ngữ này sau từ trang quản lý bản dịch'}</div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={handleGoBack}
            disabled={isSubmitting}
          >
            {t('banner_form_cancel', 'admin-banners')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isSubmitting ? t('banner_dialog_confirm_save', 'admin-banners') : banner._id ? t('banner_form_update', 'admin-banners') : t('banner_form_create', 'admin-banners')}
          </Button>
      </div>
    </div>
  );
}

export default withAdminLayout(BannerEditPageContent, {
  permission: 'manage:banners',
  featureName: 'Edit Banner',
});
