import { useState, useEffect, useCallback, useRef } from "react";
import { Package, ShoppingCart, Users, DollarSign, TrendingUp, TrendingDown, Calendar, Clock } from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useTranslation } from "../../lib/i18n";
import { useLanguage } from "../../lib/i18n";
import { getIntlLocale } from "../../lib/localeUtils";
import { useCurrencyConversion } from "../../hooks/useCurrencyConversion";
import { getProductName, getTranslatedValue } from "../../lib/data";
import { analyticsAPI } from "../../lib/api";
import { onOrderDeleted, offEvent } from "../../lib/socket";
import { withAdminLayout } from "../../components/admin/withAdminLayout";
import { DateRangePickerModal } from "../../components/admin/DateRangePickerModal";
import { UI_EMOJI } from "../../lib/uiEmoji";

// In-memory cache manager (safe, TTL-based, no localStorage)
interface CacheEntry {
  data: any;
  expiresAt: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const createCacheManager = () => {
  const cacheRef = { current: new Map<string, CacheEntry>() };

  return {
    get: (key: string) => {
      const entry = cacheRef.current.get(key);
      if (!entry) return null;

      // Check if expired
      if (Date.now() > entry.expiresAt) {
        cacheRef.current.delete(key);
        return null;
      }
      return entry.data;
    },
    set: (key: string, data: any) => {
      cacheRef.current.set(key, {
        data,
        expiresAt: Date.now() + CACHE_TTL,
      });
    },
    clear: () => {
      cacheRef.current.clear();
    },
    getRef: () => cacheRef.current, // For cleanup
  };
};

type TimeFrame = 'day' | 'month' | 'quarter' | 'year';

const calculateDaysDifference = (startDate: Date, endDate: Date): number => {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((endDate.getTime() - startDate.getTime()) / oneDay) + 1;
};

// Convert local date to ISO string for API (YYYY-MM-DD format)
const dateToISOString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Convert ISO date string (YYYY-MM-DD) to input value for date picker
const getInputDateValue = (date: Date): string => {
  return dateToISOString(date);
};

const getStatusDisplayName = (status: string, t: any): string => {
  const statusMap: Record<string, string> = {
    pending: t('order_status_pending', 'admin'),
    paid: t('order_status_paid', 'admin'),
    delivered: t('order_status_delivered', 'admin'),
    processing: t('status_processing', 'orders'),
    cancelled: t('order_status_cancelled', 'admin'),
  };
  return statusMap[status] || status;
};

function ProductNameDisplay({ product }: { product: any }) {
  const { locale } = useLanguage();

  const displayName = getProductName(product.name, locale);
  return <>{displayName}</>;
}

function DashboardContent() {
  const { t, loadNamespace, locale } = useTranslation();
  const { formatConvertedPrice, targetCurrency } = useCurrencyConversion();
  const formatDashboardTotal = (amount: number) =>
    formatConvertedPrice(amount, targetCurrency);
  const formatPercentage = (value: number) =>
    new Intl.NumberFormat(getIntlLocale(locale), {
      style: 'percent',
      signDisplay: 'always',
      maximumFractionDigits: 0,
    }).format(value);
  const formatOrderPrice = (amount: number, sourceCurrency: string) => formatConvertedPrice(amount, sourceCurrency);
  const cacheManagerRef = useRef(createCacheManager());

  const [stats, setStats] = useState({
    totalProducts: 0,
    inStockProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    totalCustomers: 0,
  });

  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [paidOrders, setPaidOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [orderStatusData, setOrderStatusData] = useState<any[]>([]);
  const [topProductsChartData, setTopProductsChartData] = useState<any[]>([]);
  const [ordersTimelineData, setOrdersTimelineData] = useState<any[]>([]);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('month');

  // Search & Filter states
  const [recentOrdersSearch, setRecentOrdersSearch] = useState("");
  const [recentOrdersStatus, setRecentOrdersStatus] = useState<'all' | 'pending' | 'paid' | 'delivered'>('all');
  const [topProductsSearch, setTopProductsSearch] = useState("");
  const [topCustomersSearch, setTopCustomersSearch] = useState("");
  const [paidOrdersSearch, setPaidOrdersSearch] = useState("");
  const [paidOrdersStatus, setPaidOrdersStatus] = useState<'all' | 'pending' | 'paid' | 'delivered'>('all');

  // Helper function to get default date ranges
  const getDefaultDateRanges = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentQuarter = Math.ceil((currentMonth + 1) / 3);

    return {
      day: {
        start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(now),
      },
      month: {
        startMonth: Math.max(0, currentMonth - 2),
        startYear: currentMonth < 3 ? currentYear - 1 : currentYear,
        endMonth: currentMonth,
        endYear: currentYear,
      },
      quarter: {
        startQuarter: currentQuarter >= 2 ? currentQuarter - 1 : 4,
        startYear: currentQuarter >= 2 ? currentYear : currentYear - 1,
        endQuarter: currentQuarter,
        endYear: currentYear,
      },
      year: {
        startYear: currentYear - 1,
        endYear: currentYear,
      },
    };
  };

  const [showDateModal, setShowDateModal] = useState(false);
  const [dayRange, setDayRange] = useState(() => getDefaultDateRanges().day);
  const [monthRange, setMonthRange] = useState(() => getDefaultDateRanges().month);
  const [quarterRange, setQuarterRange] = useState(() => getDefaultDateRanges().quarter);
  const [yearRange, setYearRange] = useState(() => getDefaultDateRanges().year);
  const [tempDateSelection, setTempDateSelection] = useState<any>(null);

  const fetchChartDataCallback = useCallback(
    async (
      period: TimeFrame,
      monthRangeData?: typeof monthRange,
      dayRangeData?: typeof dayRange,
      quarterRangeData?: typeof quarterRange,
      yearRangeData?: typeof yearRange
    ) => {
      try {
        let startDate = new Date();
        let endDate = new Date();

        if (period === 'day') {
          startDate = dayRangeData?.start || dayRange.start;
          endDate = dayRangeData?.end || dayRange.end;
        } else if (period === 'month') {
          const mRange = monthRangeData || monthRange;
          startDate = new Date(mRange.startYear, mRange.startMonth, 1);
          endDate = new Date(mRange.endYear, mRange.endMonth + 1, 0);
        } else if (period === 'quarter') {
          const qRange = quarterRangeData || quarterRange;
          startDate = new Date(qRange.startYear, (qRange.startQuarter - 1) * 3, 1);
          endDate = new Date(qRange.endYear, qRange.endQuarter * 3, 0);
        } else if (period === 'year') {
          const yRange = yearRangeData || yearRange;
          startDate = new Date(yRange.startYear, 0, 1);
          endDate = new Date(yRange.endYear, 11, 31);
        }

        const days = calculateDaysDifference(startDate, endDate);
        const [revenueData, statusData, topProductsData] = await Promise.all([
          analyticsAPI.getRevenueTimeline(period, days, targetCurrency, startDate, endDate, locale),
          analyticsAPI.getOrderStatus(days, startDate, endDate),
          analyticsAPI.getTopProducts(5, days, startDate, endDate, locale),
        ]);

        setRevenueData(revenueData);
        setOrderStatusData(statusData);
        setTopProductsChartData(topProductsData);
        setOrdersTimelineData(revenueData.map((item: any) => ({
          period: item.period,
          orders: item.count || 0,
        })));
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[Dashboard] Error fetching chart data:', error);
        }
      }
    },
    [locale, targetCurrency]
  );

  const fetchDashboardDataCallback = useCallback(async () => {
    try {
      setIsLoading(true);
      const cacheKey = `dashboard_${30}_${locale}_${targetCurrency}`; // Include locale and currency in cache key
      let dashboardData = cacheManagerRef.current.get(cacheKey);
      let topCustomersData, paidOrdersData;

      // Only fetch from API if cache is empty
      if (!dashboardData) {
        const [data, customers, orders] = await Promise.all([
          analyticsAPI.getDashboardData(30, locale, targetCurrency),
          analyticsAPI.getTopCustomers(5, 1, '-totalSpent', 0, locale, targetCurrency),
          analyticsAPI.getPaidOrders(5, 1, '-createdAt', 30, locale),
        ]);

        dashboardData = data;
        topCustomersData = customers;
        paidOrdersData = orders;
        cacheManagerRef.current.set(cacheKey, data);
      }

      // Always update stats when data is available
      setStats({
        totalProducts: dashboardData.stats.totalProducts,
        inStockProducts: dashboardData.stats.inStockProducts,
        totalOrders: dashboardData.stats.totalOrders,
        totalRevenue: dashboardData.stats.totalRevenue,
        totalCustomers: dashboardData.stats.totalCustomers,
      });
      setRecentOrders(dashboardData.recentOrders || []);
      setTopProducts(dashboardData.topProducts || []);
      setTopCustomers(topCustomersData?.data || []);
      setPaidOrders(paidOrdersData?.data || []);

      const defaultRanges = getDefaultDateRanges();
      await fetchChartDataCallback('month', defaultRanges.month);
    } finally {
      setIsLoading(false);
    }
  }, [locale, targetCurrency, fetchChartDataCallback]);

  useEffect(() => {
    Promise.all([
      loadNamespace('dashboard'),
      loadNamespace('ui-common'),
      loadNamespace('admin'),
    ]).then(() => {
      fetchDashboardDataCallback();
    });

    // Listen to order deleted event and refetch dashboard data
    const handleOrderDeleted = () => {
      // Clear cache when data changes
      cacheManagerRef.current.clear();
      fetchDashboardDataCallback();
    };

    onOrderDeleted(handleOrderDeleted);

    // Cleanup listener & cache on unmount
    return () => {
      offEvent('order-deleted');
      cacheManagerRef.current.clear(); // Prevent memory leak
    };
  }, [loadNamespace, fetchDashboardDataCallback]);

  useEffect(() => {
    const defaultRanges = getDefaultDateRanges();
    void fetchChartDataCallback('month', defaultRanges.month);
  }, [locale, targetCurrency, fetchChartDataCallback]);




  // Get order status
  const getOrderStatus = (order: any): 'pending' | 'paid' | 'delivered' => {
    if (order.isDelivered) return 'delivered';
    if (order.isPaid) return 'paid';
    return 'pending';
  };

  // Filter Recent Orders
  const filteredRecentOrders = recentOrders.filter((order) => {
    const matchesSearch =
      order._id?.toLowerCase().includes(recentOrdersSearch.toLowerCase()) ||
      order.customerName?.toLowerCase().includes(recentOrdersSearch.toLowerCase());

    if (recentOrdersStatus === 'all') return matchesSearch;
    return matchesSearch && getOrderStatus(order) === recentOrdersStatus;
  });

  // Filter Top Products
  const filteredTopProducts = topProducts.filter((product) => {
    const productName = getProductName(product.name, locale);
    return productName.toLowerCase().includes(topProductsSearch.toLowerCase());
  });

  // Filter Top Customers
  const filteredTopCustomers = topCustomers.filter((customer) => {
    return (
      customer.name?.toLowerCase().includes(topCustomersSearch.toLowerCase()) ||
      customer.email?.toLowerCase().includes(topCustomersSearch.toLowerCase())
    );
  });

  // Filter Paid Orders
  const filteredPaidOrders = paidOrders.filter((order) => {
    const matchesSearch =
      order._id?.toLowerCase().includes(paidOrdersSearch.toLowerCase()) ||
      order.customerName?.toLowerCase().includes(paidOrdersSearch.toLowerCase());

    if (paidOrdersStatus === 'all') return matchesSearch;
    return matchesSearch && getOrderStatus(order) === paidOrdersStatus;
  });

  const dashboardStats = [
    {
      icon: Package,
      label: t('menu_products', 'common'),
      value: stats.totalProducts,
      subValue: t('in_stock', 'common').replace('{count}', String(stats.inStockProducts ?? 0)),
      trend: formatPercentage(0.05),
      trendUp: true,
    },
    {
      icon: ShoppingCart,
      label: t('menu_orders', 'common'),
      value: stats.totalOrders,
      subValue: t('status', 'admin'),
      trend: formatPercentage(0.12),
      trendUp: true,
    },
    {
      icon: DollarSign,
      label: t('revenue', 'admin'),
      value: formatDashboardTotal(stats.totalRevenue),
      subValue: t('revenue_stats', 'admin'),
      trend: formatPercentage(0.08),
      trendUp: true,
    },
    {
      icon: Users,
      label: t('menu_customers', 'common'),
      value: stats.totalCustomers,
      subValue: t('active_customers', 'admin'),
      trend: formatPercentage(0.15),
      trendUp: true,
    },
  ];

  const COLORS = ['#ef4444', '#3b82f6', '#10b981'];

  const timeFrameOptions: { label: string; value: TimeFrame }[] = [
    { label: t('period_day', 'admin'), value: 'day' },
    { label: t('period_month', 'admin'), value: 'month' },
    { label: t('period_quarter', 'admin'), value: 'quarter' },
    { label: t('period_year', 'admin'), value: 'year' },
  ];

  const handleOpenDateModal = (frame: TimeFrame) => {
    setTimeFrame(frame);
    let selection: any = { type: frame };
    if (frame === 'day') {
      selection = { type: 'day', start: new Date(dayRange.start), end: new Date(dayRange.end) };
    } else if (frame === 'month') {
      selection = { type: 'month', startMonth: monthRange.startMonth, startYear: monthRange.startYear, endMonth: monthRange.endMonth, endYear: monthRange.endYear };
    } else if (frame === 'quarter') {
      selection = { type: 'quarter', startQuarter: quarterRange.startQuarter, startYear: quarterRange.startYear, endQuarter: quarterRange.endQuarter, endYear: quarterRange.endYear };
    } else if (frame === 'year') {
      selection = { type: 'year', startYear: yearRange.startYear, endYear: yearRange.endYear };
    }
    setTempDateSelection(selection);
    setShowDateModal(true);
  };

  const handleApplyDateSelection = async () => {
    if (!tempDateSelection) return;
    const selectedType = tempDateSelection.type as TimeFrame;
    if (tempDateSelection.type === 'day') {
      setDayRange({ start: tempDateSelection.start, end: tempDateSelection.end });
    } else if (tempDateSelection.type === 'month') {
      setMonthRange({ startMonth: tempDateSelection.startMonth, startYear: tempDateSelection.startYear, endMonth: tempDateSelection.endMonth, endYear: tempDateSelection.endYear });
    } else if (tempDateSelection.type === 'quarter') {
      setQuarterRange({ startQuarter: tempDateSelection.startQuarter, startYear: tempDateSelection.startYear, endQuarter: tempDateSelection.endQuarter, endYear: tempDateSelection.endYear });
    } else if (tempDateSelection.type === 'year') {
      setYearRange({ startYear: tempDateSelection.startYear, endYear: tempDateSelection.endYear });
    }
    setTimeFrame(selectedType);
    setShowDateModal(false);
    setTempDateSelection(null);
    try {
      if (selectedType === 'day') {
        await fetchChartDataCallback(selectedType, undefined, { start: tempDateSelection.start, end: tempDateSelection.end });
      } else if (selectedType === 'month') {
        await fetchChartDataCallback(selectedType, { startMonth: tempDateSelection.startMonth, startYear: tempDateSelection.startYear, endMonth: tempDateSelection.endMonth, endYear: tempDateSelection.endYear });
      } else if (selectedType === 'quarter') {
        await fetchChartDataCallback(selectedType, undefined, undefined, { startQuarter: tempDateSelection.startQuarter, startYear: tempDateSelection.startYear, endQuarter: tempDateSelection.endQuarter, endYear: tempDateSelection.endYear });
      } else if (selectedType === 'year') {
        await fetchChartDataCallback(selectedType, undefined, undefined, undefined, { startYear: tempDateSelection.startYear, endYear: tempDateSelection.endYear });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Dashboard] Error changing time frame:', error);
      }
    }
  };

  const getDateRangeDisplay = () => {
    const dateLocale = getIntlLocale(locale);
    if (timeFrame === 'day') {
      const startFormatted = dayRange.start.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });
      const endFormatted = dayRange.end.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `${startFormatted} ${UI_EMOJI.arrowRight} ${endFormatted}`;
    } else if (timeFrame === 'month') {
      const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
      const startMonth = months[monthRange.startMonth];
      const endMonth = months[monthRange.endMonth];
      return `${t('month', 'admin')} ${startMonth}/${monthRange.startYear} ${UI_EMOJI.arrowRight} ${t('month', 'admin')} ${endMonth}/${monthRange.endYear}`;
    } else if (timeFrame === 'quarter') {
      return `${t('quarter_display', 'admin')}${quarterRange.startQuarter}/${quarterRange.startYear} ${UI_EMOJI.arrowRight} ${t('quarter_display', 'admin')}${quarterRange.endQuarter}/${quarterRange.endYear}`;
    } else if (timeFrame === 'year') {
      return `${t('year', 'admin')} ${yearRange.startYear} ${UI_EMOJI.arrowRight} ${t('year', 'admin')} ${yearRange.endYear}`;
    }
    return '';
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="text-center">
          <div className="inline-block relative w-12 h-12 mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200 border-t-red-600 animate-spin"></div>
          </div>
          <p className="text-gray-600 font-medium">{t('loading', 'common')}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1>{t('title', 'admin')}</h1>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2 bg-white rounded-lg border p-2">
            <Calendar className="w-5 h-5 text-gray-600" />
            {timeFrameOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleOpenDateModal(option.value)}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  timeFrame === option.value
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                data-fusion-element-id={`timeframe-${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {timeFrame && (
            <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 font-medium">
              {getDateRangeDisplay()}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {dashboardStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={`stat-${index}-${stat.label}`} className="bg-white rounded-lg border p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                  <Icon className="w-6 h-6 text-red-600" />
                </div>
                <div className={`flex items-center gap-1 text-sm ${stat.trendUp ? "text-green-600" : "text-red-600"}`}>
                  {stat.trendUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {stat.trend}
                </div>
              </div>
              <div className="text-2xl mb-1">{stat.value}</div>
              <div className="text-sm text-gray-600">{stat.label}</div>
              <div className="text-xs text-gray-500 mt-1">{stat.subValue}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-linear-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 p-4 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{t('revenue_trend', 'admin')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('revenue_by_time', 'admin')}</p>
            </div>
            <div className="w-12 h-12 bg-linear-to-br from-red-400 to-red-600 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
          {revenueData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="period" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  formatter={(value) => [formatDashboardTotal(Number(value ?? 0)), t('revenue_label', 'admin')]}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line type="monotone" dataKey="revenue" stroke="#ef4444" name={t('revenue_label', 'admin')} strokeWidth={3} dot={{ fill: '#ef4444', r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center py-16 text-gray-500">{t('no_data', 'common')}</div>
          )}
        </div>

        <div className="bg-linear-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 p-4 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{t('orders_trend', 'admin')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('orders_by_time', 'admin')}</p>
            </div>
            <div className="w-12 h-12 bg-linear-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
          </div>
          {ordersTimelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={ordersTimelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="period" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  formatter={(value: any) => [`${value || 0} ${t('menu_orders', 'common')}`, t('menu_orders', 'common')]}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line type="monotone" dataKey="orders" stroke="#3b82f6" name={t('orders_label', 'admin')} strokeWidth={3} dot={{ fill: '#3b82f6', r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center py-16 text-gray-500">{t('no_data')}</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-linear-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 p-4 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{t('order_status_distribution')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('order_status_ratio')}</p>
            </div>
            <div className="w-12 h-12 bg-linear-to-br from-emerald-300 to-emerald-500 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
          {orderStatusData.length > 0 && orderStatusData.some(d => d.value > 0) ? (
            <div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={orderStatusData} cx="50%" cy="45%" outerRadius={70} dataKey="value">
                    {orderStatusData.map((entry, index) => (
                      <Cell key={`status-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [`${value || 0} ${t('menu_orders')}`, t('status')]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-6 space-y-2">
                {orderStatusData.map((status: any, index: number) => (
                  <div key={`status-legend-${index}`} className="flex items-center gap-3 p-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <p className="font-medium">{getStatusDisplayName(status.name, t)}: {status.value} {t('menu_orders')}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 text-gray-500">{t('no_data')}</div>
          )}
        </div>

        <div className="bg-linear-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 p-4 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{t('top_products')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('top_products_desc')}</p>
            </div>
            <div className="w-12 h-12 bg-linear-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
          </div>
          {topProductsChartData.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={topProductsChartData} cx="50%" cy="45%" innerRadius={35} outerRadius={70} dataKey="count">
                    {topProductsChartData.map((entry: any, index: number) => (
                      <Cell key={`product-cell-${index}`} fill={['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][index % 5]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [`${value || 0} ${t('products_unit')}`, 'quantity']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-6 space-y-2">
                {topProductsChartData.map((product: any, index: number) => {
                  const displayName = getProductName(product, locale);

                  return (
                  <div key={`legend-${index}`} className="flex items-start gap-3 p-2 text-sm" title={displayName}>
                    <div className="w-3 h-3 rounded-full mt-1" style={{ backgroundColor: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][index % 5] }} />
                    <p className="font-medium flex-1">{displayName}</p>
                    <span className="text-gray-600 ml-2">{product.count}</span>
                  </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-gray-500">{t('no_data')}</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <h2>{t('recent_orders', 'admin')}</h2>
          </div>
          <div className="flex flex-col gap-3 border-b bg-gray-50 p-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="w-full sm:flex-1 sm:min-w-64">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('search', 'common')}</label>
              <input
                type="text"
                placeholder={t('search_order_customer', 'admin')}
                value={recentOrdersSearch}
                onChange={(e) => setRecentOrdersSearch(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="w-full sm:min-w-48 sm:w-auto">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('status', 'common')}</label>
              <select
                value={recentOrdersStatus}
                onChange={(e) => setRecentOrdersStatus(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="all">{t('all_status', 'orders')}</option>
                <option value="pending">{t('order_status_pending', 'orders')}</option>
                <option value="paid">{t('order_status_paid', 'orders')}</option>
                <option value="delivered">{t('order_status_delivered', 'orders')}</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-white text-xs uppercase">
                <tr>
                  <th className="px-6 py-3 text-left">{t('order_id', 'orders')}</th>
                  <th className="px-6 py-3 text-left">{t('customer', 'common')}</th>
                  <th className="px-6 py-3 text-left">{t('value', 'common')}</th>
                  <th className="px-6 py-3 text-left">{t('status', 'common')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRecentOrders.map((order, idx) => (
                  <tr key={order._id || `order-${idx}`} className="text-sm">
                    <td className="px-6 py-4">{order._id?.slice(-6).toUpperCase()}</td>
                    <td className="px-6 py-4">{order.customerName || t('not_updated', 'common')}</td>
                    <td className="px-6 py-4">{formatOrderPrice(order.totalPrice, order.currencyCode)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded ${order.isDelivered ? "bg-green-100 text-green-800" : order.isPaid ? "bg-blue-100 text-blue-800" : "bg-yellow-100 text-yellow-800"}`}>
                        {order.isDelivered ? t('order_status_delivered', 'orders') : order.isPaid ? t('order_status_paid', 'orders') : t('order_status_pending', 'orders')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <h2>{t('highly_rated_products', 'admin')}</h2>
          </div>
          <div className="p-4 border-b bg-gray-50">
            <input
              type="text"
              placeholder={t('search_product', 'products')}
              value={topProductsSearch}
              onChange={(e) => setTopProductsSearch(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="p-6 space-y-4">
            {filteredTopProducts.length > 0 ? (
              filteredTopProducts.map((product, index) => {
                const fallbackName = getProductName(product.name, locale);
                return (
                  <div key={product._id || `product-${index}`} className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center shrink-0 text-red-600 font-medium">{index + 1}</div>
                    {product.image && <img src={product.image} alt={fallbackName} className="w-16 h-16 object-cover rounded" />}
                    <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 line-clamp-2"><ProductNameDisplay product={product} /></p>
                    <p className="text-sm text-gray-600">{product.numReviews || 0} {t('reviews', 'products')}</p>
                  </div>
                    <div className="text-right font-medium text-red-600">{formatConvertedPrice(product.price)}</div>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-gray-500 text-center py-4">{t('no_data', 'common')}</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <h2>{t('top_customers', 'admin')}</h2>
          </div>
          <div className="p-4 border-b bg-gray-50">
            <input
              type="text"
              placeholder={t('search_customer_email', 'admin')}
              value={topCustomersSearch}
              onChange={(e) => setTopCustomersSearch(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="p-6 space-y-4">
            {filteredTopCustomers.length > 0 ? (
              filteredTopCustomers.map((customer, index) => (
                <div key={customer._id || `customer-${index}`} className="flex items-center gap-4 pb-4 border-b last:border-b-0">
                  <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center shrink-0 text-blue-600 font-medium">{index + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 line-clamp-2">{customer.name}</p>
                    <p className="text-sm text-gray-600">{customer.email || customer.phone || t('not_updated', 'common')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-blue-600">{formatDashboardTotal(customer.totalSpent)}</p>
                    <p className="text-xs text-gray-500">{customer.totalOrders || 0} {t('orders', 'orders')}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500 text-center py-4">{t('no_customer_data', 'admin')}</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <h2>{t('paid_orders', 'admin')}</h2>
          </div>
          <div className="flex flex-col gap-3 border-b bg-gray-50 p-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="w-full sm:flex-1 sm:min-w-64">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('search', 'common')}</label>
              <input
                type="text"
                placeholder={t('search_order_customer', 'admin')}
                value={paidOrdersSearch}
                onChange={(e) => setPaidOrdersSearch(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="w-full sm:min-w-48 sm:w-auto">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('status', 'common')}</label>
              <select
                value={paidOrdersStatus}
                onChange={(e) => setPaidOrdersStatus(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="all">{t('all_status', 'orders')}</option>
                <option value="pending">{t('order_status_pending', 'orders')}</option>
                <option value="paid">{t('order_status_paid', 'orders')}</option>
                <option value="delivered">{t('order_status_delivered', 'orders')}</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-white text-xs uppercase">
                <tr>
                  <th className="px-6 py-3 text-left">{t('order_id', 'orders')}</th>
                  <th className="px-6 py-3 text-left">{t('customer', 'common')}</th>
                  <th className="px-6 py-3 text-left">{t('value', 'common')}</th>
                  <th className="px-6 py-3 text-left">{t('payment_date', 'admin')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredPaidOrders.length > 0 ? (
                  filteredPaidOrders.map((order, idx) => (
                    <tr key={order._id || `order-${idx}`} className="text-sm">
                      <td className="px-6 py-4">{order._id?.slice(-6).toUpperCase()}</td>
                      <td className="px-6 py-4">{order.customerName || t('not_updated', 'common')}</td>
                      <td className="px-6 py-4">{formatOrderPrice(order.totalPrice, order.currencyCode)}</td>
                      <td className="px-6 py-4">{order.createdAt ? new Date(order.createdAt).toLocaleDateString(getIntlLocale(locale)) : t('not_updated', 'common')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                      {t('no_paid_orders', 'admin')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <DateRangePickerModal
        open={showDateModal}
        onOpenChange={(open: boolean) => {
          setShowDateModal(open);
          if (!open) {
            setTempDateSelection(null);
          }
        }}
        selection={tempDateSelection}
        onSelectionChange={setTempDateSelection}
        onApply={handleApplyDateSelection}
      />
    </div>
  );
}

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default withAdminLayout(DashboardContent, {
  permission: 'admin',
  featureName: 'Dashboard'
});
