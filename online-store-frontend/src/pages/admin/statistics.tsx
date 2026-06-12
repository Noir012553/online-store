import Link from 'next/link';
import { useTranslation } from '../../lib/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '../../components/admin/_AdminLayout';
import { toast } from 'sonner';
import { analyticsAPI, apiCall, couponAPI, customerAPI, productAPI } from '../../lib/api';
import {
  joinAdminRoom,
  leaveAdminRoom,
  offEvent,
  onCouponCreated,
  onCouponDeleted,
  onCouponRestored,
  onCouponUpdated,
  onCustomerCreated,
  onCustomerDeleted,
  onCustomerRestored,
  onCustomerUpdated,
  onOrderCreated,
  onOrderDeleted,
  onOrderRestored,
  onOrderUpdated,
  onPaymentSuccess,
  onProductCreated,
  onProductDeleted,
  onProductRestored,
  onProductUpdated,
} from '../../lib/socket';
import { formatCurrency, formatDate } from '../../lib/utils';
import { getCategoryName } from '../../lib/data';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  AlertTriangle,
  ArrowRight,
  BadgePercent,
  BarChart3,
  Package,
  PencilLine,
  ShoppingCart,
  Sparkles,
  Star,
  TicketPercent,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';


const getCouponValueLabel = (coupon: any) => {
  if (coupon?.discountType === 'percentage') {
    return `${coupon.discountValue || 0}%`;
  }
  return formatCurrency(Number(coupon?.discountValue || 0));
};

const toDateInputValue = (value: any) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

type SelectedDetail =
  | { type: 'metric'; title: string; subtitle?: string; value: string | number; meta?: Record<string, string | number> }
  | { type: 'product'; title: string; item: any }
  | { type: 'coupon'; title: string; item: any }
  | { type: 'customer'; title: string; item: any }
  | { type: 'category'; title: string; item: { label: string; count: number } }
  | { type: 'order'; title: string; item: any }
  | { type: 'summary'; title: string; subtitle?: string; items: any[]; kind: 'promotion' | 'order-status' | 'payment' };

type DetailFormState =
  | {
    type: 'product';
    name: string;
    brand: string;
    price: string;
    originalPrice: string;
    countInStock: string;
    description: string;
    featured: boolean;
  }
  | {
    type: 'coupon';
    code: string;
    description: string;
    discountType: 'percentage' | 'fixed';
    discountValue: string;
    maxUses: string;
    minOrderAmount: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  }
  | {
    type: 'customer';
    name: string;
    email: string;
    phone: string;
    address: string;
  };

function StatisticsContent() {
  const { t, loadNamespace } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [exportStats, setExportStats] = useState<any>(null);
  const [topRatedProducts, setTopRatedProducts] = useState<any[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<SelectedDetail | null>(null);
  const [detailMode, setDetailMode] = useState<'view' | 'edit'>('view');
  const [detailForm, setDetailForm] = useState<DetailFormState | null>(null);
  const [detailImageFile, setDetailImageFile] = useState<File | null>(null);
  const [isSavingDetail, setIsSavingDetail] = useState(false);

  // Negative insights state
  const [slowSellingProducts, setSlowSellingProducts] = useState<any[]>([]);
  const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]);
  const [inactiveCustomers, setInactiveCustomers] = useState<any[]>([]);

  // New negative insights - low inventory, low rating, unused coupons
  const [lowInventoryProducts, setLowInventoryProducts] = useState<{ data: any[]; pagination: any }>({ data: [], pagination: {} });
  const [lowRatingProducts, setLowRatingProducts] = useState<{ data: any[]; pagination: any }>({ data: [], pagination: {} });
  const [unusedCoupons, setUnusedCoupons] = useState<{ data: any[]; pagination: any }>({ data: [], pagination: {} });

  // Pagination states
  const [lowInventoryPage, setLowInventoryPage] = useState(1);
  const [lowRatingPage, setLowRatingPage] = useState(1);
  const [unusedCouponsPage, setUnusedCouponsPage] = useState(1);

  // Sort states
  const [lowInventorySortBy, setLowInventorySortBy] = useState('countInStock');
  const [lowRatingSortBy, setLowRatingSortBy] = useState('rating');
  const [unusedCouponsSortBy, setUnusedCouponsSortBy] = useState('currentUses');

  // Date range for negative insights
  const [negativeDaysRange, setNegativeDaysRange] = useState(30);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    Promise.all([
      loadNamespace('statistics'),
      loadNamespace('ui-common'),
      loadNamespace('admin'),
    ]);
  }, [loadNamespace]);

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);

      const [dashboardResult, productsResult, customersResult, couponsResult, exportResult, topRatedResult, slowSellingResult, unpaidOrdersResult, inactiveCustomersResult, lowInventoryResult, lowRatingResult, unusedCouponsResult] =
        await Promise.allSettled([
          analyticsAPI.getDashboardData(30),
          productAPI.getProducts(1, '', '', '', 100, undefined, undefined, undefined, undefined, undefined),
          customerAPI.getCustomers(1, 100),
          couponAPI.getCoupons(1, '', 100),
          productAPI.getExportStats(),
          productAPI.getTopRated(),
          analyticsAPI.getSlowSellingProducts(10, negativeDaysRange),
          analyticsAPI.getUnpaidOrders(20, negativeDaysRange),
          analyticsAPI.getInactiveCustomers(10, 90),
          analyticsAPI.getLowInventoryProducts(10, lowInventoryPage, lowInventorySortBy, 10),
          analyticsAPI.getLowRatingProducts(10, lowRatingPage, lowRatingSortBy, 3.0, 1),
          analyticsAPI.getUnusedCoupons(10, unusedCouponsPage, unusedCouponsSortBy, 0.5),
        ]);

      if (!mountedRef.current) return;

      if (dashboardResult.status === 'fulfilled') setDashboardData(dashboardResult.value);
      if (productsResult.status === 'fulfilled') setProducts(productsResult.value.products || []);
      if (customersResult.status === 'fulfilled') setCustomers(customersResult.value.customers || []);
      if (couponsResult.status === 'fulfilled') setCoupons(couponsResult.value.coupons || []);
      if (exportResult.status === 'fulfilled') setExportStats(exportResult.value);
      if (topRatedResult.status === 'fulfilled') setTopRatedProducts(topRatedResult.value || []);
      if (slowSellingResult.status === 'fulfilled') setSlowSellingProducts(slowSellingResult.value || []);
      if (unpaidOrdersResult.status === 'fulfilled') setUnpaidOrders(unpaidOrdersResult.value || []);
      if (inactiveCustomersResult.status === 'fulfilled') setInactiveCustomers(inactiveCustomersResult.value || []);
      if (lowInventoryResult.status === 'fulfilled') setLowInventoryProducts(lowInventoryResult.value || { data: [], pagination: {} });
      if (lowRatingResult.status === 'fulfilled') setLowRatingProducts(lowRatingResult.value || { data: [], pagination: {} });
      if (unusedCouponsResult.status === 'fulfilled') setUnusedCoupons(unusedCouponsResult.value || { data: [], pagination: {} });
    } catch (loadError) {
      if (mountedRef.current) {
        setError(t('error_load_data'));
      }
    } finally {
      if (mountedRef.current && !silent) {
        setIsLoading(false);
      }
    }
  }, [negativeDaysRange, lowInventoryPage, lowRatingPage, unusedCouponsPage, lowInventorySortBy, lowRatingSortBy, unusedCouponsSortBy]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    joinAdminRoom();

    const refreshData = () => {
      void loadData(true);
    };

    onPaymentSuccess(refreshData);
    onOrderCreated(refreshData);
    onOrderUpdated(refreshData);
    onOrderDeleted(refreshData);
    onOrderRestored(refreshData);
    onCustomerCreated(refreshData);
    onCustomerUpdated(refreshData);
    onCustomerDeleted(refreshData);
    onCustomerRestored(refreshData);
    onProductCreated(refreshData);
    onProductUpdated(refreshData);
    onProductDeleted(refreshData);
    onProductRestored(refreshData);
    onCouponCreated(refreshData);
    onCouponUpdated(refreshData);
    onCouponDeleted(refreshData);
    onCouponRestored(refreshData);

    return () => {
      leaveAdminRoom();
      offEvent('payment-success');
      offEvent('order-created');
      offEvent('order-updated');
      offEvent('order-deleted');
      offEvent('order-restored');
      offEvent('customer-created');
      offEvent('customer-updated');
      offEvent('customer-deleted');
      offEvent('customer-restored');
      offEvent('product-created');
      offEvent('product-updated');
      offEvent('product-deleted');
      offEvent('product-restored');
      offEvent('coupon-created');
      offEvent('coupon-updated');
      offEvent('coupon-deleted');
      offEvent('coupon-restored');
    };
  }, [loadData]);

  const stats = dashboardData?.stats || {
    totalProducts: 0,
    inStockProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    totalCustomers: 0,
  };

  const recentOrders = dashboardData?.recentOrders || [];
  const topSellingProducts = dashboardData?.topProducts || [];
  const orderStatusData = dashboardData?.orderStatus || [];

  const lowStockProducts = useMemo(
    () =>
      [...products]
        .filter((product) => (product.countInStock ?? 0) > 0)
        .sort((a, b) => (a.countInStock ?? 0) - (b.countInStock ?? 0) || (a.price ?? 0) - (b.price ?? 0))
        .slice(0, 5),
    [products]
  );

  const budgetProducts = useMemo(
    () =>
      [...products]
        .filter((product) => (product.countInStock ?? 0) > 0)
        .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
        .slice(0, 5),
    [products]
  );


  const categoryMix = useMemo(() => {
    const categoryMap = new Map<string, { label: string; count: number }>();

    products.forEach((product) => {
      const label =
        getCategoryName(product.categoryName || product.category) ||
        t('not_updated');
      const current = categoryMap.get(label) || { label, count: 0 };
      current.count += 1;
      categoryMap.set(label, current);
    });

    return [...categoryMap.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [products, t]);

  const topCustomers = useMemo(
    () =>
      [...customers]
        .sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0) || (b.totalOrders ?? 0) - (a.totalOrders ?? 0))
        .slice(0, 5),
    [customers]
  );

  const paymentMix = useMemo(() => {
    const counts = new Map<string, number>();

    recentOrders.forEach((order: any) => {
      const key = String(order.paymentMethod || t('not_updated', 'admin')).toUpperCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [recentOrders]);

  const activeCoupons = coupons.filter((coupon) => coupon.isActive !== false && !coupon.isDeleted);
  const expiringCoupons = useMemo(
    () =>
      [...activeCoupons]
        .filter((coupon) => coupon.endDate)
        .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
        .slice(0, 5),
    [activeCoupons]
  );

  const mostUsedCoupons = useMemo(
    () =>
      [...activeCoupons]
        .sort((a, b) => (b.currentUses ?? 0) - (a.currentUses ?? 0) || (b.discountValue ?? 0) - (a.discountValue ?? 0))
        .slice(0, 5),
    [activeCoupons]
  );

  const customerWithoutOrders = customers.filter((customer) => (customer.totalOrders ?? 0) === 0).length;

  const sectionCard = (title: string, icon: React.ReactNode, children: React.ReactNode, action?: React.ReactNode) => (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">{icon}</div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {action && <div className="text-sm text-gray-500">{action}</div>}
          </div>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );

  const openDetail = (detail: SelectedDetail) => {
    setSelectedDetail(detail);
    setDetailMode('view');
    setDetailForm(null);
    setDetailImageFile(null);
  };

  const closeDetail = () => {
    setSelectedDetail(null);
    setDetailMode('view');
    setDetailForm(null);
    setDetailImageFile(null);
  };

  const startEditDetail = () => {
    if (!selectedDetail) return;

    if (selectedDetail.type === 'product') {
      setDetailForm({
        type: 'product',
        name: String(selectedDetail.item.name || ''),
        brand: String(selectedDetail.item.brand || ''),
        price: String(selectedDetail.item.price ?? 0),
        originalPrice: selectedDetail.item.originalPrice ? String(selectedDetail.item.originalPrice) : '',
        countInStock: String(selectedDetail.item.countInStock ?? 0),
        description: String(selectedDetail.item.description || ''),
        featured: Boolean(selectedDetail.item.featured),
      });
    } else if (selectedDetail.type === 'coupon') {
      setDetailForm({
        type: 'coupon',
        code: String(selectedDetail.item.code || ''),
        description: String(selectedDetail.item.description || ''),
        discountType: selectedDetail.item.discountType === 'fixed' ? 'fixed' : 'percentage',
        discountValue: String(selectedDetail.item.discountValue ?? 0),
        maxUses: String(selectedDetail.item.maxUses ?? 100),
        minOrderAmount: String(selectedDetail.item.minOrderAmount ?? 0),
        startDate: toDateInputValue(selectedDetail.item.startDate),
        endDate: toDateInputValue(selectedDetail.item.endDate),
        isActive: selectedDetail.item.isActive !== false,
      });
    } else if (selectedDetail.type === 'customer') {
      setDetailForm({
        type: 'customer',
        name: String(selectedDetail.item.name || ''),
        email: String(selectedDetail.item.email || ''),
        phone: String(selectedDetail.item.phone || ''),
        address: String(selectedDetail.item.address || ''),
      });
    }

    setDetailImageFile(null);
    setDetailMode('edit');
  };

  const handleSaveDetail = async () => {
    if (!selectedDetail || !detailForm) return;

    try {
      setIsSavingDetail(true);

      if (detailForm.type === 'product' && selectedDetail.type === 'product') {
        if (!detailForm.name.trim() || !detailForm.brand.trim() || !detailForm.price.trim()) {
          toast.error(t('error_fill_required'));
          return;
        }

        const price = Number(detailForm.price);
        const countInStock = Number(detailForm.countInStock);
        const originalPriceValue = detailForm.originalPrice.trim() ? Number(detailForm.originalPrice) : undefined;

        if (!Number.isFinite(price) || !Number.isFinite(countInStock)) {
          toast.error(t('error_fill_required'));
          return;
        }

        if (originalPriceValue !== undefined && (!Number.isFinite(originalPriceValue) || originalPriceValue <= price)) {
          toast.error(t('admin_original_price_invalid', 'admin'));
          return;
        }

        const formData = new FormData();
        formData.append('name', detailForm.name.trim());
        formData.append('brand', detailForm.brand.trim());
        formData.append('price', String(price));
        formData.append('countInStock', String(Math.max(0, Math.floor(countInStock))));
        formData.append('description', detailForm.description);
        formData.append('featured', detailForm.featured ? 'true' : 'false');
        formData.append('originalPrice', originalPriceValue !== undefined ? String(originalPriceValue) : '');

        if (detailImageFile) {
          formData.append('image', detailImageFile);
        }

        await productAPI.updateProduct(selectedDetail.item._id || selectedDetail.item.id, formData);
      }

      if (detailForm.type === 'coupon' && selectedDetail.type === 'coupon') {
        if (!detailForm.code.trim()) {
          toast.error(t('error_fill_required'));
          return;
        }

        const discountValue = Number(detailForm.discountValue);
        const maxUses = Number(detailForm.maxUses);
        const minOrderAmount = Number(detailForm.minOrderAmount);
        const startDate = new Date(detailForm.startDate);
        const endDate = new Date(detailForm.endDate);

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
          toast.error(t('admin_coupon_discount_positive', 'coupons'));
          return;
        }

        if (detailForm.discountType === 'percentage' && discountValue > 100) {
          toast.error(t('admin_coupon_discount_percent_limit', 'coupons'));
          return;
        }

        if (maxUses < 1) {
          toast.error(t('admin_coupon_max_uses_invalid', 'coupons'));
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

        await couponAPI.updateCoupon(selectedDetail.item._id, {
          code: detailForm.code.trim(),
          description: detailForm.description.trim(),
          discountType: detailForm.discountType,
          discountValue,
          maxUses,
          minOrderAmount,
          startDate: detailForm.startDate,
          endDate: detailForm.endDate,
          isActive: detailForm.isActive,
        });
      }

      if (detailForm.type === 'customer' && selectedDetail.type === 'customer') {
        if (!detailForm.name.trim() || !detailForm.email.trim() || !detailForm.phone.trim()) {
          toast.error(t('error_fill_required', 'admin'));
          return;
        }

        await customerAPI.updateCustomer(selectedDetail.item._id, {
          name: detailForm.name.trim(),
          email: detailForm.email.trim(),
          phone: detailForm.phone.trim(),
          address: detailForm.address.trim(),
        });
      }

      toast.success(t('admin_toast_product_updated', 'admin'));
      closeDetail();
      await loadData(true);
    } catch (error: any) {
      toast.error(error?.message || t('error_save_data'));
    } finally {
      setIsSavingDetail(false);
    }
  };

  const handleMarkDelivered = async () => {
    if (!selectedDetail || selectedDetail.type !== 'order') return;

    try {
      setIsSavingDetail(true);
      await apiCall(`/orders/${selectedDetail.item._id}/deliver`, { method: 'PUT' });
      toast.success(t('admin_toast_product_updated', 'admin'));
      closeDetail();
      await loadData(true);
    } catch (error: any) {
      toast.error(error?.message || t('error_save_data'));
    } finally {
      setIsSavingDetail(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center rounded-2xl border bg-white">
        <p className="text-gray-600">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-red-100 bg-linear-to-br from-white via-white to-red-50 shadow-sm">
        <div className="flex flex-col gap-6 px-8 py-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge className="bg-red-600 px-3 py-1 text-white">{t('admin_statistics_title', 'admin')}</Badge>
              <Badge variant="outline" className="border-red-200 text-red-700">
                {t('admin_statistics_focus', 'statistics')}
              </Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{t('admin_statistics_title', 'admin')}</h1>
            <p className="mt-3 max-w-2xl text-gray-600">{t('admin_statistics_desc', 'admin')}</p>
            <p className="mt-2 max-w-2xl text-sm text-gray-500">{t('admin_statistics_focus_desc', 'admin')}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            {[
              { href: '/admin/productsAdmin', label: t('statistics_products', 'admin') },
              { href: '/admin/ordersAdmin', label: t('statistics_orders', 'admin') },
              { href: '/admin/couponsAdmin', label: t('statistics_coupons', 'admin') },
              { href: '/admin/customersAdmin', label: t('statistics_customers', 'admin') },
            ].map((item) => (
              <Link key={item.href} href={item.href}>
                <Button variant="outline" className="gap-2 border-red-200 bg-white text-red-700 hover:bg-red-50">
                  {item.label}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: t('statistics_products', 'statistics'),
            value: stats.totalProducts,
            sub: t('statistics_in_stock_suffix', 'statistics'),
            icon: <Package className="h-5 w-5" />,
            detail: {
              type: 'metric' as const,
              title: t('statistics_products', 'statistics'),
              subtitle: t('statistics_in_stock_suffix', 'statistics'),
              value: stats.totalProducts,
              meta: {
                [t('admin_statistics_low_stock_products', 'admin')]: lowStockProducts.length,
                [t('admin_statistics_budget_products', 'admin')]: budgetProducts.length,
              },
            },
          },
          {
            label: t('statistics_orders', 'statistics'),
            value: stats.totalOrders,
            sub: t('statistics_all_orders_subtitle', 'statistics'),
            icon: <ShoppingCart className="h-5 w-5" />,
            detail: {
              type: 'metric' as const,
              title: t('statistics_orders', 'statistics'),
              subtitle: t('statistics_all_orders_subtitle', 'statistics'),
              value: stats.totalOrders,
              meta: {
                [t('order_status', 'statistics')]: orderStatusData.reduce((sum: number, item: any) => sum + (item.value || 0), 0),
                [t('recent_orders', 'statistics')]: recentOrders.length,
              },
            },
          },
          {
            label: t('statistics_revenue', 'statistics'),
            value: formatCurrency(stats.totalRevenue),
            sub: t('statistics_all_orders_subtitle', 'statistics'),
            icon: <BarChart3 className="h-5 w-5" />,
            detail: {
              type: 'metric' as const,
              title: t('statistics_revenue', 'statistics'),
              subtitle: t('statistics_all_orders_subtitle', 'statistics'),
              value: formatCurrency(stats.totalRevenue),
              meta: {
                [t('statistics_orders', 'admin')]: stats.totalOrders ?? 0,
                [t('statistics_customers', 'admin')]: stats.totalCustomers ?? 0,
              },
            },
          },
          {
            label: t('statistics_customers', 'admin'),
            value: stats.totalCustomers,
            sub: t('statistics_customers_without_orders_suffix', 'admin'),
            icon: <Users className="h-5 w-5" />,
            detail: {
              type: 'metric' as const,
              title: t('statistics_customers', 'admin'),
              subtitle: t('statistics_customers_without_orders_suffix', 'admin'),
              value: stats.totalCustomers,
              meta: {
                [t('top_customers', 'admin')]: topCustomers.length,
              },
            },
          },
        ].map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => openDetail(card.detail)}
            className="rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-200"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">{card.icon}</div>
              <div className="text-xs font-medium uppercase tracking-wider text-gray-400">{card.label}</div>
            </div>
            <div className="text-2xl font-semibold text-gray-900">{card.value}</div>
            <div className="mt-1 text-sm text-gray-500">{card.sub}</div>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {sectionCard(
          t('admin_statistics_low_stock_products', 'admin'),
          <AlertTriangle className="h-5 w-5" />,
          <div className="space-y-4">
            {lowStockProducts.length > 0 ? (
              lowStockProducts.map((product) => (
                <button
                  key={product._id || product.id}
                  type="button"
                  onClick={() => openDetail({ type: 'product', title: t(product.name), item: product })}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-100 p-4 text-left transition hover:border-red-200 hover:bg-red-50/40 focus:outline-none focus:ring-2 focus:ring-red-200"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{t(product.name)}</p>
                    <p className="text-sm text-gray-500">
                      {getCategoryName(product.categoryName || product.category)} · {formatCurrency(product.price || 0)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-600">{product.countInStock ?? 0} {t('statistics_in_stock', 'admin')}</p>
                    <p className="text-xs text-gray-500">{t('in_stock', 'admin')}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{t('statistics_no_products_found', 'admin')}</div>
            )}
          </div>,
          <span>{t('admin_statistics_focus_desc', 'admin')}</span>
        )}

        {sectionCard(
          t('admin_statistics_budget_products', 'admin'),
          <TrendingDown className="h-5 w-5" />,
          <div className="space-y-4">
            {budgetProducts.length > 0 ? (
              budgetProducts.map((product) => (
                <button
                  key={product._id || product.id}
                  type="button"
                  onClick={() => openDetail({ type: 'product', title: t(product.name), item: product })}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-100 p-4 text-left transition hover:border-red-200 hover:bg-red-50/40 focus:outline-none focus:ring-2 focus:ring-red-200"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{t(product.name)}</p>
                    <p className="text-sm text-gray-500">{getCategoryName(product.categoryName || product.category)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(product.price || 0)}</p>
                    <p className="text-xs text-gray-500">{product.countInStock ?? 0} {t('in_stock')}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{t('statistics_no_products_found', 'admin')}</div>
            )}
          </div>,
          <span>{t('admin_statistics_focus_desc', 'admin')}</span>
        )}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {sectionCard(
          t('admin_statistics_top_selling_products', 'admin'),
          <TrendingUp className="h-5 w-5" />,
          <div className="space-y-4">
            {topSellingProducts.length > 0 ? (
              topSellingProducts.map((product: any, index: number) => (
                <button
                  key={product._id || product.id || index}
                  type="button"
                  onClick={() => openDetail({ type: 'product', title: t(product.name), item: product })}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-100 p-4 text-left transition hover:border-red-200 hover:bg-red-50/40 focus:outline-none focus:ring-2 focus:ring-red-200"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{t(product.name)}</p>
                    <p className="text-sm text-gray-500">{getCategoryName(product.categoryName || product.category)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-600">{product.count || product.sold || 0}</p>
                    <p className="text-xs text-gray-500">{t('admin_statistics_orders_count', 'admin')}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{t('no_products_found')}</div>
            )}
          </div>,
          <span>{t('admin_top_products', 'admin')}</span>
        )}

        {sectionCard(
          t('admin_top_rated_products', 'admin'),
          <Star className="h-5 w-5" />,
          <div className="space-y-4">
            {topRatedProducts.length > 0 ? (
              topRatedProducts.map((product: any, index: number) => (
                <button
                  key={product._id || product.id || index}
                  type="button"
                  onClick={() => openDetail({ type: 'product', title: t(product.name), item: product })}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-100 p-4 text-left transition hover:border-red-200 hover:bg-red-50/40 focus:outline-none focus:ring-2 focus:ring-red-200"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{t(product.name)}</p>
                    <p className="text-sm text-gray-500">{getCategoryName(product.categoryName || product.category)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-amber-600">{Number(product.rating || 0).toFixed(1)} ★</p>
                    <p className="text-xs text-gray-500">{product.numReviews || 0} {t('admin_statistics_reviews', 'admin')}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{t('statistics_no_products_found', 'admin')}</div>
            )}
          </div>,
          <span>{t('admin_statistics_focus_desc', 'admin')}</span>
        )}

        {sectionCard(
          t('admin_statistics_promotions', 'admin'),
          <TicketPercent className="h-5 w-5" />,
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => openDetail({ type: 'summary', title: t('admin_statistics_promotions', 'admin'), subtitle: `${t('admin_statistics_active', 'admin')} ${t('coupon_text_suffix', 'admin')}`, items: activeCoupons, kind: 'promotion' })}
                className="rounded-xl bg-red-50 p-4 text-left transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-200"
              >
                <div className="text-xs uppercase tracking-wider text-red-500">{t('admin_statistics_active', 'admin')}</div>
                <div className="mt-2 text-2xl font-semibold text-red-700">{activeCoupons.length}</div>
              </button>
              <button
                type="button"
                onClick={() => openDetail({ type: 'summary', title: t('admin_statistics_promotions', 'admin'), subtitle: `${t('admin_statistics_expiring', 'admin')} ${t('coupon_text_suffix', 'admin')}`, items: expiringCoupons, kind: 'promotion' })}
                className="rounded-xl bg-white p-4 text-left transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-red-200"
              >
                <div className="text-xs uppercase tracking-wider text-gray-500">{t('admin_statistics_expiring', 'admin')}</div>
                <div className="mt-2 text-2xl font-semibold text-gray-900">{expiringCoupons.length}</div>
              </button>
            </div>
            <div className="space-y-3">
              {mostUsedCoupons.length > 0 ? (
                mostUsedCoupons.map((coupon) => (
                  <button
                    key={coupon._id || coupon.code}
                    type="button"
                    onClick={() => openDetail({ type: 'coupon', title: coupon.code, item: coupon })}
                    className="flex w-full items-center justify-between rounded-xl border border-gray-100 p-4 text-left transition hover:border-red-200 hover:bg-red-50/40 focus:outline-none focus:ring-2 focus:ring-red-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{coupon.code}</p>
                      <p className="text-sm text-gray-500">
                        {coupon.currentUses || 0}/{coupon.maxUses || t('admin_unlimited_uses', 'admin')} · {t(coupon.discountType)}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-red-200 text-red-700">
                      {getCouponValueLabel(coupon)}
                    </Badge>
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{t('statistics_no_products_found', 'admin')}</div>
              )}
            </div>
            {expiringCoupons.length > 0 && (
              <button
                type="button"
                onClick={() => openDetail({ type: 'coupon', title: expiringCoupons[0].code, item: expiringCoupons[0] })}
                className="w-full rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-200"
              >
                {expiringCoupons[0].code} {t('admin_statistics_expires_at', 'admin')} {formatDate(expiringCoupons[0].endDate)}
              </button>
            )}
          </div>,
          <span>{t('admin_order_vouchers', 'admin')}</span>
        )}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {sectionCard(
          t('admin_statistics_category_mix', 'admin'),
          <BadgePercent className="h-5 w-5" />,
          <div className="space-y-4">
            {exportStats?.categories?.length > 0 ? (
              [...exportStats.categories]
                .sort((a: any, b: any) => (b.count || 0) - (a.count || 0))
                .slice(0, 6)
                .map((item: any) => {
                  const categoryName = getCategoryName(item.category) || t('not_updated', 'admin');
                  const maxCount = Math.max(...exportStats.categories.map((c: any) => c.count || 0), 1);
                  const width = ((item.count || 0) / maxCount) * 100;

                  return (
                    <button
                      key={categoryName}
                      type="button"
                      onClick={() => openDetail({ type: 'category', title: categoryName, item: { label: categoryName, count: item.count || 0 } })}
                      className="w-full space-y-2 rounded-xl p-2 text-left transition hover:bg-red-50/40 focus:outline-none focus:ring-2 focus:ring-red-200"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-900">{categoryName}</span>
                        <span className="text-gray-500">{item.count}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-100">
                        <div className="h-2 rounded-full bg-red-600" style={{ width: `${Math.max(width, 8)}%` }} />
                      </div>
                    </button>
                  );
                })
            ) : categoryMix.length > 0 ? (
              categoryMix.map((item) => {
                const maxCount = Math.max(...categoryMix.map((c) => c.count), 1);
                const width = (item.count / maxCount) * 100;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => openDetail({ type: 'category', title: item.label, item })}
                    className="w-full space-y-2 rounded-xl p-2 text-left transition hover:bg-red-50/40 focus:outline-none focus:ring-2 focus:ring-red-200"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900">{item.label}</span>
                      <span className="text-gray-500">{item.count}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100">
                      <div className="h-2 rounded-full bg-red-600" style={{ width: `${Math.max(width, 8)}%` }} />
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{t('statistics_no_products_found', 'admin')}</div>
            )}
          </div>,
          <span>{t('admin_statistics_focus_desc', 'admin')}</span>
        )}

        {sectionCard(
          t('admin_statistics_top_customers', 'admin'),
          <Users className="h-5 w-5" />,
          <div className="space-y-4">
            {topCustomers.length > 0 ? (
              topCustomers.map((customer, index) => (
                <button
                  key={customer._id || index}
                  type="button"
                  onClick={() => openDetail({ type: 'customer', title: customer.name || customer.email || t('not_updated', 'admin'), item: customer })}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-100 p-4 text-left transition hover:border-red-200 hover:bg-red-50/40 focus:outline-none focus:ring-2 focus:ring-red-200"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{customer.name || customer.email || t('not_updated', 'admin')}</p>
                    <p className="text-sm text-gray-500">{customer.email || t('not_updated', 'admin')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{customer.totalOrders || 0} {t('admin_orders_count')}</p>
                    <p className="text-xs text-gray-500">{formatCurrency(customer.totalSpent || 0)}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{t('no_products_found')}</div>
            )}
          </div>,
          <span>{t('admin_customers', 'admin')}</span>
        )}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {sectionCard(
          t('admin_statistics_recent_orders', 'admin'),
          <ShoppingCart className="h-5 w-5" />,
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-red-50 p-4">
                <div className="text-xs uppercase tracking-wider text-red-500">{t('admin_order_status_dist', 'admin')}</div>
                <div className="mt-3 space-y-2">
                  {orderStatusData.slice(0, 4).map((status: any, index: number) => {
                    const maxValue = Math.max(...orderStatusData.map((s: any) => s.value || 0), 1);
                    const width = ((status.value || 0) / maxValue) * 100;
                    const translatedStatus = t(status.name);
                    return (
                      <button
                        key={`${status.name}-${index}`}
                        type="button"
                        onClick={() => openDetail({ type: 'summary', title: t('admin_order_status_dist', 'admin'), subtitle: translatedStatus, items: [status], kind: 'order-status' })}
                        className="w-full space-y-1 rounded-xl p-2 text-left transition hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-red-200"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-700">{t(translatedStatus)}</span>
                          <span className="font-medium text-gray-900">{status.value}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-white/70">
                          <div className="h-2 rounded-full bg-red-600" style={{ width: `${Math.max(width, 8)}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl bg-white p-4">
                <div className="text-xs uppercase tracking-wider text-gray-500">{t('admin_statistics_payment_mix', 'admin')}</div>
                <div className="mt-3 space-y-2">
                  {paymentMix.length > 0 ? (
                    paymentMix.map((item) => {
                      const maxValue = Math.max(...paymentMix.map((s) => s.value), 1);
                      const width = (item.value / maxValue) * 100;
                      return (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => openDetail({ type: 'summary', title: t('admin_statistics_payment_mix', 'admin'), subtitle: item.name, items: [item], kind: 'payment' })}
                          className="w-full space-y-1 rounded-xl p-2 text-left transition hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-red-200"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-700">{item.name}</span>
                            <span className="font-medium text-gray-900">{item.value}</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-white">
                            <div className="h-2 rounded-full bg-gray-700" style={{ width: `${Math.max(width, 8)}%` }} />
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <p className="text-sm text-gray-500">{t('no_products_found')}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="w-full">
                <thead className="bg-white text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">{t('admin_order_id')}</th>
                    <th className="px-4 py-3 text-left">{t('admin_customer')}</th>
                    <th className="px-4 py-3 text-left">{t('admin_value')}</th>
                    <th className="px-4 py-3 text-left">{t('admin_status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentOrders.slice(0, 5).map((order: any, index: number) => (
                    <tr
                      key={order._id || index}
                      className="group cursor-pointer text-sm transition hover:bg-red-50 active:bg-red-100"
                      onClick={() => openDetail({ type: 'order', title: String(order._id || '').slice(-6).toUpperCase(), item: order })}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          openDetail({ type: 'order', title: String(order._id || '').slice(-6).toUpperCase(), item: order });
                        }
                      }}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{String(order._id || '').slice(-6).toUpperCase()}</td>
                      <td className="px-4 py-3 text-gray-700">{t(order.customerName || order.customer?.name) || t('not_updated')}</td>
                      <td className="px-4 py-3 text-gray-700">{formatCurrency(order.totalPrice || 0)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="border-gray-200 text-gray-700">
                          {t(order.isDelivered ? 'my_orders_status_delivered' : order.isPaid ? 'my_orders_status_paid' : 'pending_payment')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>,
          <span>{t('admin_statistics_focus_desc', 'admin')}</span>
        )}
      </section>

      {/* ===== NEGATIVE INSIGHTS SECTION ===== */}
      <section className="overflow-hidden rounded-3xl border border-amber-100 bg-linear-to-br from-white via-white to-amber-50 shadow-sm">
        <div className="flex flex-col gap-6 px-8 py-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge className="bg-amber-600 px-3 py-1 text-white">{t('admin_statistics_title', 'admin')}</Badge>
              <Badge variant="outline" className="border-amber-200 text-amber-700">
                {t('admin_statistics_negative_insights', 'admin')}
              </Badge>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">{t('admin_statistics_negative_analysis', 'admin')}</h2>
            <p className="mt-3 max-w-2xl text-gray-600">{t('admin_statistics_negative_desc', 'admin')}</p>
            <p className="mt-2 max-w-2xl text-sm text-gray-500">{t('admin_statistics_negative_time', 'admin')}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[7, 14, 30, 60, 90].map((days) => (
              <button
                key={days}
                onClick={() => setNegativeDaysRange(days)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${negativeDaysRange === days
                    ? 'bg-amber-600 text-white'
                    : 'border border-amber-200 bg-white text-amber-700 hover:bg-amber-50'
                  }`}
              >
                {days} {t('admin_statistics_days', 'admin')}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {sectionCard(
          t('admin_statistics_slow_selling_products', 'admin'),
          <TrendingDown className="h-5 w-5" />,
          <div className="space-y-4">
            {slowSellingProducts.length > 0 ? (
              slowSellingProducts.map((product) => (
                <button
                  key={product._id || product.id}
                  type="button"
                  onClick={() => openDetail({ type: 'product', title: t(product.name), item: product })}
                  className="flex w-full items-center justify-between rounded-xl border border-amber-100 bg-amber-50/40 p-4 text-left transition hover:border-amber-300 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{t(product.name)}</p>
                    <p className="text-sm text-gray-500">
                      {product.orderCount === 0 ? t('admin_statistics_no_orders', 'admin') : `${product.orderCount} ${t('admin_statistics_orders_unit', 'admin')}`} · {product.countInStock} {t('admin_statistics_inventory', 'admin')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-amber-600">{formatCurrency(product.price || 0)}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{t('admin_statistics_no_slow_selling', 'admin')}</div>
            )}
          </div>,
          <span>{t('admin_statistics_sort_slow_selling', 'admin')}</span>
        )}

        {sectionCard(
          t('admin_statistics_unpaid_orders', 'admin'),
          <AlertTriangle className="h-5 w-5" />,
          <div className="space-y-4">
            {unpaidOrders.length > 0 ? (
              unpaidOrders.map((order) => (
                <button
                  key={order._id}
                  type="button"
                  onClick={() => openDetail({ type: 'order', title: String(order._id || '').slice(-6).toUpperCase(), item: order })}
                  className="flex w-full items-center justify-between rounded-xl border border-amber-100 bg-amber-50/40 p-4 text-left transition hover:border-amber-300 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{order.customerName || t('not_updated', 'admin')}</p>
                    <p className="text-sm text-gray-500">
                      {Math.floor(order.daysOverdue || 0)} {t('admin_statistics_days_unpaid', 'admin')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-amber-600">{formatCurrency(order.totalPrice || 0)}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{t('admin_statistics_no_unpaid', 'admin')}</div>
            )}
          </div>,
          <span>{t('admin_statistics_sort_unpaid', 'admin')}</span>
        )}

        {sectionCard(
          t('admin_statistics_inactive_customers', 'admin'),
          <Users className="h-5 w-5" />,
          <div className="space-y-4">
            {inactiveCustomers.length > 0 ? (
              inactiveCustomers.map((customer, index) => (
                <button
                  key={customer._id || index}
                  type="button"
                  onClick={() => openDetail({ type: 'customer', title: customer.name || customer.email || t('not_updated', 'admin'), item: customer })}
                  className="flex w-full items-center justify-between rounded-xl border border-amber-100 bg-amber-50/40 p-4 text-left transition hover:border-amber-300 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{customer.name || customer.email || t('not_updated', 'admin')}</p>
                    <p className="text-sm text-gray-500">
                      {customer.totalOrders === 0
                        ? t('admin_statistics_no_orders_yet', 'admin')
                        : `${customer.daysSinceLastOrder ? Math.floor(customer.daysSinceLastOrder) : t('admin_no_purchases', 'admin')} ${t('admin_statistics_days_no_purchase', 'admin')}`
                      }
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-700">{customer.totalOrders || 0} {t('admin_statistics_orders_unit', 'admin')}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{t('admin_statistics_no_inactive', 'admin')}</div>
            )}
          </div>,
          <span>{t('admin_statistics_sort_inactive', 'admin')}</span>
        )}
      </section>

      {/* Low Inventory, Low Rating, Unused Coupons - với phân trang */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {sectionCard(
          t('admin_statistics_low_inventory', 'admin'),
          <AlertTriangle className="h-5 w-5" />,
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <select
                value={lowInventorySortBy}
                onChange={(e) => {
                  setLowInventorySortBy(e.target.value);
                  setLowInventoryPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="countInStock">{t('admin_statistics_sort_inventory_asc', 'admin')}</option>
                <option value="-countInStock">{t('admin_statistics_sort_inventory_desc', 'admin')}</option>
                <option value="price">{t('admin_statistics_sort_price_asc', 'admin')}</option>
                <option value="-price">{t('admin_statistics_sort_price_desc', 'admin')}</option>
              </select>
            </div>
            {lowInventoryProducts.data.length > 0 ? (
              <>
                <div className="space-y-2">
                  {lowInventoryProducts.data.map((product) => (
                    <button
                      key={product._id || product.id}
                      type="button"
                      onClick={() => openDetail({ type: 'product', title: t(product.name), item: product })}
                      className="flex w-full items-center justify-between rounded-xl border border-red-100 bg-red-50/40 p-4 text-left transition hover:border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{t(product.name)}</p>
                        <p className="text-sm text-gray-500">{product.countInStock} {t('admin_statistics_inventory', 'admin')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-red-600">{formatCurrency(product.price || 0)}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {lowInventoryProducts.pagination.pages && lowInventoryProducts.pagination.pages > 1 && (
                  <div className="flex items-center justify-between border-t pt-4">
                    <button
                      onClick={() => setLowInventoryPage(Math.max(1, lowInventoryPage - 1))}
                      disabled={lowInventoryPage === 1}
                      className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50"
                    >
                      {t('admin_statistics_previous', 'admin')}
                    </button>
                    <span className="text-sm text-gray-600">{t('page_label', 'pagination')} {lowInventoryPage} / {lowInventoryProducts.pagination.pages}</span>
                    <button
                      onClick={() => setLowInventoryPage(Math.min(lowInventoryProducts.pagination.pages, lowInventoryPage + 1))}
                      disabled={lowInventoryPage === lowInventoryProducts.pagination.pages}
                      className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50"
                    >
                      {t('admin_statistics_next', 'admin')}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{t('admin_statistics_no_low_inventory', 'admin')}</div>
            )}
          </div>,
          <span>{t('admin_statistics_sort_and_pagination', 'admin')}</span>
        )}

        {sectionCard(
          t('admin_statistics_low_ratings', 'admin'),
          <Star className="h-5 w-5" />,
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <select
                value={lowRatingSortBy}
                onChange={(e) => {
                  setLowRatingSortBy(e.target.value);
                  setLowRatingPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="rating">{t('admin_statistics_sort_rating_asc', 'admin')}</option>
                <option value="-rating">{t('admin_statistics_sort_rating_desc', 'admin')}</option>
                <option value="numReviews">{t('admin_statistics_sort_reviews_asc', 'admin')}</option>
                <option value="-numReviews">{t('admin_statistics_sort_reviews_desc', 'admin')}</option>
              </select>
            </div>
            {lowRatingProducts.data.length > 0 ? (
              <>
                <div className="space-y-2">
                  {lowRatingProducts.data.map((product) => (
                    <button
                      key={product._id || product.id}
                      type="button"
                      onClick={() => openDetail({ type: 'product', title: t(product.name), item: product })}
                      className="flex w-full items-center justify-between rounded-xl border border-red-100 bg-red-50/40 p-4 text-left transition hover:border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{t(product.name)}</p>
                        <p className="text-sm text-gray-500">{product.rating.toFixed(1)} ⭐ ({product.numReviews} {t('admin_statistics_reviews', 'admin')})</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-red-600">{formatCurrency(product.price || 0)}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {lowRatingProducts.pagination.pages && lowRatingProducts.pagination.pages > 1 && (
                  <div className="flex items-center justify-between border-t pt-4">
                    <button
                      onClick={() => setLowRatingPage(Math.max(1, lowRatingPage - 1))}
                      disabled={lowRatingPage === 1}
                      className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50"
                    >
                      {t('admin_statistics_previous', 'admin')}
                    </button>
                    <span className="text-sm text-gray-600">{t('page_label', 'pagination')} {lowRatingPage} / {lowRatingProducts.pagination.pages}</span>
                    <button
                      onClick={() => setLowRatingPage(Math.min(lowRatingProducts.pagination.pages, lowRatingPage + 1))}
                      disabled={lowRatingPage === lowRatingProducts.pagination.pages}
                      className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50"
                    >
                      {t('admin_statistics_next', 'admin')}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{t('admin_statistics_no_low_rating', 'admin')}</div>
            )}
          </div>,
          <span>{t('admin_statistics_sort_and_pagination', 'admin')}</span>
        )}

        {sectionCard(
          t('admin_statistics_unused_coupons', 'admin'),
          <TicketPercent className="h-5 w-5" />,
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <select
                value={unusedCouponsSortBy}
                onChange={(e) => {
                  setUnusedCouponsSortBy(e.target.value);
                  setUnusedCouponsPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="currentUses">{t('admin_statistics_sort_uses_asc', 'admin')}</option>
                <option value="-currentUses">{t('admin_statistics_sort_uses_desc', 'admin')}</option>
                <option value="maxUses">{t('admin_statistics_sort_limit_asc', 'admin')}</option>
                <option value="-maxUses">{t('admin_statistics_sort_limit_desc', 'admin')}</option>
              </select>
            </div>
            {unusedCoupons.data.length > 0 ? (
              <>
                <div className="space-y-2">
                  {unusedCoupons.data.map((coupon) => (
                    <button
                      key={coupon._id || coupon.code}
                      type="button"
                      onClick={() => openDetail({ type: 'coupon', title: coupon.code, item: coupon })}
                      className="flex w-full items-center justify-between rounded-xl border border-red-100 bg-red-50/40 p-4 text-left transition hover:border-red-300 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{coupon.code}</p>
                        <p className="text-sm text-gray-500">
                          {t('statistics_usage_label', 'admin')} {coupon.currentUses}/{coupon.maxUses} ({Math.round((coupon.currentUses / coupon.maxUses) * 100)}%)
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-red-600">
                          {coupon.discountType === 'percentage' ? `${coupon.discountValue}%` : formatCurrency(coupon.discountValue || 0)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
                {unusedCoupons.pagination.pages && unusedCoupons.pagination.pages > 1 && (
                  <div className="flex items-center justify-between border-t pt-4">
                    <button
                      onClick={() => setUnusedCouponsPage(Math.max(1, unusedCouponsPage - 1))}
                      disabled={unusedCouponsPage === 1}
                      className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50"
                    >
                      {t('admin_statistics_previous', 'admin')}
                    </button>
                    <span className="text-sm text-gray-600">{t('page_label', 'pagination')} {unusedCouponsPage} / {unusedCoupons.pagination.pages}</span>
                    <button
                      onClick={() => setUnusedCouponsPage(Math.min(unusedCoupons.pagination.pages, unusedCouponsPage + 1))}
                      disabled={unusedCouponsPage === unusedCoupons.pagination.pages}
                      className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50"
                    >
                      {t('admin_statistics_next', 'admin')}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">{t('admin_statistics_no_unused_coupons', 'admin')}</div>
            )}
          </div>,
          <span>{t('admin_statistics_sort_and_pagination', 'admin')}</span>
        )}
      </section>

      <section className="rounded-2xl border border-dashed border-red-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-red-600" />
          <div>
            <p className="font-semibold text-gray-900">{t('admin_statistics_business_focus_title', 'admin')}</p>
            <p className="mt-1">{t('admin_statistics_business_focus_desc', 'admin')}</p>
            <p className="mt-2 text-gray-500">
              {t('admin_statistics_business_focus_upgrade', 'admin')}
            </p>
          </div>
        </div>
      </section>

      <Dialog open={!!selectedDetail} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className="max-w-3xl">
          {selectedDetail && (
            <div className="space-y-6">
              <DialogHeader className="space-y-1">
                <DialogTitle>
                  {selectedDetail.type === 'metric'
                    ? selectedDetail.title
                    : selectedDetail.type === 'product'
                      ? t(selectedDetail.item.name) || selectedDetail.title
                      : selectedDetail.type === 'coupon'
                        ? selectedDetail.item.code
                        : selectedDetail.type === 'customer'
                          ? selectedDetail.item.name || selectedDetail.item.email || t('not_updated', 'admin')
                          : selectedDetail.type === 'category'
                            ? selectedDetail.item.label
                            : selectedDetail.type === 'order'
                              ? String(selectedDetail.item._id || '').toUpperCase()
                              : selectedDetail.title}
                </DialogTitle>
                <DialogDescription>
                  {selectedDetail.type === 'metric'
                    ? selectedDetail.subtitle
                    : selectedDetail.type === 'product'
                      ? getCategoryName(selectedDetail.item.categoryName || selectedDetail.item.category)
                      : selectedDetail.type === 'coupon'
                        ? t(selectedDetail.item.discountType)
                        : selectedDetail.type === 'customer'
                          ? selectedDetail.item.email || t('not_updated', 'admin')
                          : selectedDetail.type === 'category'
                            ? t('admin_statistics_categories', 'admin')
                            : selectedDetail.type === 'order'
                              ? t(selectedDetail.item.customerName || selectedDetail.item.customer?.name) || t('not_updated', 'admin')
                              : selectedDetail.subtitle}
                </DialogDescription>
              </DialogHeader>


              {detailMode === 'edit' && detailForm?.type === 'product' && selectedDetail.type === 'product' && (
                <div className="space-y-4 text-sm text-gray-700">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="product-name">{t('product_name_label', 'admin')}</Label>
                      <Input id="product-name" className="mt-1" value={detailForm.name} onChange={(event) => setDetailForm({ ...detailForm, name: event.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="product-brand">{t('product_brand_label', 'admin')}</Label>
                      <Input id="product-brand" className="mt-1" value={detailForm.brand} onChange={(event) => setDetailForm({ ...detailForm, brand: event.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="product-price">{t('product_price_label', 'admin')}</Label>
                      <Input id="product-price" type="number" className="mt-1" value={detailForm.price} onChange={(event) => setDetailForm({ ...detailForm, price: event.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="product-original-price">{t('product_original_price_label', 'admin')}</Label>
                      <Input id="product-original-price" type="number" className="mt-1" value={detailForm.originalPrice} onChange={(event) => setDetailForm({ ...detailForm, originalPrice: event.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="product-stock">{t('product_stock_label', 'admin')}</Label>
                      <Input id="product-stock" type="number" className="mt-1" value={detailForm.countInStock} onChange={(event) => setDetailForm({ ...detailForm, countInStock: event.target.value })} />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
                      <div>
                        <Label htmlFor="product-featured">{t('product_featured_label', 'admin')}</Label>
                        <p className="text-xs text-gray-500">{t('product_featured_help', 'admin')}</p>
                      </div>
                      <Switch id="product-featured" checked={detailForm.featured} onCheckedChange={(checked) => setDetailForm({ ...detailForm, featured: checked })} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="product-description">{t('product_description_label', 'admin')}</Label>
                    <Textarea id="product-description" className="mt-1 min-h-28" value={detailForm.description} onChange={(event) => setDetailForm({ ...detailForm, description: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="product-image">{t('product_image_label', 'admin')}</Label>
                    <Input id="product-image" type="file" accept="image/*" className="mt-1" onChange={(event) => setDetailImageFile(event.target.files?.[0] || null)} />
                    <p className="mt-2 text-xs text-gray-500">{t('product_image_help', 'admin')}</p>
                  </div>
                </div>
              )}

              {detailMode === 'edit' && detailForm?.type === 'coupon' && selectedDetail.type === 'coupon' && (
                <div className="space-y-4 text-sm text-gray-700">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="coupon-code">{t('coupon_code_label', 'admin')}</Label>
                      <Input id="coupon-code" className="mt-1 uppercase" value={detailForm.code} onChange={(event) => setDetailForm({ ...detailForm, code: event.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="coupon-discount-type">{t('coupon_discount_type_label', 'admin')}</Label>
                      <select
                        id="coupon-discount-type"
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-input-background px-3 py-1 text-base outline-none md:text-sm"
                        value={detailForm.discountType}
                        onChange={(event) => setDetailForm({ ...detailForm, discountType: event.target.value === 'fixed' ? 'fixed' : 'percentage' })}
                      >
                        <option value="percentage">{t('coupon_discount_type_percentage', 'admin')}</option>
                        <option value="fixed">{t('coupon_discount_type_fixed', 'admin')}</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="coupon-discount-value">{t('coupon_discount_value_label', 'admin')}</Label>
                      <Input id="coupon-discount-value" type="number" className="mt-1" value={detailForm.discountValue} onChange={(event) => setDetailForm({ ...detailForm, discountValue: event.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="coupon-max-uses">{t('coupon_max_uses_label', 'admin')}</Label>
                      <Input id="coupon-max-uses" type="number" className="mt-1" value={detailForm.maxUses} onChange={(event) => setDetailForm({ ...detailForm, maxUses: event.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="coupon-min-order">{t('coupon_min_order_label', 'admin')}</Label>
                      <Input id="coupon-min-order" type="number" className="mt-1" value={detailForm.minOrderAmount} onChange={(event) => setDetailForm({ ...detailForm, minOrderAmount: event.target.value })} />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
                      <div>
                        <Label htmlFor="coupon-active">{t('coupon_active_label', 'admin')}</Label>
                        <p className="text-xs text-gray-500">{t('coupon_active_help', 'admin')}</p>
                      </div>
                      <Switch id="coupon-active" checked={detailForm.isActive} onCheckedChange={(checked) => setDetailForm({ ...detailForm, isActive: checked })} />
                    </div>
                    <div>
                      <Label htmlFor="coupon-start-date">{t('coupon_start_date_label', 'admin')}</Label>
                      <Input id="coupon-start-date" type="date" className="mt-1" value={detailForm.startDate} onChange={(event) => setDetailForm({ ...detailForm, startDate: event.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="coupon-end-date">{t('coupon_end_date_label', 'admin')}</Label>
                      <Input id="coupon-end-date" type="date" className="mt-1" value={detailForm.endDate} onChange={(event) => setDetailForm({ ...detailForm, endDate: event.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="coupon-description">{t('coupon_description_label', 'admin')}</Label>
                    <Textarea id="coupon-description" className="mt-1 min-h-28" value={detailForm.description} onChange={(event) => setDetailForm({ ...detailForm, description: event.target.value })} />
                  </div>
                </div>
              )}

              {detailMode === 'edit' && detailForm?.type === 'customer' && selectedDetail.type === 'customer' && (
                <div className="space-y-4 text-sm text-gray-700">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="customer-name">{t('customer_name_label', 'admin')}</Label>
                      <Input id="customer-name" className="mt-1" value={detailForm.name} onChange={(event) => setDetailForm({ ...detailForm, name: event.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="customer-email">{t('customer_email_label', 'admin')}</Label>
                      <Input id="customer-email" className="mt-1" value={detailForm.email} onChange={(event) => setDetailForm({ ...detailForm, email: event.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="customer-phone">{t('customer_phone_label', 'admin')}</Label>
                      <Input id="customer-phone" className="mt-1" value={detailForm.phone} onChange={(event) => setDetailForm({ ...detailForm, phone: event.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="customer-address">{t('customer_address_label', 'admin')}</Label>
                    <Textarea id="customer-address" className="mt-1 min-h-28" value={detailForm.address} onChange={(event) => setDetailForm({ ...detailForm, address: event.target.value })} />
                  </div>
                </div>
              )}

              {detailMode === 'view' && selectedDetail.type === 'metric' && (
                <div className="space-y-4 text-sm text-gray-700">
                  <div className="rounded-xl bg-white p-4">
                    <div className="text-xs uppercase tracking-wider text-gray-500">{t('admin_value')}</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">{selectedDetail.value}</div>
                  </div>
                  {selectedDetail.meta && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {Object.entries(selectedDetail.meta).map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-gray-100 p-4">
                          <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
                          <div className="mt-1 font-semibold text-gray-900">{String(value)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailMode === 'view' && selectedDetail.type === 'product' && (
                <div className="space-y-4 text-sm text-gray-700">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_price_label', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{formatCurrency(selectedDetail.item.price || 0)}</div></div>
                    <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_stock_label', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{selectedDetail.item.countInStock ?? 0}</div></div>
                    <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_rating_label', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{Number(selectedDetail.item.rating || 0).toFixed(1)} ★</div></div>
                    <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_reviews_label', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{selectedDetail.item.numReviews || 0}</div></div>
                    <div className="rounded-xl border border-gray-100 p-4 sm:col-span-2"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_category_label', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{getCategoryName(selectedDetail.item.categoryName || selectedDetail.item.category) || t('not_available', 'admin')}</div></div>
                    {selectedDetail.item.image && (
                      <div className="rounded-xl border border-gray-100 p-4 sm:col-span-2">
                        <div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_image_label', 'admin')}</div>
                        <img src={selectedDetail.item.image} alt={t(selectedDetail.item.name)} className="mt-2 h-40 w-full rounded-xl object-cover" />
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-gray-100 p-4">
                    <div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_description_label', 'admin')}</div>
                    <div className="mt-1 whitespace-pre-wrap text-gray-700">{t(selectedDetail.item.description) || t('not_available', 'admin')}</div>
                  </div>
                </div>
              )}

              {detailMode === 'view' && selectedDetail.type === 'coupon' && (
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_discount_label', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{getCouponValueLabel(selectedDetail.item)}</div></div>
                  <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_uses_label', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{selectedDetail.item.currentUses || 0}/{selectedDetail.item.maxUses || t('admin_unlimited_uses', 'admin')}</div></div>
                  <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_min_order_label', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{formatCurrency(selectedDetail.item.minOrderAmount || 0)}</div></div>
                  <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_active_label', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{selectedDetail.item.isActive ? t('detail_active_yes', 'admin') : t('detail_active_no', 'admin')}</div></div>
                  <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_start_label', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{formatDate(selectedDetail.item.startDate)}</div></div>
                  <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_end_label', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{formatDate(selectedDetail.item.endDate)}</div></div>
                </div>
              )}

              {detailMode === 'view' && selectedDetail.type === 'customer' && (
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_orders_label', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{selectedDetail.item.totalOrders || 0}</div></div>
                  <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_spent_label', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{formatCurrency(selectedDetail.item.totalSpent || 0)}</div></div>
                  <div className="rounded-xl border border-gray-100 p-4 sm:col-span-2"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_joined_label', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{formatDate(selectedDetail.item.createdAt)}</div></div>
                </div>
              )}

              {detailMode === 'view' && selectedDetail.type === 'category' && (
                <div className="rounded-xl border border-gray-100 p-4">
                  <div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_products', 'admin')}</div>
                  <div className="mt-1 text-2xl font-semibold text-gray-900">{selectedDetail.item.count}</div>
                </div>
              )}

              {detailMode === 'view' && selectedDetail.type === 'order' && (
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_total', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{formatCurrency(selectedDetail.item.totalPrice || 0)}</div></div>
                  <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('admin_status')}</div><div className="mt-1 font-semibold text-gray-900">{t(selectedDetail.item.isDelivered ? 'my_orders_status_delivered' : selectedDetail.item.isPaid ? 'my_orders_status_paid' : 'pending_payment')}</div></div>
                  <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_payment', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{String(selectedDetail.item.paymentMethod || t('not_updated')).toUpperCase()}</div></div>
                  <div className="rounded-xl border border-gray-100 p-4"><div className="text-xs uppercase tracking-wider text-gray-500">{t('detail_date', 'admin')}</div><div className="mt-1 font-semibold text-gray-900">{formatDate(selectedDetail.item.createdAt)}</div></div>
                </div>
              )}

              {detailMode === 'view' && selectedDetail.type === 'summary' && (
                <div className="space-y-3">
                  {selectedDetail.items.length > 0 ? (
                    selectedDetail.items.map((item, index) => (
                      <div key={`${selectedDetail.kind}-${index}`} className="rounded-xl border border-gray-100 p-4 text-sm">
                        {selectedDetail.kind === 'promotion' && (
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-gray-900">{item.code}</p>
                              <p className="text-gray-500">{item.currentUses || 0}/{item.maxUses || t('detail_infinity_symbol', 'admin')} · {item.discountType}</p>
                            </div>
                            <Badge variant="outline" className="border-red-200 text-red-700">{getCouponValueLabel(item)}</Badge>
                          </div>
                        )}
                        {selectedDetail.kind === 'order-status' && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-700">{t(item.name)}</span>
                            <span className="font-semibold text-gray-900">{item.value}</span>
                          </div>
                        )}
                        {selectedDetail.kind === 'payment' && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-700">{item.name}</span>
                            <span className="font-semibold text-gray-900">{item.value}</span>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500">{t('no_products_found')}</div>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-3">
                {detailMode === 'view' && (
                  <Button type="button" className="bg-red-600 text-white hover:bg-red-700" onClick={closeDetail}>
                    {t('dialog_close')}
                  </Button>
                )}
                {detailMode === 'view' && selectedDetail.type === 'product' && (
                  <Button type="button" variant="outline" className="gap-2 border-red-200 text-red-700 hover:bg-red-50" onClick={startEditDetail}>
                    <PencilLine className="h-4 w-4" />
                    {t('profile_edit')}
                  </Button>
                )}
                {detailMode === 'view' && selectedDetail.type === 'coupon' && (
                  <Button type="button" variant="outline" className="gap-2 border-red-200 text-red-700 hover:bg-red-50" onClick={startEditDetail}>
                    <PencilLine className="h-4 w-4" />
                    {t('profile_edit')}
                  </Button>
                )}
                {detailMode === 'view' && selectedDetail.type === 'customer' && (
                  <Button type="button" variant="outline" className="gap-2 border-red-200 text-red-700 hover:bg-red-50" onClick={startEditDetail}>
                    <PencilLine className="h-4 w-4" />
                    {t('profile_edit')}
                  </Button>
                )}
                {detailMode === 'view' && selectedDetail.type === 'order' && !selectedDetail.item.isDelivered && (
                  <Button type="button" className="bg-red-600 text-white hover:bg-red-700" onClick={handleMarkDelivered} disabled={isSavingDetail}>
                    {isSavingDetail ? t('profile_saving') : t('mark_delivered')}
                  </Button>
                )}
                {detailMode === 'edit' && (
                  <Button type="button" variant="outline" className="border-gray-200" onClick={() => { setDetailMode('view'); setDetailForm(null); setDetailImageFile(null); }}>
                    {t('cancel')}
                  </Button>
                )}
                {detailMode === 'edit' && (
                  <Button type="button" className="bg-red-600 text-white hover:bg-red-700" onClick={handleSaveDetail} disabled={isSavingDetail}>
                    {isSavingDetail ? t('profile_saving') : t('save')}
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default function StatisticsPage() {
  return (
    <AdminLayout>
      <StatisticsContent />
    </AdminLayout>
  );
}
