import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Search,
  TicketPercent,
  BadgePercent,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation, useLanguage } from '../../../lib/i18n';
import { useCurrencyContext } from '../../../lib/context/CurrencyContext';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Pagination } from '../Pagination';
import { couponAPI } from '../../../lib/api';
import { formatCurrencyByCode, formatCurrencyWithMetadata, formatDate } from '../../../lib/utils';

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
  currencyCode: string;
  applicableProducts?: any[];
  applicableCategories?: any[];
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

interface CouponsListProps {
  title: string;
  description: string;
  mode?: CouponMode;
}

const getCouponCount = (items?: any[]) => (Array.isArray(items) ? items.length : 0);

export function CouponsList({ title, description, mode = 'all' }: CouponsListProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { locale } = useLanguage();
  const { activeCurrencies } = useCurrencyContext();
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
  const [deleteTarget, setDeleteTarget] = useState<{ coupon: CouponRecord; action: 'delete' | 'hardDelete' } | null>(null);

  const activeBadgeCount = useMemo(() => totalCouponsCount, [totalCouponsCount]);
  const deletedBadgeCount = useMemo(() => deletedCouponsCount, [deletedCouponsCount]);

  const loadCoupons = async (targetViewDeletedTab = viewDeletedTab, targetPage = targetViewDeletedTab ? deletedCurrentPage : currentPage) => {
    try {
      setIsLoading(true);
      const discountType = isPercentageOnly ? 'percentage' : undefined;
      const response = targetViewDeletedTab
        ? await couponAPI.getDeletedCoupons(targetPage, searchQuery, ITEMS_PER_PAGE, discountType, locale)
        : await couponAPI.getCoupons(targetPage, searchQuery, ITEMS_PER_PAGE, discountType, locale);

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
      toast.error(t('error_load_data', 'admin'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadCoupons();
  }, [currentPage, deletedCurrentPage, isPercentageOnly, searchQuery, viewDeletedTab, locale]);

  const activeList = viewDeletedTab ? deletedCoupons : coupons;
  const currentPageNumber = viewDeletedTab ? deletedCurrentPage : currentPage;
  const currentTotalPages = viewDeletedTab ? deletedTotalPages : totalPages;

  const handleDelete = async (coupon: CouponRecord) => {
    try {
      setIsSubmitting(true);
      await couponAPI.deleteCoupon(coupon._id);
      toast.success(t('admin_coupon_delete_success', 'admin'));
      setDeleteTarget(null);
      await loadCoupons(false, currentPage);
    } catch (error: any) {
      toast.error(error?.message || t('error_delete_data', 'admin'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestore = async (coupon: CouponRecord) => {
    try {
      setIsSubmitting(true);
      await couponAPI.restoreCoupon(coupon._id);
      toast.success(t('admin_coupon_restore_success', 'admin'));
      await loadCoupons(true, deletedCurrentPage);
    } catch (error: any) {
      toast.error(error?.message || t('error_save_data', 'admin'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHardDelete = async (coupon: CouponRecord) => {
    try {
      setIsSubmitting(true);
      await couponAPI.hardDeleteCoupon(coupon._id);
      toast.success(t('admin_coupon_hard_delete_success', 'admin'));
      setDeleteTarget(null);
      await loadCoupons(true, deletedCurrentPage);
    } catch (error: any) {
      toast.error(error?.message || t('error_delete_data', 'admin'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCouponValue = (coupon: CouponRecord) => {
    if (coupon.discountType === 'percentage') {
      return `${coupon.discountValue}%`;
    }

    const currency = activeCurrencies.find((item) => item.code === coupon.currencyCode);
    return currency
      ? formatCurrencyWithMetadata(coupon.discountValue, currency, locale)
      : formatCurrencyByCode(coupon.discountValue, coupon.currencyCode, locale);
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
              {t('admin_active_coupons', 'admin')}: {activeBadgeCount}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              {t('admin_deleted_coupons', 'admin')}: {deletedBadgeCount}
            </Badge>
            {isPercentageOnly && (
              <Badge className="rounded-full bg-amber-100 text-amber-700 hover:bg-amber-100">
                {t('coupon_percentageOnly', 'admin')}
              </Badge>
            )}
          </div>
        </div>

        <Button onClick={() => router.push('/admin/coupons/create')} className="bg-red-600 hover:bg-red-700">
          <Plus className="mr-2 h-4 w-4" />
          {t('admin_add_coupon', 'admin')}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">{t('admin_total_coupons', 'admin')}</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{activeBadgeCount + deletedBadgeCount}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">{t('admin_active_coupons', 'admin')}</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{activeBadgeCount}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-gray-500">{t('admin_deleted_coupons', 'admin')}</div>
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
              placeholder={t('admin_search_coupon_placeholder', 'admin')}
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={!viewDeletedTab ? 'default' : 'outline'}
              onClick={() => handleTabChange(false)}
              className={!viewDeletedTab ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {t('admin_active_coupons', 'admin')}
            </Button>
            <Button
              variant={viewDeletedTab ? 'default' : 'outline'}
              onClick={() => handleTabChange(true)}
              className={viewDeletedTab ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {t('admin_deleted_coupons', 'admin')}
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-gray-500">{t('loading', 'admin')}</div>
          ) : activeList.length === 0 ? (
            <div className="p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                <AlertCircle className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm text-gray-600">{t('admin_no_coupons', 'admin')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-white">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_coupon_code', 'admin')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_coupon_type', 'admin')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_coupon_value', 'admin')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_coupon_uses', 'admin')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_coupon_range', 'admin')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_coupon_scope', 'admin')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_coupon_status', 'admin')}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin_actions', 'admin')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {activeList.map((coupon) => {
                    const isActive = coupon.isActive !== false;
                    return (
                      <tr key={coupon._id} className="hover:bg-white/60">
                        <td className="px-4 py-4">
                          <div className="font-mono text-sm font-semibold text-gray-900">{coupon.code}</div>
                          <div className="mt-1 max-w-xs truncate text-xs text-gray-500">{coupon.description || t('empty_value', 'admin')}</div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant="secondary" className="rounded-full">
                            {coupon.discountType === 'percentage' ? t('admin_discount_percentage', 'admin') : t('admin_discount_fixed', 'admin')}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-sm font-medium text-gray-900">{formatCouponValue(coupon)}</td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          {coupon.currentUses || 0}/{coupon.maxUses || 0}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          <div>{coupon.startDate ? formatDate(new Date(coupon.startDate), locale) : t('empty_value', 'admin')}</div>
                          <div className="text-xs text-gray-500">{coupon.endDate ? formatDate(new Date(coupon.endDate), locale) : t('empty_value', 'admin')}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">
                          <div>{getScopeLabel(coupon.applicableProducts)}</div>
                          <div className="text-xs text-gray-500">{getScopeLabel(coupon.applicableCategories)}</div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-100'}>
                            {isActive ? (
                              <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{t('active', 'admin')}</span>
                            ) : (
                              t('coupon_statusInactive', 'admin')
                            )}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            {!viewDeletedTab ? (
                              <>
                                <Button variant="outline" size="sm" onClick={() => router.push(`/admin/coupons/${coupon._id}/edit`)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => setDeleteTarget({ coupon, action: 'delete' })}
                                  title={t('admin_hard_delete', 'admin')}
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
                                  title={t('admin_hard_delete', 'admin')}
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

      <Dialog open={deleteTarget !== null} onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.action === 'hardDelete'
                ? t('admin_hard_delete_coupon', 'admin')
                : t('admin_delete_coupon', 'admin')}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.action === 'hardDelete'
                ? t('admin_hard_delete_coupon_desc', 'admin')
                : t('admin_delete_coupon_desc', 'admin')}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-gray-50 p-3">
            <p className="text-sm text-gray-700">
              <strong>{t('admin_coupon_code', 'admin')}:</strong> {deleteTarget?.coupon.code}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isSubmitting}>
              {t('cancel', 'admin')}
            </Button>
            <Button
              variant="destructive"
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
              {isSubmitting ? t('admin_loading', 'admin') : t('admin_delete', 'admin')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
