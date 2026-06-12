import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  Megaphone,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { bannerAPI, type BannerRecord } from '../../lib/api';
import { formatDate, getImageUrl } from '../../lib/utils';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Pagination } from './Pagination';
import { useLanguage } from '@/lib/i18n';

const ITEMS_PER_PAGE = 10;
const DEFAULT_SLOT = 'homepage_hero';

type BannerFormState = {
  _id?: string;
  title: string;
  subtitle: string;
  description: string;
  ctaText: string;
  targetUrl: string;
  slot: string;
  sortOrder: string;
  isActive: boolean;
  openInNewTab: boolean;
  startDate: string;
  endDate: string;
};

type ConfirmAction = 'delete' | 'restore' | 'hardDelete';

type BannerConflict = {
  existingBanner: BannerRecord;
  conflictReason: 'same_slot_active' | 'time_overlap';
};

const toDateInputValue = (value?: string | Date) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultEndDate = () => {
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  return toDateInputValue(nextYear);
};

const formatSlotName = (slot: string) => {
  // Convert 'homepage_right' -> 'Homepage Right'
  return slot
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getSlotLabel = (slot: string, slotOptions: Array<{ value: string; label: string }>) => {
  return slotOptions.find((item) => item.value === slot)?.label || formatSlotName(slot);
};

const getLocalizedText = (value: any): string => {
  if (typeof value === 'object' && value !== null && 'vi' in value && 'en' in value) {
    return value.vi || value.en || '';
  }
  return String(value || '');
};

const createEmptyForm = (): BannerFormState => {
  const today = new Date();

  return {
    title: '',
    subtitle: '',
    description: '',
    ctaText: '',
    targetUrl: '',
    slot: DEFAULT_SLOT,
    sortOrder: '0',
    isActive: true,
    openInNewTab: false,
    startDate: toDateInputValue(today),
    endDate: getDefaultEndDate(),
  };
};

const checkBannerConflicts = (
  form: BannerFormState,
  allBanners: BannerRecord[],
  excludeBannerId?: string
): BannerConflict[] => {
  const conflicts: BannerConflict[] = [];

  if (!form.isActive) {
    return conflicts;
  }

  const formStartDate = new Date(form.startDate);
  const formEndDate = new Date(form.endDate);

  const conflictingBanners = allBanners.filter((banner) => {
    if (excludeBannerId && banner._id === excludeBannerId) {
      return false;
    }

    if (!banner.isActive) {
      return false;
    }

    if (banner.slot !== form.slot) {
      return false;
    }

    const bannerStartDate = new Date(banner.startDate || new Date());
    const bannerEndDate = new Date(banner.endDate || new Date());

    // Check if time periods overlap
    const hasTimeOverlap = formStartDate <= bannerEndDate && formEndDate >= bannerStartDate;

    return hasTimeOverlap;
  });

  return conflictingBanners.map((banner) => ({
    existingBanner: banner,
    conflictReason: 'time_overlap',
  }));
};

export function BannerManagementPage() {
  const { t } = useLanguage();

  const SLOT_GUIDANCE: Record<string, { size: string; note: string; hasCTA?: boolean }> = {
    homepage_hero: { size: t('hero_size'), note: t('hero_note'), hasCTA: true },
    homepage_left: { size: t('sidebar_size'), note: t('sidebar_note') },
    homepage_right: { size: t('sidebar_size'), note: t('sidebar_note') },
    homepage_inline: { size: t('inline_size'), note: t('inline_note') },
  };

  const [banners, setBanners] = useState<BannerRecord[]>([]);
  const [deletedBanners, setDeletedBanners] = useState<BannerRecord[]>([]);
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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<BannerFormState | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<{ banner: BannerRecord; action: ConfirmAction } | null>(null);
  const [bannerConflicts, setBannerConflicts] = useState<BannerConflict[]>([]);
  const [confirmSubmitWithConflict, setConfirmSubmitWithConflict] = useState(false);

  useEffect(() => {
    const loadSlots = async () => {
      try {
        const response = await bannerAPI.getBannerSlots();
        const apiSlots = Array.isArray(response.slots) ? response.slots : [];
        setSlotOptions(
          apiSlots.map((slot: { value: string; label: string }) => ({
            value: slot.value,
            label: formatSlotName(slot.value),
          }))
        );
      } catch {
        const slotMap: Record<string, string> = {
          homepage_hero: t('slot_homepage_hero'),
          homepage_left: t('slot_homepage_left'),
          homepage_right: t('slot_homepage_right'),
          homepage_inline: t('slot_homepage_inline'),
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
  }, []);

  useEffect(() => {
    const loadBanners = async () => {
      try {
        setIsLoading(true);

        if (viewDeletedTab) {
          const response = await bannerAPI.getDeletedBanners(deletedCurrentPage, ITEMS_PER_PAGE);
          setDeletedBanners(Array.isArray(response.banners) ? response.banners : []);
          setDeletedTotalPages(response.pages || 1);
          setDeletedCount(response.total || 0);
        } else {
          const response = await bannerAPI.getBanners(undefined, true, currentPage, ITEMS_PER_PAGE);
          const bannerList = Array.isArray(response.banners) ? response.banners : [];
          setBanners(bannerList);
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
        toast.error(t('error_load_data'));
      } finally {
        setIsLoading(false);
      }
    };

    void loadBanners();
  }, [currentPage, deletedCurrentPage, viewDeletedTab]);

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
  const selectedSlotGuidance = SLOT_GUIDANCE[editingBanner?.slot || ''];

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

  const openCreateDialog = () => {
    const formState = createEmptyForm();
    setEditingBanner(formState);
    setImageFile(null);
    setImagePreview('');
    setBannerConflicts(checkBannerConflicts(formState, banners));
    setConfirmSubmitWithConflict(false);
    setIsDialogOpen(true);
  };

  const openEditDialog = (banner: BannerRecord) => {
    const formState: BannerFormState = {
      _id: banner._id,
      title: getLocalizedText(banner.title),
      subtitle: getLocalizedText(banner.subtitle),
      description: getLocalizedText(banner.description),
      ctaText: getLocalizedText(banner.ctaText),
      targetUrl: banner.targetUrl || '',
      slot: banner.slot || DEFAULT_SLOT,
      sortOrder: String(banner.sortOrder ?? 0),
      isActive: banner.isActive ?? true,
      openInNewTab: banner.openInNewTab ?? false,
      startDate: toDateInputValue(banner.startDate),
      endDate: toDateInputValue(banner.endDate),
    };
    setEditingBanner(formState);
    setImageFile(null);
    setImagePreview(getImageUrl(banner.image) || '');
    setBannerConflicts(checkBannerConflicts(formState, banners, banner._id));
    setConfirmSubmitWithConflict(false);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    if (imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }
    setIsDialogOpen(false);
    setEditingBanner(null);
    setImageFile(null);
    setImagePreview('');
  };

  const handleSlotChange = (newSlot: string) => {
    setEditingBanner((prev) => {
      if (!prev) return null;
      const isHeroSlot = newSlot === 'homepage_hero';
      const updated = {
        ...prev,
        slot: newSlot,
        // Giữ text fields nếu là hero, clear nếu không
        title: isHeroSlot ? prev.title : '',
        subtitle: isHeroSlot ? prev.subtitle : '',
        description: isHeroSlot ? prev.description : '',
        ctaText: isHeroSlot ? prev.ctaText : '',
        targetUrl: isHeroSlot ? prev.targetUrl : '',
      };
      // Update conflicts when slot changes
      setBannerConflicts(checkBannerConflicts(updated, banners, prev._id));
      setConfirmSubmitWithConflict(false);
      return updated;
    });
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleBannerFormChange = (updater: (prev: BannerFormState) => BannerFormState) => {
    setEditingBanner((prev) => {
      if (!prev) return null;
      const updated = updater(prev);
      // Recalculate conflicts whenever form changes
      setBannerConflicts(checkBannerConflicts(updated, banners, updated._id));
      setConfirmSubmitWithConflict(false);
      return updated;
    });
  };

  const handleSubmit = async () => {
    if (!editingBanner) return;

    const title = editingBanner.title.trim();
    const slot = editingBanner.slot.trim();
    const subtitle = editingBanner.subtitle.trim();
    const description = editingBanner.description.trim();
    const ctaText = editingBanner.ctaText.trim();
    const targetUrl = editingBanner.targetUrl.trim();
    const startDate = editingBanner.startDate;
    const endDate = editingBanner.endDate;

    const isHeroSlot = slot === 'homepage_hero';

    // Vị trí bắt buộc
    if (!slot) {
      toast.error(t('error_no_slot'));
      return;
    }

    // Các field bắt buộc chỉ khi homepage_hero
    if (isHeroSlot) {
      if (!title) {
        toast.error(t('error_no_title'));
        return;
      }
      if (!subtitle) {
        toast.error(t('error_no_subtitle'));
        return;
      }
      if (!description) {
        toast.error(t('error_no_description'));
        return;
      }
      if (!ctaText) {
        toast.error(t('error_no_cta'));
        return;
      }
      if (!targetUrl) {
        toast.error(t('error_no_link'));
        return;
      }
    }

    if (!imageFile && !editingBanner._id && !imagePreview) {
      toast.error(t('error_no_image'));
      return;
    }

    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      toast.error(t('error_date_invalid'));
      return;
    }

    // Check for conflicts
    const conflicts = checkBannerConflicts(editingBanner, banners, editingBanner._id);
    if (conflicts.length > 0 && !confirmSubmitWithConflict) {
      setBannerConflicts(conflicts);
      setConfirmSubmitWithConflict(true);
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('subtitle', editingBanner.subtitle);
    formData.append('description', editingBanner.description);
    formData.append('ctaText', editingBanner.ctaText);
    formData.append('targetUrl', editingBanner.targetUrl);
    formData.append('slot', slot);
    formData.append('sortOrder', editingBanner.sortOrder || '0');
    formData.append('isActive', String(editingBanner.isActive));
    formData.append('openInNewTab', String(editingBanner.openInNewTab));
    formData.append('startDate', startDate);
    formData.append('endDate', endDate);

    if (imageFile) {
      formData.append('image', imageFile);
    }

    try {
      setIsSubmitting(true);
      if (editingBanner._id) {
        await bannerAPI.updateBanner(editingBanner._id, formData);
        toast.success(t('success_update'));
      } else {
        await bannerAPI.createBanner(formData);
        toast.success(t('success_create'));
      }
      closeDialog();
      if (viewDeletedTab) {
        const response = await bannerAPI.getDeletedBanners(deletedCurrentPage, ITEMS_PER_PAGE);
        setDeletedBanners(Array.isArray(response.banners) ? response.banners : []);
        setDeletedTotalPages(response.pages || 1);
        setDeletedCount(response.total || 0);
      } else {
        const response = await bannerAPI.getBanners(undefined, true, currentPage, ITEMS_PER_PAGE);
        setBanners(Array.isArray(response.banners) ? response.banners : []);
        setTotalPages(response.pages || 1);
        setTotalCount(response.total || 0);
      }
    } catch (error: any) {
      const errorMessage = error?.message || t('error_load_slots');
      // If backend rejected due to conflict, show it as regular error
      if (error?.status === 409 || errorMessage.includes('Another active banner')) {
        toast.error(`${t('error_conflict').replace('{message}', errorMessage)}`);
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const askConfirm = (banner: BannerRecord, action: ConfirmAction) => {
    setConfirmTarget({ banner, action });
  };

  const confirmAction = async () => {
    if (!confirmTarget) return;

    try {
      setIsSubmitting(true);
      if (confirmTarget.action === 'delete') {
        await bannerAPI.deleteBanner(confirmTarget.banner._id);
        toast.success(t('success_delete'));
        const response = await bannerAPI.getBanners(undefined, true, currentPage, ITEMS_PER_PAGE);
        setBanners(Array.isArray(response.banners) ? response.banners : []);
        setTotalPages(response.pages || 1);
        setTotalCount(response.total || 0);
      } else if (confirmTarget.action === 'restore') {
        await bannerAPI.restoreBanner(confirmTarget.banner._id);
        toast.success(t('success_restore'));
        const response = await bannerAPI.getDeletedBanners(deletedCurrentPage, ITEMS_PER_PAGE);
        setDeletedBanners(Array.isArray(response.banners) ? response.banners : []);
        setDeletedTotalPages(response.pages || 1);
        setDeletedCount(response.total || 0);
      } else {
        await bannerAPI.hardDeleteBanner(confirmTarget.banner._id);
        toast.success(t('success_hard_delete'));
        const response = await bannerAPI.getDeletedBanners(deletedCurrentPage, ITEMS_PER_PAGE);
        setDeletedBanners(Array.isArray(response.banners) ? response.banners : []);
        setDeletedTotalPages(response.pages || 1);
        setDeletedCount(response.total || 0);
      }
      setConfirmTarget(null);
    } catch (error: any) {
      toast.error(error?.message || t('error_load_data'));
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
            {t('banner_management_title', 'admin')}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('banner_customer_title', 'admin')}</h1>
          <p className="max-w-2xl text-sm text-gray-600">
            {t('banner_management_desc', 'admin')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl bg-white px-4 py-3 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{t('banner_total_count', 'admin')}</div>
            <div>{currentTotalCount}</div>
          </div>
          <Button onClick={openCreateDialog} className="bg-red-600 hover:bg-red-700">
            <Plus className="mr-2 h-4 w-4" />
            {t('banner_add_new', 'admin')}
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
            {t('banner_active_tab', 'admin')}
          </button>
          <button
            type="button"
            onClick={() => setViewDeletedTab(true)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${viewDeletedTab ? 'bg-white text-gray-900 shadow' : 'text-gray-500'}`}
          >
            {t('banner_deleted_tab', 'admin')}
          </button>
        </div>

        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('banner_search_placeholder', 'admin')}
            className="h-11 pl-10"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4 text-sm text-gray-600">
          {viewDeletedTab ? t('banner_deleted_list', 'admin') : t('banner_active_list', 'admin')}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">{t('banner_loading', 'admin')}</div>
        ) : filteredBanners.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
              <Megaphone className="h-6 w-6" />
            </div>
            <div className="text-base font-medium text-gray-900">{t('banner_no_results', 'admin')}</div>
            <div className="mt-1 text-sm text-gray-500">
              {searchQuery ? t('banner_no_results_search', 'admin') : t('banner_no_results_empty', 'admin')}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('banner_table_image', 'admin')}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('banner_table_content', 'admin')}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('banner_table_position', 'admin')}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('banner_table_status', 'admin')}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('banner_table_time', 'admin')}</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">{t('banner_table_actions', 'admin')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredBanners.map((banner) => (
                  <tr key={banner._id} className="align-top">
                    <td className="px-6 py-4">
                      <div className="h-16 w-28 overflow-hidden rounded-xl bg-gray-100">
                        <img
                          src={getImageUrl(banner.image)}
                          alt={getLocalizedText(banner.title)}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-gray-900">{getLocalizedText(banner.title)}</div>
                        {getLocalizedText(banner.subtitle) && <div className="text-sm text-gray-600">{getLocalizedText(banner.subtitle)}</div>}
                        {getLocalizedText(banner.description) && <div className="line-clamp-2 text-xs text-gray-500">{getLocalizedText(banner.description)}</div>}
                        {getLocalizedText(banner.ctaText) && <div className="text-xs font-medium text-red-600">{t('banner_ctaPrefix', 'admin')}{getLocalizedText(banner.ctaText)}</div>}
                        {banner.targetUrl && <div className="text-xs text-gray-500">{t('banner_linkPrefix', 'admin')}{banner.targetUrl}</div>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-gray-900">{getSlotLabel(banner.slot, slotOptions)}</div>
                        <div className="text-xs text-gray-500">{t('banner_form_sort_order', 'admin')}: {banner.sortOrder ?? 0}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{renderStatusBadge(banner)}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="space-y-1">
                        <div>{t('banner_date_start', 'admin')}{formatDate(banner.startDate)}</div>
                        <div>{t('banner_date_end', 'admin')}{formatDate(banner.endDate)}</div>
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
                            {t('action_restore')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => askConfirm(banner, 'hardDelete')}
                            className="border-red-200 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('action_hard_delete')}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => openEditDialog(banner)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {t('action_edit')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => askConfirm(banner, 'delete')}
                            className="border-red-200 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('action_delete')}
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

      <Dialog open={isDialogOpen} onOpenChange={(open: boolean) => (!open ? closeDialog() : setIsDialogOpen(true))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editingBanner?._id ? t('banner_edit_title', 'admin') : t('banner_add_title', 'admin')}</DialogTitle>
            <DialogDescription>
              {t('banner_form_desc', 'admin')}
            </DialogDescription>
          </DialogHeader>

          {editingBanner && (
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                {/* Vị trí - ĐẦU TIÊN, tách riêng */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="space-y-2">
                    <Label>{t('banner_form_position_required', 'admin')}</Label>
                    <Select
                      value={editingBanner.slot}
                      onValueChange={handleSlotChange}
                    >
                      <SelectTrigger className="text-base">
                        {editingBanner.slot ? (
                          <span>{formatSlotName(editingBanner.slot)}</span>
                        ) : (
                          <span className="text-muted-foreground">{t('banner_form_position_placeholder', 'admin')}</span>
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {slotOptions.map((slot) => (
                          <SelectItem key={slot.value} value={slot.value}>
                            {slot.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                      <div className="font-medium">{t('banner_form_quick_tips', 'admin')}</div>
                      <div>{selectedSlotGuidance ? selectedSlotGuidance.size : t('banner_form_size_recommendation', 'admin')}</div>
                      <div>{selectedSlotGuidance ? selectedSlotGuidance.note : t('banner_form_note', 'admin')}</div>
                    </div>

                    {/* Conflict warning */}
                    {bannerConflicts.length > 0 && (
                      <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 border border-amber-200">
                        <div className="font-medium text-amber-900 mb-2">{t('banner_form_conflict_warning', 'admin')}</div>
                        <div className="text-amber-800 space-y-1">
                          <p>{t('banner_form_conflict_desc', 'admin').replace('{position}', getSlotLabel(editingBanner.slot, slotOptions)).replace('{count}', String(bannerConflicts.length))}</p>
                          <ul className="list-disc pl-4 space-y-1">
                            {bannerConflicts.map((conflict, idx) => (
                              <li key={idx} className="text-amber-700">
                                <strong>{getLocalizedText(conflict.existingBanner.title)}</strong>
                                {' '}({formatDate(conflict.existingBanner.startDate)} - {formatDate(conflict.existingBanner.endDate)})
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-amber-700">{t('banner_form_conflict_list', 'admin')}</p>
                        </div>
                      </div>
                    )}
                    {confirmSubmitWithConflict && bannerConflicts.length > 0 && (
                      <div className="rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 border border-red-200">
                        <div className="font-medium text-red-900">{t('banner_form_confirm_conflict', 'admin')}</div>
                      </div>
                    )}

                    {/* CTA + Link - ĐẶT SAT NGAY DỚI VỊ TRÍ, chỉ hiện nếu hero */}
                    {selectedSlotGuidance?.hasCTA && (
                      <>
                        <div className="border-t border-gray-200 pt-4 mt-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="banner-cta">{t('banner_form_cta_button', 'admin')}</Label>
                              <Input
                                id="banner-cta"
                                value={editingBanner.ctaText}
                                onChange={(event) => setEditingBanner({ ...editingBanner, ctaText: event.target.value })}
                                placeholder={t('banner_form_cta_placeholder', 'admin')}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="banner-link">{t('banner_form_link', 'admin')}</Label>
                              <Input
                                id="banner-link"
                                value={editingBanner.targetUrl}
                                onChange={(event) => setEditingBanner({ ...editingBanner, targetUrl: event.target.value })}
                                placeholder={t('banner_linkExample', 'admin')}
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Tiêu đề - bắt buộc nếu hero, optional cho banner khác */}
                <div className="space-y-2">
                  <Label htmlFor="banner-title">
                    {t('banner_form_title', 'admin')}
                    {selectedSlotGuidance?.hasCTA && <span className="text-red-600">*</span>}
                  </Label>
                  <Input
                    id="banner-title"
                    value={editingBanner.title}
                    onChange={(event) => setEditingBanner({ ...editingBanner, title: event.target.value })}
                    placeholder={selectedSlotGuidance?.hasCTA ? t('banner_form_title_placeholder', 'admin') : t('banner_form_title_optional', 'admin')}
                  />
                  {!selectedSlotGuidance?.hasCTA && (
                    <p className="text-xs text-gray-500">{t('banner_form_static_note', 'admin')}</p>
                  )}
                </div>

                {/* Phụ đề - chỉ hero */}
                {selectedSlotGuidance?.hasCTA && (
                  <div className="space-y-2">
                    <Label htmlFor="banner-subtitle">{t('banner_form_subtitle', 'admin')}</Label>
                    <Input
                      id="banner-subtitle"
                      value={editingBanner.subtitle}
                      onChange={(event) => setEditingBanner({ ...editingBanner, subtitle: event.target.value })}
                      placeholder={t('banner_form_subtitle_placeholder', 'admin')}
                    />
                  </div>
                )}

                {/* Mô tả - chỉ hero */}
                {selectedSlotGuidance?.hasCTA && (
                  <div className="space-y-2">
                    <Label htmlFor="banner-description">{t('banner_form_description', 'admin')}</Label>
                    <Textarea
                      id="banner-description"
                      value={editingBanner.description}
                      onChange={(event) => setEditingBanner({ ...editingBanner, description: event.target.value })}
                      placeholder={t('banner_form_description_placeholder', 'admin')}
                      rows={4}
                    />
                  </div>
                )}

                {/* Link - hiển thị nếu non-hero */}
                {!selectedSlotGuidance?.hasCTA && (
                  <div className="space-y-2">
                    <Label htmlFor="banner-link-non-hero">{t('banner_form_link_optional', 'admin')}</Label>
                    <Input
                      id="banner-link-non-hero"
                      value={editingBanner.targetUrl}
                      onChange={(event) => setEditingBanner({ ...editingBanner, targetUrl: event.target.value })}
                      placeholder={t('banner_linkExample', 'admin')}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="banner-sort-order">{t('banner_form_sort_order', 'admin')}</Label>
                  <Input
                    id="banner-sort-order"
                    type="number"
                    value={editingBanner.sortOrder}
                    onChange={(event) => setEditingBanner({ ...editingBanner, sortOrder: event.target.value })}
                    placeholder={t('banner_sortOrderPlaceholder', 'admin')}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="banner-start-date">{t('banner_form_start_date', 'admin')}</Label>
                    <Input
                      id="banner-start-date"
                      type="date"
                      value={editingBanner.startDate}
                      onChange={(event) => handleBannerFormChange((prev) => ({ ...prev, startDate: event.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="banner-end-date">{t('banner_form_end_date', 'admin')}</Label>
                    <Input
                      id="banner-end-date"
                      type="date"
                      value={editingBanner.endDate}
                      onChange={(event) => handleBannerFormChange((prev) => ({ ...prev, endDate: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 rounded-xl bg-white p-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={editingBanner.isActive}
                      onChange={(event) => handleBannerFormChange((prev) => ({ ...prev, isActive: event.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    {t('banner_form_enable', 'admin')}
                  </label>

                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={editingBanner.openInNewTab}
                      onChange={(event) => setEditingBanner({ ...editingBanner, openInNewTab: event.target.checked })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    {t('banner_form_open_new_tab', 'admin')}
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('banner_form_image_label', 'admin')}</Label>
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white p-6 text-center hover:border-red-300 hover:bg-red-50/40">
                    <Upload className="mb-3 h-6 w-6 text-gray-500" />
                    <span className="text-sm font-medium text-gray-900">{t('banner_form_image_upload', 'admin')}</span>
                    <span className="mt-1 text-xs text-gray-500">{t('banner_form_image_formats', 'admin')}</span>
                    <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </label>
                </div>

                {imagePreview && (
                  <div className="space-y-2">
                    <Label>{t('form_image_preview')}</Label>
                    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
                      <img
                        src={imagePreview}
                        alt={editingBanner.title || t('banner_preview_alt')}
                        className="h-56 w-full object-cover"
                      />
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                  <div className="font-medium text-gray-900">{t('form_image_tips')}</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>{t('form_image_tip_1')}</li>
                    <li>{t('form_image_tip_2')}</li>
                    <li>{t('form_image_tip_3')}</li>
                    <li>{t('form_image_tip_4')}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog} disabled={isSubmitting}>
              {t('form_cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (confirmSubmitWithConflict && bannerConflicts.length > 0) {
                  // User has confirmed, proceed with submission
                  setConfirmSubmitWithConflict(false);
                  handleSubmit();
                } else {
                  handleSubmit();
                }
              }}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? t('dialog_confirm_save') : confirmSubmitWithConflict && bannerConflicts.length > 0 ? t('dialog_confirm_save') : editingBanner?._id ? t('form_update') : t('form_create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirmTarget)} onOpenChange={(open: boolean) => !open && setConfirmTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmTarget?.action === 'delete'
                ? t('dialog_confirm_delete')
                : confirmTarget?.action === 'restore'
                  ? t('dialog_confirm_restore')
                  : t('dialog_confirm_hard_delete')}
            </DialogTitle>
            <DialogDescription>
              {confirmTarget?.action === 'delete'
                ? t('delete_desc')
                : confirmTarget?.action === 'restore'
                  ? t('restore_desc')
                  : t('hard_delete_desc')}
            </DialogDescription>
          </DialogHeader>

          {confirmTarget && (
            <div className="rounded-xl bg-white p-4 text-sm text-gray-700">
              <div className="font-medium text-gray-900">{getLocalizedText(confirmTarget.banner.title)}</div>
              <div className="mt-1 text-gray-500">{getSlotLabel(confirmTarget.banner.slot, slotOptions)}</div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmTarget(null)} disabled={isSubmitting}>
              {t('form_cancel')}
            </Button>
            <Button
              type="button"
              onClick={confirmAction}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? t('dialog_confirm_save') : t('action_confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
