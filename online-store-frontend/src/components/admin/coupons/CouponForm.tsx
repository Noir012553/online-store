import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation, useLanguage } from '../../../lib/i18n';
import { useCurrencyContext } from '../../../lib/context/CurrencyContext';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Checkbox } from '../../ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { ScrollArea } from '../../ui/scroll-area';
import { categoryAPI, couponAPI, productAPI } from '../../../lib/api';
import { getCategoryName } from '../../../lib/data';
import { toDateInputValue, CouponFormState, MultiSelectOption } from './couponUtils';

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
      <PopoverContent align="start" className="w-[calc(100vw-2rem)] max-w-[420px] overflow-hidden rounded-2xl border border-slate-300 bg-white p-0 shadow-2xl ring-1 ring-black/5">
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

interface CouponFormProps {
  mode: 'create' | 'edit';
  couponId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function CouponForm({ mode, couponId, onSuccess, onCancel }: CouponFormProps) {
  const { t } = useTranslation();
  const { locale } = useLanguage();
  const { currencyCode } = useCurrencyContext();
  
  const [isLoading, setIsLoading] = useState(mode === 'edit' ? true : false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<CouponFormState | null>(null);
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
  }, [editingCoupon?.applicableCategories.length, locale]);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const [productResponse, categoryResponse] = await Promise.all([
          productAPI.getProducts(1, '', '', '', 1000, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, locale),
          categoryAPI.getCategories(locale),
        ]);

        setProducts(Array.isArray(productResponse.products) ? productResponse.products : []);
        const categoryList = categoryResponse.categories || categoryResponse;
        setCategories(Array.isArray(categoryList) ? categoryList : []);
      } catch (error) {
        setProducts([]);
        setCategories([]);
      }
    };

    void loadCatalog();
  }, [locale]);

  useEffect(() => {
    const loadCoupon = async () => {
      if (mode === 'edit' && couponId) {
        try {
          setIsLoading(true);
          const coupon = await couponAPI.getCouponById(couponId);
          
          const extractIdArray = (items: any[]) =>
            items
              .map((item) => (typeof item === 'string' ? item : item?._id || item?.id))
              .filter(Boolean)
              .map(String);

          setEditingCoupon({
            _id: coupon._id,
            code: coupon.code || '',
            description: coupon.description || '',
            discountType: coupon.discountType || 'percentage',
            discountValue: coupon.discountValue !== undefined ? String(coupon.discountValue) : '',
            maxUses: coupon.maxUses !== undefined ? String(coupon.maxUses) : '100',
            minOrderAmount: coupon.minOrderAmount !== undefined ? String(coupon.minOrderAmount) : '0',
            currencyCode: coupon.currencyCode || currencyCode,
            startDate: toDateInputValue(coupon.startDate),
            endDate: toDateInputValue(coupon.endDate),
            isActive: coupon.isActive ?? true,
            applicableProducts: extractIdArray(coupon.applicableProducts || []),
            applicableCategories: extractIdArray(coupon.applicableCategories || []),
          });
        } catch (error) {
          toast.error(t('error_load_data', 'admin'));
        } finally {
          setIsLoading(false);
        }
      } else {
        resetFormState();
      }
    };

    void loadCoupon();
  }, [mode, couponId, locale, currencyCode]);

  const resetFormState = () => {
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    setEditingCoupon({
      code: '',
      description: '',
      discountType: 'percentage',
      discountValue: '',
      maxUses: '100',
      minOrderAmount: '0',
      currencyCode,
      startDate: toDateInputValue(today),
      endDate: toDateInputValue(endDate),
      isActive: true,
      applicableProducts: [],
      applicableCategories: [],
    });

    setProductSearch('');
    setCategorySearch('');
  };

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
      const name = getCategoryName(category).toLowerCase();
      return name.includes(keyword);
    });
  }, [categorySearch, categories, locale]);

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
        toast.error(t('error_fill_required', 'admin'));
        return;
      }

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
        toast.error(t('error_fill_required', 'admin'));
        return;
      }

      if (discountValue <= 0) {
        toast.error(t('admin_coupon_discount_positive', 'admin'));
        return;
      }

      if (editingCoupon.discountType === 'percentage' && discountValue > 100) {
        toast.error(t('admin_coupon_discount_percent_limit', 'admin'));
        return;
      }

      if (maxUses < 1) {
        toast.error(t('admin_coupon_max_uses_invalid', 'admin'));
        return;
      }

      if (minOrderAmount < 0) {
        toast.error(t('admin_coupon_min_order_invalid', 'admin'));
        return;
      }

      if (startDate >= endDate) {
        toast.error(t('admin_coupon_date_invalid', 'admin'));
        return;
      }

      setIsSubmitting(true);

      const payload = {
        code: editingCoupon.code.trim(),
        description: editingCoupon.description.trim(),
        discountType: editingCoupon.discountType,
        discountValue,
        maxUses,
        minOrderAmount,
        currencyCode: editingCoupon.currencyCode,
        startDate: editingCoupon.startDate,
        endDate: editingCoupon.endDate,
        isActive: editingCoupon.isActive,
        applicableProducts: editingCoupon.applicableProducts,
        applicableCategories: editingCoupon.applicableCategories,
      };

      if (editingCoupon._id) {
        await couponAPI.updateCoupon(editingCoupon._id, payload);
        toast.success(t('admin_coupon_update_success', 'admin'));
      } else {
        await couponAPI.createCoupon(payload as any);
        toast.success(t('admin_coupon_create_success', 'admin'));
      }

      onSuccess?.();
    } catch (error: any) {
      toast.error(error?.message || t('error_save_data', 'admin'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="p-10 text-center text-sm text-gray-500">{t('loading', 'admin')}</div>;
  }

  if (!editingCoupon) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          {mode === 'edit' ? t('admin_edit_coupon', 'admin') : t('admin_add_coupon', 'admin')}
        </h1>
        <p className="mt-2 text-sm text-gray-600">{t('admin_coupon_form_desc', 'admin')}</p>
      </div>

      <div className="rounded-2xl border bg-white p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="coupon-code">{t('admin_coupon_code', 'admin')}</Label>
              <Input
                id="coupon-code"
                value={editingCoupon.code}
                onChange={(event) => setEditingCoupon({ ...editingCoupon, code: event.target.value })}
                placeholder={t('coupon_codeExample', 'admin')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="coupon-description">{t('admin_coupon_description', 'admin')}</Label>
              <Textarea
                id="coupon-description"
                value={editingCoupon.description}
                onChange={(event) => setEditingCoupon({ ...editingCoupon, description: event.target.value })}
                placeholder={t('admin_coupon_description_placeholder', 'admin')}
                rows={4}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('admin_discount_type', 'admin')}</Label>
                <select value={editingCoupon.discountType} onChange={(event) => setEditingCoupon({ ...editingCoupon, discountType: event.target.value as 'percentage' | 'fixed' })} className="border-input flex h-9 w-full rounded-md border bg-input-background px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50">
                  <option value="percentage">{t('admin_discount_percentage', 'admin')}</option>
                  <option value="fixed">{t('admin_discount_fixed', 'admin')}</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="coupon-value">{t('admin_discount_value', 'admin')}</Label>
                <Input
                  id="coupon-value"
                  type="number"
                  min="0"
                  step={editingCoupon.discountType === 'percentage' ? '1' : '1000'}
                  value={editingCoupon.discountValue}
                  onChange={(event) => setEditingCoupon({ ...editingCoupon, discountValue: event.target.value })}
                  placeholder={editingCoupon.discountType === 'percentage' ? t('coupon_percentage_placeholder', 'admin') : t('coupon_fixed_placeholder', 'admin')}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="coupon-max-uses">{t('admin_max_uses', 'admin')}</Label>
                <Input
                  id="coupon-max-uses"
                  type="number"
                  min="1"
                  value={editingCoupon.maxUses}
                  onChange={(event) => setEditingCoupon({ ...editingCoupon, maxUses: event.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="coupon-min-order">{t('admin_min_order_amount', 'admin')}</Label>
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
                <Label htmlFor="coupon-start-date">{t('admin_start_date', 'admin')}</Label>
                <Input
                  id="coupon-start-date"
                  type="date"
                  value={editingCoupon.startDate}
                  onChange={(event) => setEditingCoupon({ ...editingCoupon, startDate: event.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="coupon-end-date">{t('admin_end_date', 'admin')}</Label>
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
                {t('admin_is_active', 'admin')}
              </Label>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border bg-white p-4">
              <MultiSelectDropdown
                title={t('admin_applicable_categories', 'admin')}
                description={t('admin_scope_help', 'admin')}
                placeholder={t('admin_search_categories_placeholder', 'admin')}
                emptyText={t('admin_no_categories', 'admin')}
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
                  label: getCategoryName(category),
                }))}
                onToggle={(id) => toggleArrayValue('applicableCategories', id)}
                onSelectAll={() => addAllArrayValues('applicableCategories', filteredCategories.map((category) => String(category._id)))}
                onClearAll={() => clearArrayValues('applicableCategories')}
              />
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <MultiSelectDropdown
                title={t('admin_applicable_products', 'admin')}
                description={t('admin_scope_help', 'admin')}
                placeholder={t('admin_search_products_placeholder', 'admin')}
                emptyText={t('admin_no_products', 'admin')}
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

        <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
          <Button className="w-full sm:w-auto" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            {t('cancel', 'admin')}
          </Button>
          <Button className="w-full bg-red-600 hover:bg-red-700 sm:w-auto" onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? t('admin_loading', 'admin') : t('admin_save', 'admin')}
          </Button>
        </div>
      </div>
    </div>
  );
}
