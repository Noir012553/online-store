import { useState, useEffect } from "react";
import { Package, ShoppingCart, Users, DollarSign, TrendingUp, TrendingDown, Calendar, Clock, X } from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useTranslation } from "../../lib/i18n";
import { formatCurrency } from "../../lib/utils";
import { analyticsAPI } from "../../lib/api";
import { onOrderDeleted, offEvent } from "../../lib/socket";
import AdminLayout from "../../components/admin/_AdminLayout";

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

// Convert Vietnamese status names from API to translation keys
const mapApiStatusToKey = (apiStatus: string): 'pending' | 'paid' | 'delivered' => {
  const statusMapping: Record<string, 'pending' | 'paid' | 'delivered'> = {
    'Chờ thanh toán': 'pending',
    'Chưa thanh toán': 'pending',
    'Đã thanh toán': 'paid',
    'Đã giao': 'delivered',
  };
  return statusMapping[apiStatus] || 'pending';
};

// Convert status values to display names
const getStatusDisplayName = (apiStatus: string, t: any): string => {
  const statusKey = mapApiStatusToKey(apiStatus);
  const displayNameMap: Record<string, string> = {
    pending: t('pending', 'dashboard'),
    paid: t('paid', 'dashboard'),
    delivered: t('delivered', 'dashboard'),
  };
  return displayNameMap[statusKey];
};

// Get product name in current language
const getProductName = (product: any, currentLocale: string): string => {
  if (typeof product.name === 'object' && product.name !== null) {
    return product.name[currentLocale] || Object.values(product.name)[0] || '';
  }
  return product.name || '';
};

function DashboardContent() {
  const { t, loadNamespace, locale } = useTranslation();

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

  useEffect(() => {
    Promise.all([
      loadNamespace('dashboard'),
      loadNamespace('ui-common'),
      loadNamespace('admin'),
    ]).then(() => {
      fetchDashboardData();
    });

    // Listen to order deleted event and refetch dashboard data
    const handleOrderDeleted = () => {
      fetchDashboardData();
    };

    onOrderDeleted(handleOrderDeleted);

    // Cleanup listener
    return () => {
      offEvent('order-deleted');
    };
  }, [loadNamespace]);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      const [dashboardData, topCustomersData, paidOrdersData] = await Promise.all([
        analyticsAPI.getDashboardData(30),
        analyticsAPI.getTopCustomers(5, 1, '-totalSpent', 0),
        analyticsAPI.getPaidOrders(5, 1, '-createdAt', 30),
      ]);
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
      await fetchChartData('month', defaultRanges.month);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchChartData = async (
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
        analyticsAPI.getRevenueTimeline(period, days, startDate, endDate),
        analyticsAPI.getOrderStatus(days, startDate, endDate),
        analyticsAPI.getTopProducts(5, days, startDate, endDate),
      ]);

      setRevenueData(revenueData);
      setOrderStatusData(statusData);
      setTopProductsChartData(topProductsData);
      setOrdersTimelineData(revenueData.map((item: any) => ({
        period: item.period,
        orders: item.count || 0,
      })));
    } catch (error) {}
  };



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
    const productName = getProductName(product, locale);
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
      label: t('menu_products', 'admin'),
      value: stats.totalProducts,
      subValue: `${stats.inStockProducts} ${t('in_stock', 'dashboard')}`,
      trend: "+5%",
      trendUp: true,
    },
    {
      icon: ShoppingCart,
      label: t('menu_orders', 'admin'),
      value: stats.totalOrders,
      subValue: t('status', 'dashboard'),
      trend: "+12%",
      trendUp: true,
    },
    {
      icon: DollarSign,
      label: t('revenue', 'dashboard'),
      value: formatCurrency(stats.totalRevenue),
      subValue: t('revenue_stats', 'dashboard'),
      trend: "+8%",
      trendUp: true,
    },
    {
      icon: Users,
      label: t('menu_customers', 'admin'),
      value: stats.totalCustomers,
      subValue: t('active_customers', 'dashboard'),
      trend: "+15%",
      trendUp: true,
    },
  ];

  const COLORS = ['#ef4444', '#3b82f6', '#10b981'];

  const timeFrameOptions: { label: string; value: TimeFrame }[] = [
    { label: t('period_day', 'dashboard'), value: 'day' },
    { label: t('period_month', 'dashboard'), value: 'month' },
    { label: t('period_quarter', 'dashboard'), value: 'quarter' },
    { label: t('period_year', 'dashboard'), value: 'year' },
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
        await fetchChartData(selectedType, undefined, { start: tempDateSelection.start, end: tempDateSelection.end });
      } else if (selectedType === 'month') {
        await fetchChartData(selectedType, { startMonth: tempDateSelection.startMonth, startYear: tempDateSelection.startYear, endMonth: tempDateSelection.endMonth, endYear: tempDateSelection.endYear });
      } else if (selectedType === 'quarter') {
        await fetchChartData(selectedType, undefined, undefined, { startQuarter: tempDateSelection.startQuarter, startYear: tempDateSelection.startYear, endQuarter: tempDateSelection.endQuarter, endYear: tempDateSelection.endYear });
      } else if (selectedType === 'year') {
        await fetchChartData(selectedType, undefined, undefined, undefined, { startYear: tempDateSelection.startYear, endYear: tempDateSelection.endYear });
      }
    } catch (error) {}
  };

  const getDateRangeDisplay = () => {
    const locale = 'vi-VN';
    if (timeFrame === 'day') {
      const startFormatted = dayRange.start.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
      const endFormatted = dayRange.end.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `${startFormatted} → ${endFormatted}`;
    } else if (timeFrame === 'month') {
      const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
      const startMonth = months[monthRange.startMonth];
      const endMonth = months[monthRange.endMonth];
      return `${t('month', 'dashboard')} ${startMonth}/${monthRange.startYear} → ${t('month', 'dashboard')} ${endMonth}/${monthRange.endYear}`;
    } else if (timeFrame === 'quarter') {
      return `${t('quarter_display', 'admin')}${quarterRange.startQuarter}/${quarterRange.startYear} → ${t('quarter_display', 'admin')}${quarterRange.endQuarter}/${quarterRange.endYear}`;
    } else if (timeFrame === 'year') {
      return `${t('year', 'dashboard')} ${yearRange.startYear} → ${t('year', 'dashboard')} ${yearRange.endYear}`;
    }
    return '';
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <p>{t('loading')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1>{t('title', 'dashboard')}</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white rounded-lg border p-2">
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
            <div key={`stat-${index}-${stat.label}`} className="bg-white rounded-lg border p-6">
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
        <div className="bg-linear-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{t('revenue_trend', 'dashboard')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('revenue_by_time', 'dashboard')}</p>
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
                  formatter={(value: any) => [formatCurrency(Number(value) || 0), t('revenue_label', 'dashboard')]}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line type="monotone" dataKey="revenue" stroke="#ef4444" name={t('revenue_label', 'dashboard')} strokeWidth={3} dot={{ fill: '#ef4444', r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center py-16 text-gray-500">{t('no_data', 'dashboard')}</div>
          )}
        </div>

        <div className="bg-linear-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{t('orders_trend', 'dashboard')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('orders_by_time', 'dashboard')}</p>
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
                  formatter={(value: any) => [`${value || 0} ${t('menu_orders', 'admin')}`, t('menu_orders', 'admin')]}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line type="monotone" dataKey="orders" stroke="#3b82f6" name={t('orders_label', 'dashboard')} strokeWidth={3} dot={{ fill: '#3b82f6', r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center py-16 text-gray-500">{t('no_data', 'dashboard')}</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-linear-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{t('order_status_distribution', 'dashboard')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('order_status_ratio', 'dashboard')}</p>
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
                  <Tooltip formatter={(value: any) => [`${value || 0} ${t('menu_orders', 'admin')}`, t('status', 'dashboard')]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-6 space-y-2">
                {orderStatusData.map((status: any, index: number) => (
                  <div key={`status-legend-${index}`} className="flex items-center gap-3 p-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <p className="font-medium">{getStatusDisplayName(status.name, t)}: {status.value} {t('menu_orders', 'admin')}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 text-gray-500">{t('no_data', 'dashboard')}</div>
          )}
        </div>

        <div className="bg-linear-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{t('top_products', 'dashboard')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('top_products_desc', 'dashboard')}</p>
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
                  <Tooltip formatter={(value: any) => [`${value || 0} ${t('products_unit', 'dashboard')}`, 'quantity']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-6 space-y-2">
                {topProductsChartData.map((product: any, index: number) => (
                  <div key={`legend-${index}`} className="flex items-start gap-3 p-2 text-sm">
                    <div className="w-3 h-3 rounded-full mt-1" style={{ backgroundColor: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][index % 5] }} />
                    <p className="font-medium flex-1">{getProductName(product, locale)}</p>
                    <span className="text-gray-600 ml-2">{product.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-gray-500">{t('no_data', 'dashboard')}</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <h2>{t('recent_orders', 'dashboard')}</h2>
          </div>
          <div className="p-4 border-b bg-gray-50 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-64">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('search', 'dashboard')}</label>
              <input
                type="text"
                placeholder={t('search_order_customer', 'dashboard')}
                value={recentOrdersSearch}
                onChange={(e) => setRecentOrdersSearch(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="min-w-48">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('status', 'dashboard')}</label>
              <select
                value={recentOrdersStatus}
                onChange={(e) => setRecentOrdersStatus(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="all">{t('all_status', 'dashboard')}</option>
                <option value="pending">{t('pending_payment')}</option>
                <option value="paid">{t('paid_status')}</option>
                <option value="delivered">{t('delivered', 'dashboard')}</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white text-xs uppercase">
                <tr>
                  <th className="px-6 py-3 text-left">{t('order_id', 'dashboard')}</th>
                  <th className="px-6 py-3 text-left">{t('customer', 'dashboard')}</th>
                  <th className="px-6 py-3 text-left">{t('value', 'dashboard')}</th>
                  <th className="px-6 py-3 text-left">{t('status', 'dashboard')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRecentOrders.map((order, idx) => (
                  <tr key={order._id || `order-${idx}`} className="text-sm">
                    <td className="px-6 py-4">{order._id?.slice(-6).toUpperCase()}</td>
                    <td className="px-6 py-4">{order.customerName || t('not_updated', 'dashboard')}</td>
                    <td className="px-6 py-4">{formatCurrency(order.totalPrice)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded ${order.isDelivered ? "bg-green-100 text-green-800" : order.isPaid ? "bg-blue-100 text-blue-800" : "bg-yellow-100 text-yellow-800"}`}>
                        {order.isDelivered ? t('delivered', 'dashboard') : order.isPaid ? t('paid', 'dashboard') : t('pending', 'dashboard')}
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
            <h2>{t('highly_rated_products', 'dashboard')}</h2>
          </div>
          <div className="p-4 border-b bg-gray-50">
            <input
              type="text"
              placeholder={t('search_product', 'dashboard')}
              value={topProductsSearch}
              onChange={(e) => setTopProductsSearch(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="p-6 space-y-4">
            {filteredTopProducts.length > 0 ? (
              filteredTopProducts.map((product, index) => {
                const productName = getProductName(product, locale);
                return (
                  <div key={product._id || `product-${index}`} className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center shrink-0 text-red-600 font-medium">{index + 1}</div>
                    {product.image && <img src={product.image} alt={productName} className="w-16 h-16 object-cover rounded" />}
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{productName}</p>
                      <p className="text-sm text-gray-600">{product.numReviews || 0} {t('reviews', 'dashboard')}</p>
                    </div>
                    <div className="text-right font-medium text-red-600">{formatCurrency(product.price)}</div>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-gray-500 text-center py-4">{t('no_data', 'dashboard')}</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <h2>{t('top_customers', 'dashboard')}</h2>
          </div>
          <div className="p-4 border-b bg-gray-50">
            <input
              type="text"
              placeholder={t('search_customer_email', 'dashboard')}
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
                    <p className="truncate font-medium">{customer.name}</p>
                    <p className="text-sm text-gray-600">{customer.email || customer.phone || t('not_updated', 'dashboard')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-blue-600">{formatCurrency(customer.totalSpent || 0)}</p>
                    <p className="text-xs text-gray-500">{customer.totalOrders || 0} {t('orders', 'dashboard')}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500 text-center py-4">{t('no_customer_data', 'dashboard')}</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <h2>{t('paid_orders', 'dashboard')}</h2>
          </div>
          <div className="p-4 border-b bg-gray-50 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-64">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('search', 'dashboard')}</label>
              <input
                type="text"
                placeholder={t('search_order_customer', 'dashboard')}
                value={paidOrdersSearch}
                onChange={(e) => setPaidOrdersSearch(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="min-w-48">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('status', 'dashboard')}</label>
              <select
                value={paidOrdersStatus}
                onChange={(e) => setPaidOrdersStatus(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="all">{t('all_status', 'dashboard')}</option>
                <option value="pending">{t('pending_payment')}</option>
                <option value="paid">{t('paid_status')}</option>
                <option value="delivered">{t('delivered', 'dashboard')}</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white text-xs uppercase">
                <tr>
                  <th className="px-6 py-3 text-left">{t('order_id', 'dashboard')}</th>
                  <th className="px-6 py-3 text-left">{t('customer', 'dashboard')}</th>
                  <th className="px-6 py-3 text-left">{t('value', 'dashboard')}</th>
                  <th className="px-6 py-3 text-left">{t('payment_date', 'dashboard')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredPaidOrders.length > 0 ? (
                  filteredPaidOrders.map((order, idx) => (
                    <tr key={order._id || `order-${idx}`} className="text-sm">
                      <td className="px-6 py-4">{order._id?.slice(-6).toUpperCase()}</td>
                      <td className="px-6 py-4">{order.customerName || t('not_updated', 'dashboard')}</td>
                      <td className="px-6 py-4">{formatCurrency(order.totalPrice)}</td>
                      <td className="px-6 py-4">{order.createdAt ? new Date(order.createdAt).toLocaleDateString('vi-VN') : t('not_updated', 'dashboard')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                      {t('no_paid_orders', 'dashboard')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showDateModal && tempDateSelection && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {tempDateSelection.type === 'day' && t('period_day', 'dashboard')}
                {tempDateSelection.type === 'month' && t('period_month', 'dashboard')}
                {tempDateSelection.type === 'quarter' && t('period_quarter', 'dashboard')}
                {tempDateSelection.type === 'year' && t('period_year', 'dashboard')}
              </h2>
              <button onClick={() => { setShowDateModal(false); setTempDateSelection(null); }} className="text-gray-400 hover:text-gray-600" aria-label={t('close', 'dashboard')}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              {tempDateSelection.type === 'day' && (
                <>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">{t('date_from', 'dashboard')}</label>
                  <input type="date" value={getInputDateValue(tempDateSelection.start)} onChange={(e) => { const [y, m, d] = e.target.value.split('-').map(Number); setTempDateSelection({ ...tempDateSelection, start: new Date(y, m - 1, d) }); }} className="w-full px-3 py-2 border rounded-lg" aria-label={t('date_from', 'dashboard')} /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">{t('date_to', 'dashboard')}</label>
                  <input type="date" value={getInputDateValue(tempDateSelection.end)} onChange={(e) => { const [y, m, d] = e.target.value.split('-').map(Number); setTempDateSelection({ ...tempDateSelection, end: new Date(y, m - 1, d) }); }} className="w-full px-3 py-2 border rounded-lg" aria-label={t('date_to', 'dashboard')} /></div>
                </>
              )}
              {tempDateSelection.type === 'month' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">{t('date_from', 'dashboard')}</label>
                  <select value={tempDateSelection.startMonth} onChange={(e) => setTempDateSelection({ ...tempDateSelection, startMonth: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg" aria-label={t('date_from', 'dashboard')}>
                    {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{t('period_month', 'dashboard')} {i + 1}</option>)}
                  </select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">{t('period_year', 'dashboard')}</label>
                  <input type="number" value={tempDateSelection.startYear} onChange={(e) => setTempDateSelection({ ...tempDateSelection, startYear: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg" aria-label={t('period_year', 'dashboard')} /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">{t('date_to', 'dashboard')}</label>
                  <select value={tempDateSelection.endMonth} onChange={(e) => setTempDateSelection({ ...tempDateSelection, endMonth: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg" aria-label={t('date_to', 'dashboard')}>
                    {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{t('period_month', 'dashboard')} {i + 1}</option>)}
                  </select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">{t('period_year', 'dashboard')}</label>
                  <input type="number" value={tempDateSelection.endYear} onChange={(e) => setTempDateSelection({ ...tempDateSelection, endYear: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg" aria-label={t('period_year', 'dashboard')} /></div>
                </div>
              )}
              {tempDateSelection.type === 'quarter' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">{t('date_from', 'dashboard')}</label>
                  <select value={tempDateSelection.startQuarter} onChange={(e) => setTempDateSelection({ ...tempDateSelection, startQuarter: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg" aria-label={t('date_from', 'dashboard')}>
                    {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{t('period_quarter', 'dashboard')} {q}</option>)}
                  </select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">{t('period_year', 'dashboard')}</label>
                  <input type="number" value={tempDateSelection.startYear} onChange={(e) => setTempDateSelection({ ...tempDateSelection, startYear: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg" aria-label={t('period_year', 'dashboard')} /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">{t('date_to', 'dashboard')}</label>
                  <select value={tempDateSelection.endQuarter} onChange={(e) => setTempDateSelection({ ...tempDateSelection, endQuarter: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg" aria-label={t('date_to', 'dashboard')}>
                    {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{t('period_quarter', 'dashboard')} {q}</option>)}
                  </select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">{t('period_year', 'dashboard')}</label>
                  <input type="number" value={tempDateSelection.endYear} onChange={(e) => setTempDateSelection({ ...tempDateSelection, endYear: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg" aria-label={t('period_year', 'dashboard')} /></div>
                </div>
              )}
              {tempDateSelection.type === 'year' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">{t('date_from', 'dashboard')}</label>
                  <input type="number" value={tempDateSelection.startYear} onChange={(e) => setTempDateSelection({ ...tempDateSelection, startYear: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg" aria-label={t('date_from', 'dashboard')} /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">{t('date_to', 'dashboard')}</label>
                  <input type="number" value={tempDateSelection.endYear} onChange={(e) => setTempDateSelection({ ...tempDateSelection, endYear: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg" aria-label={t('date_to', 'dashboard')} /></div>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowDateModal(false); setTempDateSelection(null); }} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">{t('cancel', 'dashboard')}</button>
              <button onClick={handleApplyDateSelection} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">{t('apply', 'dashboard')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default function Dashboard() {
  return (
    <AdminLayout>
      <DashboardContent />
    </AdminLayout>
  );
}
