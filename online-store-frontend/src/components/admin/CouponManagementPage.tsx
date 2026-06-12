import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Search,
  ChevronDown,
  TicketPercent,
  BadgePercent,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '../../lib/i18n';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';
import { Pagination } from './Pagination';
import { categoryAPI, couponAPI, productAPI } from '../../lib/api';
import { formatCurrency, formatDate } from '../../lib/utils';

const ITEMS_PER_PAGE = 10;

type CouponMode = 'all' | 'percentage';

type CouponRecord = {
  _id: string;
  code: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxUses?: number;
  currentUses?: number;
  minOrderAmount?: number;
  applicableProducts?: any[];
  applicableCategories?: any[];
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type CouponFormState = {
  _id?: string;
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: string;
  maxUses: string;
  minOrderAmount: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  applicableProducts: string[];
  applicableCategories: string[];
};

interface CouponManagementPageProps {
  title: string;
  description: string;
  mode?: CouponMode;
}

const toDateInputValue = (value?: string | Date) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};


const getCouponCount = (items?: any[]) => (Array.isArray(items) ? items.length : 0);

type MultiSelectOption = {
  id: string;
  label: string;
};

interface MultiSelectDropdownProps {
  title: string;
  description: string;
  placeholder: string;
  emptyText: string;
  selectedIds: string[];
  countLabel: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: MultiSelectOption[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  isDisabled?: boolean;
  disabledHint?: string;
}

function MultiSelectDropdown({
  title,
  description,
  placeholder,
  emptyText,
  selectedIds,
  countLabel,
  searchValue,
  onSearchChange,
  open,
  onOpenChange,
  items,
  onToggle,
  onSelectAll,
  onClearAll,
  isDisabled = false,
  disabledHint,
}: MultiSelectDropdownProps) {
  const { t } = useTranslation();
  const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={isDisabled}
          className="flex h-auto w-full items-center justify-between rounded-xl border-gray-200 bg-white px-4 py-3 text-left hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900">{title}</div>
            <div className="truncate text-xs text-gray-500">{isDisabled && disabledHint ? disabledHint : description}</div>
          </div>
          <div className="ml-4 flex items-center gap-2">
            {selectedIds.length > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                {selectedIds.length} {countLabel}
              </span>
            )}
            <ChevronDown className="size-4 text-gray-400" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] overflow-hidden rounded-2xl border border-slate-300 bg-white p-0 shadow-2xl ring-1 ring-black/5">
        <div className="border-b border-slate-200 bg-slate-50/80 p-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-950">{title}</div>
              <div className="text-xs text-slate-600">{description}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSelectAll}
                disabled={items.length === 0 || allSelected}
                className="h-8 rounded-full border-slate-300 px-3 text-xs"
              >
                {t('coupon_selectAll', 'admin')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClearAll}
                disabled={selectedIds.length === 0}
                className="h-8 rounded-full border-slate-300 px-3 text-xs"
              >
                {t('coupon_clearAll', 'admin')}
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={placeholder}
              className="border-slate-300 bg-white pl-9 text-slate-950 placeholder:text-slate-400"
            />
          </div>
        </div>
        <ScrollArea className="h-64 bg-white">
          <div className="space-y-1 p-2">
            {items.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-slate-600">{emptyText}</div>
            ) : (
              items.map((item) => {
                const checked = selectedIds.includes(item.id);

                return (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-100"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => onToggle(item.id)} />
                    <span className="min-w-0 flex-1 text-sm text-slate-950">{item.label}</span>
                  </label>
                );
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function CouponManagementPage({ title, description, mode = 'all' }: CouponManagementPageProps) {
  const { t } = useTranslation();
  const isPercentageOnly = mode === 'percentage';

  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [deletedCoupons, setDeletedCoupons] = useState<CouponRecord[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [deletedCurrentPage, setDeletedCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deletedTotalPages, setDeletedTotalPages] = useState(1);
  const [totalCouponsCount, setTotalCouponsCount] = useState(0);
  const [deletedCouponsCount, setDeletedCouponsCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewDeletedTab, setViewDeletedTab] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<CouponFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ coupon: CouponRecord; action: 'delete' | 'hardDelete' } | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);

  useEffect(() => {
    if (editingCoupon?.applicableCategories.length === 0) {
      setProductDropdownOpen(false);
    }
  }, [editingCoupon?.applicableCategories.length]);

  const activeBadgeCount = useMemo(() => totalCouponsCount, [totalCouponsCount]);
  const deletedBadgeCount = useMemo(() => deletedCouponsCount, [deletedCouponsCount]);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const [productResponse, categoryResponse] = await Promise.all([
          productAPI.getProducts(1, '', '', '', 1000),
          categoryAPI.getCategories(),
        ]);

        setProducts(Array.isArray(productResponse.products) ? productResponse.products : []);
        const categoryList = categoryResponse.categories || categoryResponse;
        setCategories(Array.isArray(categoryList) ? categoryList : []);
      } catch (error) {
        setProducts([]);
        setCategories([]);
      }
    };

    loadCatalog();
  }, []);

  const loadCoupons = async (targetViewDeletedTab = viewDeletedTab, targetPage = targetViewDeletedTab ? deletedCurrentPage : currentPage) => {
    try {
      setIsLoading(true);
      const discountType = isPercentageOnly ? 'percentage' : undefined;
      const response = targetViewDeletedTab
        ? await couponAPI.getDeletedCoupons(targetPage, searchQuery, ITEMS_PER_PAGE, discountType)
        : await couponAPI.getCoupons(targetPage, searchQuery, ITEMS_PER_PAGE, discountType);

      const list = response.coupons || [];
      if (targetViewDeletedTab) {
        setDeletedCoupons(Array.isArray(list) ? list : []);
        setDeletedTotalPages(response.pages || 1);
        setDeletedCouponsCount(response.total || 0);
      } else {
        setCoupons(Array.isArray(list) ? list : []);
        setTotalPages(response.pages || 1);
        setTotalCouponsCount(response.total || 0);
      }
    } catch (error) {
      if (targetViewDeletedTab) {
        setDeletedCoupons([]);
        setDeletedTotalPages(1);
        setDeletedCouponsCount(0);
      } else {
        setCoupons([]);
        setTotalPages(1);
        setTotalCouponsCount(0);
      }
      toast.error(t('error_load_data'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCoupons();
  }, [currentPage, deletedCurrentPage, isPercentageOnly, searchQuery, viewDeletedTab]);

  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((product) => {
      const name = String(product.name || '').toLowerCase();
      const brand = String(product.brand || '').toLowerCase();
      return name.includes(keyword) || brand.includes(keyword);
    });
  }, [productSearch, products]);

  const filteredCategories = useMemo(() => {
    const keyword = categorySearch.trim().toLowerCase();
    if (!keyword) return categories;
    return categories.filter((category) => {
      const name = String(category.name || '').toLowerCase();
      return name.includes(keyword);
    });
  }, [categorySearch, categories]);

  const activeList = viewDeletedTab ? deletedCoupons : coupons;
  const currentList = activeList;
  const currentPageNumber = viewDeletedTab ? deletedCurrentPage : currentPage;
  const currentTotalPages = viewDeletedTab ? deletedTotalPages : totalPages;

  const resetFormState = () => {
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    setEditingCoupon({
      code: '',
      description: '',
      discountType: isPercentageOnly ? 'percentage' : 'percentage',
      discountValue: '',
      maxUses: '100',
      minOrderAmount: '0',
      startDate: toDateInputValue(today),
      endDate: toDateInputValue(endDate),
      isActive: true,
      applicableProducts: [],
      applicableCategories: [],
    });

    setProductSearch('');
    setCategorySearch('');
  };

  const handleCreate = () => {
    resetFormState();
    setIsDialogOpen(true);
  };

  const extractIdArray = (items: any[]) =>
    items
      .map((item) => (typeof item === 'string' ? item : item?._id || item?.id))
      .filter(Boolean)
      .map(String);

  const handleEdit = (coupon: CouponRecord) => {
    setEditingCoupon({
      _id: coupon._id,
      code: coupon.code || '',
      description: coupon.description || '',
      discountType: coupon.discountType || 'percentage',
      discountValue: coupon.discountValue !== undefined ? String(coupon.discountValue) : '',
      maxUses: coupon.maxUses !== undefined ? String(coupon.maxUses) : '100',
      minOrderAmount: coupon.minOrderAmount !== undefined ? String(coupon.minOrderAmount) : '0',
      startDate: toDateInputValue(coupon.startDate),
      endDate: toDateInputValue(coupon.endDate),
      isActive: coupon.isActive ?? true,
      applicableProducts: extractIdArray(coupon.applicableProducts || []),
      applicableCategories: extractIdArray(coupon.applicableCategories || []),
    });
    setProductSearch('');
    setCategorySearch('');
    setIsDialogOpen(true);
  };

  const toggleArrayValue = (field: 'applicableProducts' | 'applicableCategories', value: string) => {
    if (!editingCoupon) return;

    setEditingCoupon((current) => {
      if (!current) return current;
      const list = current[field];
      const nextList = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

      if (field === 'applicableCategories' && nextList.length === 0) {
        return {
          ...current,
          applicableCategories: nextList,
          applicableProducts: [],
        };
      }

      return { ...current, [field]: nextList };
    });
  };

  const addAllArrayValues = (field: 'applicableProducts' | 'applicableCategories', values: string[]) => {
    if (!editingCoupon) return;

    setEditingCoupon((current) => {
      if (!current) return current;
      const nextList = Array.from(new Set([...current[field], ...values]));
      return { ...current, [field]: nextList };
    });
  };

  const clearArrayValues = (field: 'applicableProducts' | 'applicableCategories') => {
    if (!editingCoupon) return;

    setEditingCoupon((current) => {
      if (!current) return current;
      if (field === 'applicableCategories') {
        return {
          ...current,
          applicableCategories: [],
          applicableProducts: [],
        };
      }
      return { ...current, [field]: [] };
    });
  };

  const handleSave = async () => {
    if (!editingCoupon) return;

    try {
      if (!editingCoupon.code.trim()) {
        toast.error(t('error_fill_required'));
        return;
      }

      const discountType = isPercentageOnly ? 'percentage' : editingCoupon.discountType;
      const discountValue = Number(editingCoupon.discountValue);
      const maxUses = Number(editingCoupon.maxUses);
      const minOrderAmount = Number(editingCoupon.minOrderAmount);
      const startDate = new Date(editingCoupon.startDate);
      const endDate = new Date(editingCoupon.endDate);

      if (
        !Number.isFinite(discountValue) ||
        !Number.isFinite(maxUses) ||
        !Number.isFinite(minOrderAmount) ||
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime())
      ) {
        toast.error(t('error_fill_required'));
        return;
      }

      if (discountValue <= 0) {
        toast.error(t('admin_coupon_discount_positive'));
        return;
      }

      if (discountType === 'percentage' && discountValue > 100) {
        toast.error(t('admin_coupon_discount_percent_limit'));
        return;
      }

      if (maxUses < 1) {
        toast.error(t('admin_coupon_max_uses_invalid'));
        return;
      }

      if (minOrderAmount < 0) {
        toast.error(t('admin_coupon_min_order_invalid'));
        return;
      }

      if (startDate >= endDate) {
        toast.error(t('admin_coupon_date_invalid'));
        return;
      }

      setIsSubmitting(true);

      const payload = {
        code: editingCoupon.code.trim(),
        description: editingCoupon.description.trim(),
        discountType,
        discountValue,
        maxUses,
        minOrderAmount,
        startDate: editingCoupon.startDate,
        endDate: editingCoupon.endDate,
        isActive: editingCoupon.isActive,
        applicableProducts: editingCoupon.applicableProducts,
        applicableCategories: editingCoupon.applicableCategories,
      };

      if (editingCoupon._id) {
        await couponAPI.updateCoupon(editingCoupon._id, payload);
        toast.success(t('admin_coupon_update_success'));
      } else {
        await couponAPI.createCoupon(payload as any);
        toast.success(t('admin_coupon_create_success'));
      }

      setIsDialogOpen(false);
      setEditingCoupon(null);

      await loadCoupons();
    } catch (error: any) {
      toast.error(error?.message || t('error_save_data'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (coupon: CouponRecord) => {
    try {
      setIsSubmitting(true);
      await couponAPI.deleteCoupon(coupon._id);
      toast.success(t('admin_coupon_delete_success'));
      setDeleteTarget(null);
      await loadCoupons(false, currentPage);
    } catch (error: any) {
      toast.error(error?.message || t('error_delete_data'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestore = async (coupon: CouponRecord) => {
    try {
      setIsSubmitting(true);
      await couponAPI.restoreCoupon(coupon._id);
      toast.success(t('admin_coupon_restore_success'));
      await loadCoupons(true, deletedCurrentPage);
    } catch (error: any) {
      toast.error(error?.message || t('error_save_data'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHardDelete = async (coupon: CouponRecord) => {
    try {
      setIsSubmitting(true);
      await couponAPI.hardDeleteCoupon(coupon._id);
      toast.success(t('admin_coupon_hard_delete_success'));
      setDeleteTarget(null);
      await loadCoupons(true, deletedCurrentPage);
    } catch (error: any) {
      toast.error(error?.message || t('error_delete_data'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCouponValue = (coupon: CouponRecord) => {
    if (coupon.discountType === 'percentage') {
      return `${coupon.discountValue}%`;
    }

    return formatCurrency(coupon.discountValue);
  };

  const getScopeLabel = (items?: any[]) => {
    const count = getCouponCount(items);
    if (!count) return t('coupon_allProducts', 'admin');
    return t('coupon_productsTemplate', 'admin').replace('{count}', String(count));
  };

  const setCurrentPageHandler = (page: number) => {
    if (viewDeletedTab) {
      setDeletedCurrentPage(page);
    } else {
      setCurrentPage(page);
    }
  };

  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
    setDeletedCurrentPage(1);
  };

  const handleTabChange = (nextViewDeletedTab: boolean) => {
    setViewDeletedTab(nextViewDeletedTab);
    if (nextViewDeletedTab) {
      setDeletedCurrentPage(1);
    } else {
      setCurrentPage(1);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm">
              {isPercentageOnly ? <BadgePercent className="h-5 w-5" /> : <TicketPercent className="h-5 w-5" />}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
              <p className="mt-1 text-sm text-gray-600">{description}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-gray-600">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {t('admin_active_coupons')}: {activeBadgeCount}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              {t('admin_deleted_coupons')}: {deletedBadgeCount}
            </Badge>
            {isPercentageOnly && (
              <Badge className="rounded-full bg-amber-100 text-amber-700 hover:bg-amber-100">
                {t('coupon_percentageOnly', 'admin')}
              </Badge>
            )}
          </div>
        </div>

        <Button onClick={handleCreate} className="bg-red-600 hover:bg-red-700">
          <Plus className="mr-2 h-4 w-4" />
          {t('admin_add_coupon')}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">{t('admin_total_coupons')}</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{activeBadgeCount + deletedBadgeCount}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">{t('admin_active_coupons')}</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{activeBadgeCount}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">{t('admin_deleted_coupons')}</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{deletedBadgeCount}</div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t('admin_search_coupon_placeholder')}
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={!viewDeletedTab ? 'default' : 'outline'}
              onClick={() => handleTabChange(false)}
              className={!viewDeletedTab ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {t('admin_active_coupons')}
            </Button>
            <Button
              variant={viewDeletedTab ? 'default' : 'outline'}
              onClick={() => handleTabChange(true)}
              className={viewDeletedTab ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {t('admin_deleted_coupons')}
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-gray-500">{t('loading')}</div>
          ) : currentList.length === 0 ? (
            <div className="p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <AlertCircle className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm text-gray-600">{t('admin_no_coupons')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-white">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_coupon_code')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_coupon_type')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_coupon_value')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_coupon_uses')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_coupon_range')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_coupon_scope')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_coupon_status')}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {currentList.map((coupon) => {
                    const isActive = coupon.isActive !== false;
                    return (
                      <tr key={coupon._id} className="hover:bg-white/60">
                        <td className="px-4 py-4">
                          <div className="font-mono text-sm font-semibold text-gray-900">{coupon.code}</div>
                          <div className="mt-1 max-w-xs truncate text-xs text-gray-500">{coupon.description || t('empty_value', 'admin')}</div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant="secondary" className="rounded-full">
                            {coupon.discountType === 'percentage' ? t('admin_discount_percentage') : t('admin_discount_fixed')}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-sm font-medium text-gray-900">{formatCouponValue(coupon)}</td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          {coupon.currentUses || 0}/{coupon.maxUses || 0}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          <div>{coupon.startDate ? formatDate(new Date(coupon.startDate)) : t('empty_value', 'admin')}</div>
                          <div className="text-xs text-gray-500">{coupon.endDate ? formatDate(new Date(coupon.endDate)) : t('empty_value', 'admin')}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          <div>{getScopeLabel(coupon.applicableProducts)}</div>
                          <div className="text-xs text-gray-500">{getScopeLabel(coupon.applicableCategories)}</div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-100'}>
                            {isActive ? (
                              <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{t('active')}</span>
                            ) : (
                              t('coupon_statusInactive', 'admin')
                            )}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            {!viewDeletedTab ? (
                              <>
                                <Button variant="outline" size="sm" onClick={() => handleEdit(coupon)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => setDeleteTarget({ coupon, action: 'delete' })}
                                  title={t('admin_hard_delete')}
                                  className="border border-red-200 bg-white text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/40"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button variant="outline" size="sm" onClick={() => handleRestore(coupon)}>
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => setDeleteTarget({ coupon, action: 'hardDelete' })}
                                  title={t('admin_hard_delete')}
                                  className="border border-red-200 bg-white text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/40"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            currentPage={currentPageNumber}
            totalPages={currentTotalPages}
            onPageChange={setCurrentPageHandler}
          />
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{editingCoupon?._id ? t('admin_edit_coupon') : t('admin_add_coupon')}</DialogTitle>
            <DialogDescription>{isPercentageOnly ? t('admin_percentage_only_desc') : t('admin_coupon_form_desc')}</DialogDescription>
          </DialogHeader>

          {editingCoupon && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="coupon-code">{t('admin_coupon_code')}</Label>
                  <Input
                    id="coupon-code"
                    value={editingCoupon.code}
                    onChange={(event) => setEditingCoupon({ ...editingCoupon, code: event.target.value })}
                    placeholder={t('coupon_codeExample', 'admin')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coupon-description">{t('admin_coupon_description')}</Label>
                  <Textarea
                    id="coupon-description"
                    value={editingCoupon.description}
                    onChange={(event) => setEditingCoupon({ ...editingCoupon, description: event.target.value })}
                    placeholder={t('admin_coupon_description_placeholder')}
                    rows={4}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('admin_discount_type')}</Label>
                    {isPercentageOnly ? (
                      <div className="rounded-md border bg-white px-3 py-2 text-sm text-gray-600">
                        {t('admin_discount_percentage')}
                      </div>
                    ) : (
                      <Select
                        value={editingCoupon.discountType}
                        onValueChange={(value) => setEditingCoupon({ ...editingCoupon, discountType: value as 'percentage' | 'fixed' })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('admin_discount_type')} /> 
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">{t('admin_discount_percentage')}</SelectItem>
                          <SelectItem value="fixed">{t('admin_discount_fixed')}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="coupon-value">{t('admin_discount_value')}</Label>
                    <Input
                      id="coupon-value"
                      type="number"
                      min="0"
                      step={editingCoupon.discountType === 'percentage' || isPercentageOnly ? '1' : '1000'}
                      value={editingCoupon.discountValue}
                      onChange={(event) => setEditingCoupon({ ...editingCoupon, discountValue: event.target.value })}
                      placeholder={editingCoupon.discountType === 'percentage' || isPercentageOnly ? t('coupon_percentage_placeholder', 'admin') : t('coupon_fixed_placeholder', 'admin')}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="coupon-max-uses">{t('admin_max_uses')}</Label>
                    <Input
                      id="coupon-max-uses"
                      type="number"
                      min="1"
                      value={editingCoupon.maxUses}
                      onChange={(event) => setEditingCoupon({ ...editingCoupon, maxUses: event.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="coupon-min-order">{t('admin_min_order_amount')}</Label>
                    <Input
                      id="coupon-min-order"
                      type="number"
                      min="0"
                      value={editingCoupon.minOrderAmount}
                      onChange={(event) => setEditingCoupon({ ...editingCoupon, minOrderAmount: event.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="coupon-start-date">{t('admin_start_date')}</Label>
                    <Input
                      id="coupon-start-date"
                      type="date"
                      value={editingCoupon.startDate}
                      onChange={(event) => setEditingCoupon({ ...editingCoupon, startDate: event.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="coupon-end-date">{t('admin_end_date')}</Label>
                    <Input
                      id="coupon-end-date"
                      type="date"
                      value={editingCoupon.endDate}
                      onChange={(event) => setEditingCoupon({ ...editingCoupon, endDate: event.target.value })}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border bg-white px-4 py-3">
                  <Checkbox
                    id="coupon-active"
                    checked={editingCoupon.isActive}
                    onCheckedChange={(checked) => setEditingCoupon({ ...editingCoupon, isActive: checked === true })}
                  />
                  <Label htmlFor="coupon-active" className="cursor-pointer">
                    {t('admin_is_active')}
                  </Label>
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-2xl border bg-white p-4">
                  <MultiSelectDropdown
                    title={t('admin_applicable_categories')}
                    description={t('admin_scope_help')}
                    placeholder={t('admin_search_categories_placeholder')}
                    emptyText={t('admin_no_categories')}
                    selectedIds={editingCoupon.applicableCategories}
                    countLabel={t('coupon_categoriesLabel', 'admin')}
                    searchValue={categorySearch}
                    onSearchChange={setCategorySearch}
                    open={categoryDropdownOpen}
                    onOpenChange={(nextOpen) => {
                      setCategoryDropdownOpen(nextOpen);
                      if (!nextOpen) setCategorySearch('');
                    }}
                    items={filteredCategories.map((category) => ({
                      id: String(category._id),
                      label: String(category.name || ''),
                    }))}
                    onToggle={(id) => toggleArrayValue('applicableCategories', id)}
                    onSelectAll={() => addAllArrayValues('applicableCategories', filteredCategories.map((category) => String(category._id)))}
                    onClearAll={() => clearArrayValues('applicableCategories')}
                  />
                </div>

                <div className="rounded-2xl border bg-white p-4">
                  <MultiSelectDropdown
                    title={t('admin_applicable_products')}
                    description={t('admin_scope_help')}
                    placeholder={t('admin_search_products_placeholder')}
                    emptyText={t('admin_no_products')}
                    selectedIds={editingCoupon.applicableProducts}
                    countLabel={t('coupon_productsLabel', 'admin')}
                    searchValue={productSearch}
                    onSearchChange={setProductSearch}
                    open={productDropdownOpen}
                    onOpenChange={(nextOpen) => {
                      if (editingCoupon.applicableCategories.length === 0) return;
                      setProductDropdownOpen(nextOpen);
                      if (!nextOpen) setProductSearch('');
                    }}
                    items={filteredProducts.map((product) => ({
                      id: String(product._id),
                      label: String(product.name || ''),
                    }))}
                    onToggle={(id) => toggleArrayValue('applicableProducts', id)}
                    onSelectAll={() => addAllArrayValues('applicableProducts', filteredProducts.map((product) => String(product._id)))}
                    onClearAll={() => clearArrayValues('applicableProducts')}
                    isDisabled={editingCoupon.applicableCategories.length === 0}
                    disabledHint={t('coupon_unlockProductsHint', 'admin')}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? t('admin_loading') : t('admin_save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.action === 'hardDelete'
                ? t('admin_coupon_hard_delete_title')
                : t('admin_coupon_delete_title')}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.action === 'hardDelete'
                ? t('admin_coupon_hard_delete_desc')
                : t('admin_coupon_delete_desc')}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border bg-amber-50 p-4 text-sm text-amber-800">
            <div className="font-semibold text-amber-900">{deleteTarget?.coupon.code}</div>
            <div className="mt-1">
              {deleteTarget?.coupon.discountType === 'percentage'
                ? `${deleteTarget?.coupon.discountValue}%`
                : formatCurrency(deleteTarget?.coupon.discountValue || 0)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              className="border border-rose-800 bg-rose-700 text-white shadow-sm hover:bg-rose-800 focus-visible:ring-rose-500 dark:border-rose-700 dark:bg-rose-600 dark:hover:bg-rose-700"
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.action === 'hardDelete') {
                  void handleHardDelete(deleteTarget.coupon);
                } else {
                  void handleDelete(deleteTarget.coupon);
                }
              }}
              disabled={isSubmitting}
            >
              {deleteTarget?.action === 'hardDelete' ? t('hard_delete', 'admin') : t('delete', 'admin')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CouponManagementPage;
