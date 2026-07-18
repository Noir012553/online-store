import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Megaphone,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import { bannerAPI, type BannerRecord, getAuthToken } from '../../lib/api';
import { formatDate, getImageUrl } from '../../lib/utils';
import { getTranslatedValue } from '../../lib/data';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Pagination } from './Pagination';
import { useLanguage } from '@/lib/i18n';

const ITEMS_PER_PAGE = 10;

type ConfirmAction = 'delete' | 'restore' | 'hardDelete';

const getSlotLabel = (slot: string, slotOptions: Array<{ value: string; label: string }>) => {
  return slotOptions.find((item) => item.value === slot)?.label || slot;
};


interface BannerWithTranslations extends BannerRecord {
  translations?: {
    title?: string;
    subtitle?: string;
    description?: string;
    ctaText?: string;
  };
}

export function BannerManagementPage() {
  const router = useRouter();
  const { t, locale, loadNamespace } = useLanguage();

  useEffect(() => {
    loadNamespace('admin');
    loadNamespace('admin-banners');
  }, [loadNamespace]);

  const SLOT_GUIDANCE: Record<string, { size: string; note: string; hasCTA?: boolean }> = useMemo(() => ({
    homepage_hero: { size: t('hero_size', 'admin-banners'), note: t('hero_note', 'admin-banners'), hasCTA: true },
    homepage_warranty: { size: t('warranty_size', 'admin-banners'), note: t('warranty_note', 'admin-banners') },
    homepage_left: { size: t('sidebar_size', 'admin-banners'), note: t('sidebar_note', 'admin-banners') },
    homepage_right: { size: t('sidebar_size', 'admin-banners'), note: t('sidebar_note', 'admin-banners') },
    homepage_inline: { size: t('inline_size', 'admin-banners'), note: t('inline_note', 'admin-banners') },
  }), [t]);

  const [banners, setBanners] = useState<BannerWithTranslations[]>([]);
  const [deletedBanners, setDeletedBanners] = useState<BannerWithTranslations[]>([]);
  const [slotOptions, setSlotOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [deletedCurrentPage, setDeletedCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deletedTotalPages, setDeletedTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [deletedCount, setDeletedCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewDeletedTab, setViewDeletedTab] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ banner: BannerWithTranslations; action: ConfirmAction } | null>(null);

  useEffect(() => {
    const loadSlots = async () => {
      try {
        const response = await bannerAPI.getBannerSlots(locale);
        const apiSlots = Array.isArray(response.slots) ? response.slots : [];
        setSlotOptions(apiSlots);
      } catch {
        const slotMap: Record<string, string> = {
          sitewide_top: t('slot_sitewide_top', 'admin-banners'),
          homepage_hero: t('slot_homepage_hero', 'admin-banners'),
          homepage_left: t('slot_homepage_left', 'admin-banners'),
          homepage_right: t('slot_homepage_right', 'admin-banners'),
          homepage_inline: t('slot_homepage_inline', 'admin-banners'),
          products_top: t('slot_products_top', 'admin-banners'),
          category_top: t('slot_category_top', 'admin-banners'),
          product_top: t('slot_product_top', 'admin-banners'),
        };
        setSlotOptions(
          Object.entries(slotMap).map(([value, label]) => ({
            value,
            label
          }))
        );
      }
    };

    void loadSlots();
  }, [t, locale]);

  const loadDynamicTranslations = async (bannerList: BannerRecord[], lang: string) => {
    if (!lang) return bannerList;

    try {
      const token = getAuthToken();
      const batchItems = bannerList
        .filter((b) => b._id)
        .map((b) => ({
          entityId: b._id,
          entityType: 'banner',
          originalValue: getTranslatedValue(b.title, locale),
        }));

      if (!batchItems.length) return bannerList;

      const response = await fetch(`/api/translations/dynamic?lang=${lang}&entityType=banner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(batchItems),
      });

      if (!response.ok) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Failed to load dynamic translations for lang: ${lang}`);
        }
        return bannerList;
      }

      const data = await response.json();
      const translations = data.data || {};

      return bannerList.map((banner) => ({
        ...banner,
        translations: {
          title: translations[banner._id]?.title,
          subtitle: translations[banner._id]?.subtitle,
          description: translations[banner._id]?.description,
          ctaText: translations[banner._id]?.ctaText,
        },
      }));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`Error loading dynamic translations for lang ${lang}:`, error);
      }
      return bannerList;
    }
  };

  useEffect(() => {
    const loadBanners = async () => {
      try {
        setIsLoading(true);

        if (viewDeletedTab) {
          const response = await bannerAPI.getDeletedBanners(deletedCurrentPage, ITEMS_PER_PAGE, undefined, locale as any);
          const bannerList = Array.isArray(response.banners) ? response.banners : [];
          const withTranslations = await loadDynamicTranslations(bannerList, locale);
          setDeletedBanners(withTranslations);
          setDeletedTotalPages(response.pages || 1);
          setDeletedCount(response.total || 0);
        } else {
          const response = await bannerAPI.getBanners(undefined, true, currentPage, ITEMS_PER_PAGE, locale as any);
          const bannerList = Array.isArray(response.banners) ? response.banners : [];
          const withTranslations = await loadDynamicTranslations(bannerList, locale);
          setBanners(withTranslations);
          setTotalPages(response.pages || 1);
          setTotalCount(response.total || 0);
        }
      } catch (error) {
        if (viewDeletedTab) {
          setDeletedBanners([]);
          setDeletedTotalPages(1);
          setDeletedCount(0);
        } else {
          setBanners([]);
          setTotalPages(1);
          setTotalCount(0);
        }
        toast.error(t('error_load_data', 'admin-banners'));
      } finally {
        setIsLoading(false);
      }
    };

    void loadBanners();
  }, [currentPage, deletedCurrentPage, viewDeletedTab, locale]);

  useEffect(() => {
    if (viewDeletedTab) {
      setDeletedCurrentPage(1);
    } else {
      setCurrentPage(1);
    }
  }, [searchQuery, viewDeletedTab]);

  const activeList = viewDeletedTab ? deletedBanners : banners;
  const currentPageNumber = viewDeletedTab ? deletedCurrentPage : currentPage;
  const currentTotalPages = viewDeletedTab ? deletedTotalPages : totalPages;
  const currentTotalCount = viewDeletedTab ? deletedCount : totalCount;

  const filteredBanners = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return activeList;

    return activeList.filter((banner) => {
      const title = String(banner.title || '').toLowerCase();
      const subtitle = String(banner.subtitle || '').toLowerCase();
      const slot = String(banner.slot || '').toLowerCase();
      const targetUrl = String(banner.targetUrl || '').toLowerCase();
      return (
        title.includes(keyword) ||
        subtitle.includes(keyword) ||
        slot.includes(keyword) ||
        targetUrl.includes(keyword)
      );
    });
  }, [activeList, searchQuery]);

  const handleCreateNew = () => {
    router.push('/admin/bannersAdmin/new/edit');
  };

  const getDisplayText = (banner: BannerWithTranslations, field: 'title' | 'subtitle' | 'description' | 'ctaText'): string => {
    return banner.translations?.[field] || getTranslatedValue(banner[field], locale);
  };

  const askConfirm = (banner: BannerWithTranslations, action: ConfirmAction) => {
    setConfirmTarget({ banner, action });
  };

  const confirmAction = async () => {
    if (!confirmTarget) return;

    try {
      setIsSubmitting(true);
      if (confirmTarget.action === 'delete') {
        await bannerAPI.deleteBanner(confirmTarget.banner._id);
        toast.success(t('success_delete', 'admin-banners'));
        const response = await bannerAPI.getBanners(undefined, true, currentPage, ITEMS_PER_PAGE, locale as any);
        setBanners(Array.isArray(response.banners) ? response.banners : []);
        setTotalPages(response.pages || 1);
        setTotalCount(response.total || 0);
      } else if (confirmTarget.action === 'restore') {
        await bannerAPI.restoreBanner(confirmTarget.banner._id);
        toast.success(t('success_restore', 'admin-banners'));
        const response = await bannerAPI.getDeletedBanners(deletedCurrentPage, ITEMS_PER_PAGE, undefined, locale as any);
        setDeletedBanners(Array.isArray(response.banners) ? response.banners : []);
        setDeletedTotalPages(response.pages || 1);
        setDeletedCount(response.total || 0);
      } else {
        await bannerAPI.hardDeleteBanner(confirmTarget.banner._id);
        toast.success(t('success_hard_delete', 'admin-banners'));
        const response = await bannerAPI.getDeletedBanners(deletedCurrentPage, ITEMS_PER_PAGE, undefined, locale as any);
        setDeletedBanners(Array.isArray(response.banners) ? response.banners : []);
        setDeletedTotalPages(response.pages || 1);
        setDeletedCount(response.total || 0);
      }
      setConfirmTarget(null);
    } catch (error: any) {
      toast.error(error?.message || t('error_load_data', 'admin-banners'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStatusBadge = (banner: BannerRecord) => {
    const now = new Date();
    const startDate = banner.startDate ? new Date(banner.startDate) : null;
    const endDate = banner.endDate ? new Date(banner.endDate) : null;
    const isExpired = Boolean(endDate && endDate < now);
    const isUpcoming = Boolean(startDate && startDate > now);

    if (!banner.isActive) {
      return <Badge variant="outline" className="border-gray-300 text-gray-600">{t('banner_status_inactive', 'admin-banners')}</Badge>;
    }

    if (isExpired) {
      return <Badge variant="outline" className="border-amber-300 text-amber-700">{t('banner_status_expired', 'admin-banners')}</Badge>;
    }

    if (isUpcoming) {
      return <Badge variant="outline" className="border-blue-300 text-blue-700">{t('banner_status_upcoming', 'admin-banners')}</Badge>;
    }

    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">{t('banner_status_active', 'admin-banners')}</Badge>;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
            <Megaphone className="h-4 w-4" />
            {t('banner_management_title', 'admin-banners')}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('banner_customer_title', 'admin-banners')}</h1>
          <p className="max-w-2xl text-sm text-gray-600">
            {t('banner_management_desc', 'admin-banners')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl bg-white px-4 py-3 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{t('banner_total_count', 'admin-banners')}</div>
            <div>{currentTotalCount}</div>
          </div>
          <Button onClick={handleCreateNew} className="bg-red-600 hover:bg-red-700">
            <Plus className="mr-2 h-4 w-4" />
            {t('banner_add_new', 'admin-banners')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex rounded-full bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setViewDeletedTab(false)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${!viewDeletedTab ? 'bg-white text-gray-900 shadow' : 'text-gray-500'}`}
          >
            {t('banner_active_tab', 'admin-banners')}
          </button>
          <button
            type="button"
            onClick={() => setViewDeletedTab(true)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${viewDeletedTab ? 'bg-white text-gray-900 shadow' : 'text-gray-500'}`}
          >
            {t('banner_deleted_tab', 'admin-banners')}
          </button>
        </div>

        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('banner_search_placeholder', 'admin-banners')}
            className="h-11 pl-10"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4 text-sm text-gray-600">
          {viewDeletedTab ? t('banner_deleted_list', 'admin-banners') : t('banner_active_list', 'admin-banners')}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">{t('banner_loading', 'admin-banners')}</div>
        ) : filteredBanners.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
              <Megaphone className="h-6 w-6" />
            </div>
            <div className="text-base font-medium text-gray-900">{t('banner_no_results', 'admin-banners')}</div>
            <div className="mt-1 text-sm text-gray-500">
              {searchQuery ? t('banner_no_results_search', 'admin-banners') : t('banner_no_results_empty', 'admin-banners')}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('banner_table_image', 'admin-banners')}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('banner_table_content', 'admin-banners')}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('banner_table_position', 'admin-banners')}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('banner_table_status', 'admin-banners')}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('banner_table_time', 'admin-banners')}</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">{t('banner_table_actions', 'admin-banners')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredBanners.map((banner) => (
                  <tr key={banner._id} className="align-top">
                    <td className="px-6 py-4">
                      <div className="h-16 w-28 overflow-hidden rounded-xl bg-gray-100">
                        <img
                          src={getImageUrl(banner.image)}
                          alt={getTranslatedValue(banner.title, locale)}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-gray-900">{getDisplayText(banner, 'title')}</div>
                        {getDisplayText(banner, 'subtitle') && <div className="text-sm text-gray-600">{getDisplayText(banner, 'subtitle')}</div>}
                        {getDisplayText(banner, 'description') && <div className="line-clamp-2 text-xs text-gray-500">{getDisplayText(banner, 'description')}</div>}
                        {getDisplayText(banner, 'ctaText') && <div className="text-xs font-medium text-red-600">{t('banner_ctaPrefix', 'admin-banners')}{getDisplayText(banner, 'ctaText')}</div>}
                        {banner.targetUrl && <div className="text-xs text-gray-500">{t('banner_linkPrefix', 'admin-banners')}{banner.targetUrl}</div>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-gray-900">{getSlotLabel(banner.slot, slotOptions)}</div>
                        <div className="text-xs text-gray-500">{t('banner_form_sort_order', 'admin-banners')}: {banner.sortOrder ?? 0}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{renderStatusBadge(banner)}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="space-y-1">
                        <div>{t('banner_date_start', 'admin-banners')}{formatDate(banner.startDate, locale)}</div>
                        <div>{t('banner_date_end', 'admin-banners')}{formatDate(banner.endDate, locale)}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {viewDeletedTab ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => askConfirm(banner, 'restore')}
                            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            {t('action_restore', 'admin-banners')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => askConfirm(banner, 'hardDelete')}
                            className="border-red-200 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('action_hard_delete', 'admin-banners')}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/admin/bannersAdmin/${banner._id}/edit`)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {t('action_edit', 'admin-banners')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/admin/bannerTranslations/${banner._id}`)}
                            className="border-blue-200 text-blue-700 hover:bg-blue-50"
                          >
                            <Globe className="mr-2 h-4 w-4" />
                            {t('manage_translations', 'admin-banners')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => askConfirm(banner, 'delete')}
                            className="border-red-200 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('action_delete', 'admin-banners')}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          currentPage={currentPageNumber}
          totalPages={currentTotalPages}
          onPageChange={(page) => {
            if (viewDeletedTab) {
              setDeletedCurrentPage(page);
            } else {
              setCurrentPage(page);
            }
          }}
        />
      </div>


      <Dialog open={Boolean(confirmTarget)} onOpenChange={(open: boolean) => !open && setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmTarget?.action === 'delete'
                ? t('dialog_confirm_delete', 'admin-banners')
                : confirmTarget?.action === 'restore'
                  ? t('dialog_confirm_restore', 'admin-banners')
                  : t('dialog_confirm_hard_delete', 'admin-banners')}
            </DialogTitle>
            <DialogDescription>
              {confirmTarget?.action === 'delete'
                ? t('delete_desc', 'admin-banners')
                : confirmTarget?.action === 'restore'
                  ? t('restore_desc', 'admin-banners')
                  : t('hard_delete_desc', 'admin-banners')}
            </DialogDescription>
          </DialogHeader>

          {confirmTarget && (
            <div className="rounded-xl bg-white p-4 text-sm text-gray-700">
              <div className="font-medium text-gray-900">{getTranslatedValue(confirmTarget.banner.title, locale)}</div>
              <div className="mt-1 text-gray-500">{getSlotLabel(confirmTarget.banner.slot, slotOptions)}</div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmTarget(null)} disabled={isSubmitting}>
              {t('form_cancel', 'common')}
            </Button>
            <Button
              type="button"
              onClick={confirmAction}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? t('dialog_confirm_save', 'admin-banners') : t('action_confirm', 'admin-banners')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
