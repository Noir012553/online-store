import { useState, useEffect } from "react";
import { Package, ShoppingCart, Users, DollarSign, TrendingUp, TrendingDown, Calendar, Clock, X } from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCurrency } from "../../lib/utils";
import { analyticsAPI } from "../../lib/api";
import AdminLayout from "./adminLayout";

type TimeFrame = 'day' | 'month' | 'quarter' | 'year';

// Helper functions for date formatting
const formatDate = (date: Date): string => {
  return date.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const calculateDaysDifference = (startDate: Date, endDate: Date): number => {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((endDate.getTime() - startDate.getTime()) / oneDay) + 1;
};

// Convert local date to ISO string for API (YYYY-MM-DD format)
// This ensures the date sent to API matches what user sees, regardless of timezone
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

function DashboardContent() {
  const [stats, setStats] = useState({
    totalProducts: 0,
    inStockProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    totalCustomers: 0,
  });

  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [orderStatusData, setOrderStatusData] = useState<any[]>([]);
  const [topProductsChartData, setTopProductsChartData] = useState<any[]>([]);
  const [ordersTimelineData, setOrdersTimelineData] = useState<any[]>([]);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('month');

  // Helper function to get default date ranges (called only once at init)
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

  // State for date range selections
  const [showDateModal, setShowDateModal] = useState(false);
  const [dayRange, setDayRange] = useState(() => getDefaultDateRanges().day);
  const [monthRange, setMonthRange] = useState(() => getDefaultDateRanges().month);
  const [quarterRange, setQuarterRange] = useState(() => getDefaultDateRanges().quarter);
  const [yearRange, setYearRange] = useState(() => getDefaultDateRanges().year);
  const [tempDateSelection, setTempDateSelection] = useState<any>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);

      // Fetch optimized dashboard data from backend
      const dashboardData = await analyticsAPI.getDashboardData(30);

      // Update stats
      setStats({
        totalProducts: dashboardData.stats.totalProducts,
        inStockProducts: dashboardData.stats.inStockProducts,
        totalOrders: dashboardData.stats.totalOrders,
        totalRevenue: dashboardData.stats.totalRevenue,
        totalCustomers: dashboardData.stats.totalCustomers,
      });

      setRecentOrders(dashboardData.recentOrders || []);
      setTopProducts(dashboardData.topProducts || []);

      // Fetch initial timeline data with default month range
      const defaultRanges = getDefaultDateRanges();
      await fetchChartData('month', defaultRanges.month);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch chart data based on time frame - not dependent on state
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

      // Fetch all chart data in parallel (3 API calls instead of 4)
      const [revenueData, statusData, topProductsData] = await Promise.all([
        analyticsAPI.getRevenueTimeline(period, days, startDate, endDate),
        analyticsAPI.getOrderStatus(days, startDate, endDate),
        analyticsAPI.getTopProducts(5, days, startDate, endDate),
      ]);

      setRevenueData(revenueData);
      setOrderStatusData(statusData);
      setTopProductsChartData(topProductsData);

      // Reuse revenueData for orders timeline (transform count to orders)
      setOrdersTimelineData(
        revenueData.map((item: any) => ({
          period: item.period,
          orders: item.count || 0,
        }))
      );
    } catch (error) {
      // Error fetching chart data
    }
  };


  const dashboardStats = [
    {
      icon: Package,
      label: "Tổng sản phẩm",
      value: stats.totalProducts,
      subValue: `${stats.inStockProducts} còn hàng`,
      trend: "+5%",
      trendUp: true,
    },
    {
      icon: ShoppingCart,
      label: "Đơn hàng",
      value: stats.totalOrders,
      subValue: "Tất cả",
      trend: "+12%",
      trendUp: true,
    },
    {
      icon: DollarSign,
      label: "Doanh thu",
      value: formatCurrency(stats.totalRevenue),
      subValue: "Tổng giá trị",
      trend: "+8%",
      trendUp: true,
    },
    {
      icon: Users,
      label: "Khách hàng",
      value: stats.totalCustomers,
      subValue: "Tổng số",
      trend: "+15%",
      trendUp: true,
    },
  ];

  const COLORS = ['#ef4444', '#3b82f6', '#10b981'];

  const timeFrameOptions: { label: string; value: TimeFrame }[] = [
    { label: 'Ngày', value: 'day' },
    { label: 'Tháng', value: 'month' },
    { label: 'Quý', value: 'quarter' },
    { label: 'Năm', value: 'year' },
  ];

  // Handle opening date picker modal with current values
  const handleOpenDateModal = (frame: TimeFrame) => {
    setTimeFrame(frame);

    // Always load current values into temp selection
    let selection: any = { type: frame };

    if (frame === 'day') {
      selection = {
        type: 'day',
        start: new Date(dayRange.start),
        end: new Date(dayRange.end)
      };
    } else if (frame === 'month') {
      selection = {
        type: 'month',
        startMonth: monthRange.startMonth,
        startYear: monthRange.startYear,
        endMonth: monthRange.endMonth,
        endYear: monthRange.endYear,
      };
    } else if (frame === 'quarter') {
      selection = {
        type: 'quarter',
        startQuarter: quarterRange.startQuarter,
        startYear: quarterRange.startYear,
        endQuarter: quarterRange.endQuarter,
        endYear: quarterRange.endYear,
      };
    } else if (frame === 'year') {
      selection = {
        type: 'year',
        startYear: yearRange.startYear,
        endYear: yearRange.endYear,
      };
    }

    setTempDateSelection(selection);
    setShowDateModal(true);
  };

  // Handle closing and applying date selection
  const handleApplyDateSelection = async () => {
    if (!tempDateSelection) return;

    const selectedType = tempDateSelection.type as TimeFrame;

    // Update state with new date ranges
    if (tempDateSelection.type === 'day') {
      setDayRange({ start: tempDateSelection.start, end: tempDateSelection.end });
    } else if (tempDateSelection.type === 'month') {
      setMonthRange({
        startMonth: tempDateSelection.startMonth,
        startYear: tempDateSelection.startYear,
        endMonth: tempDateSelection.endMonth,
        endYear: tempDateSelection.endYear,
      });
    } else if (tempDateSelection.type === 'quarter') {
      setQuarterRange({
        startQuarter: tempDateSelection.startQuarter,
        startYear: tempDateSelection.startYear,
        endQuarter: tempDateSelection.endQuarter,
        endYear: tempDateSelection.endYear,
      });
    } else if (tempDateSelection.type === 'year') {
      setYearRange({
        startYear: tempDateSelection.startYear,
        endYear: tempDateSelection.endYear,
      });
    }

    // Update timeFrame
    setTimeFrame(selectedType);

    // Close modal immediately
    setShowDateModal(false);
    setTempDateSelection(null);

    // Fetch chart data with the new selection
    try {
      if (selectedType === 'day') {
        await fetchChartData(selectedType, undefined, { start: tempDateSelection.start, end: tempDateSelection.end });
      } else if (selectedType === 'month') {
        await fetchChartData(selectedType, {
          startMonth: tempDateSelection.startMonth,
          startYear: tempDateSelection.startYear,
          endMonth: tempDateSelection.endMonth,
          endYear: tempDateSelection.endYear,
        });
      } else if (selectedType === 'quarter') {
        await fetchChartData(selectedType, undefined, undefined, {
          startQuarter: tempDateSelection.startQuarter,
          startYear: tempDateSelection.startYear,
          endQuarter: tempDateSelection.endQuarter,
          endYear: tempDateSelection.endYear,
        });
      } else if (selectedType === 'year') {
        await fetchChartData(selectedType, undefined, undefined, undefined, {
          startYear: tempDateSelection.startYear,
          endYear: tempDateSelection.endYear,
        });
      }
    } catch (error) {
      // Error fetching chart data
    }
  };

  // Format date range for display with clear formatting
  const getDateRangeDisplay = () => {
    if (timeFrame === 'day') {
      const startFormatted = dayRange.start.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const endFormatted = dayRange.end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `${startFormatted} → ${endFormatted}`;
    } else if (timeFrame === 'month') {
      const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
      const startMonth = months[monthRange.startMonth];
      const endMonth = months[monthRange.endMonth];
      return `Tháng ${startMonth}/${monthRange.startYear} → Tháng ${endMonth}/${monthRange.endYear}`;
    } else if (timeFrame === 'quarter') {
      return `Q${quarterRange.startQuarter}/${quarterRange.startYear} → Q${quarterRange.endQuarter}/${quarterRange.endYear}`;
    } else if (timeFrame === 'year') {
      return `Năm ${yearRange.startYear} → Năm ${yearRange.endYear}`;
    }
    return '';
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <p>Đang tải dữ liệu...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1>Dashboard</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white rounded-lg border p-2">
            <Calendar className="w-5 h-5 text-gray-600" />
            {timeFrameOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  handleOpenDateModal(option.value);
                }}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  timeFrame === option.value
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {timeFrame && (
            <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 font-medium">
              {getDateRangeDisplay()}
            </div>
          )}
        </div>
      </div>

      {/* KPI Stats Grid */}
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

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Revenue Trend Chart */}
        <div className="bg-linear-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Xu hướng doanh thu</h2>
              <p className="text-sm text-gray-500 mt-1">Thống kê doanh thu theo thời gian</p>
            </div>
            <div className="w-12 h-12 bg-linear-to-br from-red-400 to-red-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          {revenueData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueData}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="period" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }}
                  formatter={(value: number | undefined) => [formatCurrency(value || 0), 'Doanh thu']}
                  labelStyle={{ color: '#374151', fontWeight: 500 }}
                  cursor={{ stroke: '#e5e7eb' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#ef4444"
                  name="Doanh thu"
                  strokeWidth={3}
                  dot={{ fill: '#ef4444', r: 5, strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 7 }}
                  animationDuration={800}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-gray-500">Không có dữ liệu</p>
              </div>
            </div>
          )}
        </div>

        {/* Order Status Distribution Chart */}
        <div className="bg-linear-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Phân bố trạng thái đơn hàng</h2>
              <p className="text-sm text-gray-500 mt-1">Tỷ lệ các trạng thái đơn hàng</p>
            </div>
            <div className="w-12 h-12 bg-linear-to-br from-emerald-300 to-emerald-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          {orderStatusData.length > 0 && orderStatusData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={orderStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={85}
                  fill="#8884d8"
                  dataKey="value"
                  animationDuration={800}
                >
                  {orderStatusData.map((entry, index) => (
                    <Cell key={`status-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }}
                  formatter={(value: number | undefined) => [`${value || 0} đơn`, 'Số lượng']}
                  labelStyle={{ color: '#374151', fontWeight: 500 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-gray-500">Không có dữ liệu</p>
              </div>
            </div>
          )}
        </div>

        {/* Orders Timeline Chart */}
        <div className="bg-linear-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Số lượng đơn hàng theo thời gian</h2>
              <p className="text-sm text-gray-500 mt-1">Thống kê đơn hàng theo kỳ</p>
            </div>
            <div className="w-12 h-12 bg-linear-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center relative z-20">
              <Clock className="w-6 h-6 text-white" />
            </div>
          </div>
          {ordersTimelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={ordersTimelineData}>
                <defs>
                  <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="period" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }}
                  formatter={(value: number | undefined) => [`${value || 0} đơn`, 'Số lượng']}
                  labelStyle={{ color: '#374151', fontWeight: 500 }}
                  cursor={{ stroke: '#e5e7eb' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line
                  type="monotone"
                  dataKey="orders"
                  stroke="#3b82f6"
                  name="Đơn hàng"
                  strokeWidth={3}
                  dot={{ fill: '#3b82f6', r: 5, strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 7 }}
                  animationDuration={800}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-gray-500">Không có dữ liệu</p>
              </div>
            </div>
          )}
        </div>

        {/* Top Products Sales Chart - Doughnut + Legend */}
        <div className="bg-linear-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Sản phẩm bán chạy nhất</h2>
            <div className="w-12 h-12 bg-linear-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
          </div>

          {topProductsChartData.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={topProductsChartData}
                    cx="35%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="count"
                    animationDuration={800}
                  >
                    {topProductsChartData.map((entry: any, index: number) => {
                      const doughnutColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
                      return (
                        <Cell
                          key={`product-cell-${index}`}
                          fill={doughnutColors[index % doughnutColors.length]}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value: number | undefined) => [`${value || 0} sản phẩm`, 'Số lượng']}
                    labelStyle={{ color: '#374151', fontWeight: 500 }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="mt-4 space-y-2 w-full">
                {topProductsChartData.map((product: any, index: number) => {
                  const doughnutColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

                  return (
                    <div key={`legend-${index}`} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors w-full min-w-0">
                      <div
                        className="w-3 h-3 rounded-full shrink-0 mt-1"
                        style={{ backgroundColor: doughnutColors[index % doughnutColors.length] }}
                      />
                      <p className="text-base font-medium text-gray-900 flex-1 whitespace-normal">{product.displayName}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-sm text-gray-500">Không có dữ liệu</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="grid grid-cols-1 gap-8">
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <h2>Đơn hàng gần đây</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs uppercase">Mã đơn</th>
                  <th className="px-6 py-3 text-left text-xs uppercase">Khách hàng</th>
                  <th className="px-6 py-3 text-left text-xs uppercase">Giá trị</th>
                  <th className="px-6 py-3 text-left text-xs uppercase">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentOrders.map((order, idx) => (
                  <tr key={order._id || `order-${idx}`}>
                    <td className="px-6 py-4">{order._id?.slice(-6).toUpperCase()}</td>
                    <td className="px-6 py-4">{order.customerName || "—"}</td>
                    <td className="px-6 py-4">{formatCurrency(order.totalPrice)}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          order.isDelivered
                            ? "bg-green-100 text-green-800"
                            : order.isPaid
                            ? "bg-blue-100 text-blue-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {order.isDelivered ? "Đã giao" : order.isPaid ? "Đã thanh toán" : "Chờ thanh toán"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Products List */}
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <h2>Sản phẩm được đánh giá cao</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {topProducts.map((product, index) => (
                <div key={product._id || `product-${index}`} className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-red-600">{index + 1}</span>
                  </div>
                  {product.image && (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-16 h-16 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{product.name}</p>
                    <p className="text-sm text-gray-600">{product.numReviews || 0} đánh giá</p>
                  </div>
                  <div className="text-right">
                    <p className="text-red-600">{formatCurrency(product.price)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Date Picker Modal */}
      {showDateModal && tempDateSelection && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4 pointer-events-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {tempDateSelection.type === 'day' && 'Chọn ngày'}
                {tempDateSelection.type === 'month' && 'Chọn tháng'}
                {tempDateSelection.type === 'quarter' && 'Chọn quý'}
                {tempDateSelection.type === 'year' && 'Chọn năm'}
              </h2>
              <button onClick={() => {
                setShowDateModal(false);
                setTempDateSelection(null);
              }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {tempDateSelection.type === 'day' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Từ ngày</label>
                    <input
                      type="date"
                      value={getInputDateValue(tempDateSelection.start)}
                      onChange={(e) => {
                        // Parse date string "YYYY-MM-DD" as local date
                        const [year, month, day] = e.target.value.split('-').map(Number);
                        const newDate = new Date(year, month - 1, day);
                        setTempDateSelection({ ...tempDateSelection, start: newDate });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Đến ngày</label>
                    <input
                      type="date"
                      value={getInputDateValue(tempDateSelection.end)}
                      onChange={(e) => {
                        // Parse date string "YYYY-MM-DD" as local date
                        const [year, month, day] = e.target.value.split('-').map(Number);
                        const newDate = new Date(year, month - 1, day);
                        setTempDateSelection({ ...tempDateSelection, end: newDate });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                    />
                  </div>
                </>
              )}

              {tempDateSelection.type === 'month' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Từ tháng</label>
                      <select
                        value={tempDateSelection.startMonth}
                        onChange={(e) => setTempDateSelection({ ...tempDateSelection, startMonth: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                      >
                        {Array.from({ length: 12 }, (_, i) => (
                          <option key={i} value={i}>
                            Tháng {i + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Năm</label>
                      <input
                        type="number"
                        value={tempDateSelection.startYear}
                        onChange={(e) => setTempDateSelection({ ...tempDateSelection, startYear: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Đến tháng</label>
                      <select
                        value={tempDateSelection.endMonth}
                        onChange={(e) => setTempDateSelection({ ...tempDateSelection, endMonth: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                      >
                        {Array.from({ length: 12 }, (_, i) => (
                          <option key={i} value={i}>
                            Tháng {i + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Năm</label>
                      <input
                        type="number"
                        value={tempDateSelection.endYear}
                        onChange={(e) => setTempDateSelection({ ...tempDateSelection, endYear: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                      />
                    </div>
                  </div>
                </>
              )}

              {tempDateSelection.type === 'quarter' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Từ quý</label>
                      <select
                        value={tempDateSelection.startQuarter}
                        onChange={(e) => setTempDateSelection({ ...tempDateSelection, startQuarter: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                      >
                        {[1, 2, 3, 4].map((q) => (
                          <option key={q} value={q}>
                            Quý {q}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Năm</label>
                      <input
                        type="number"
                        value={tempDateSelection.startYear}
                        onChange={(e) => setTempDateSelection({ ...tempDateSelection, startYear: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Đến quý</label>
                      <select
                        value={tempDateSelection.endQuarter}
                        onChange={(e) => setTempDateSelection({ ...tempDateSelection, endQuarter: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                      >
                        {[1, 2, 3, 4].map((q) => (
                          <option key={q} value={q}>
                            Quý {q}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Năm</label>
                      <input
                        type="number"
                        value={tempDateSelection.endYear}
                        onChange={(e) => setTempDateSelection({ ...tempDateSelection, endYear: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                      />
                    </div>
                  </div>
                </>
              )}

              {tempDateSelection.type === 'year' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Từ năm</label>
                    <input
                      type="number"
                      value={tempDateSelection.startYear}
                      onChange={(e) => setTempDateSelection({ ...tempDateSelection, startYear: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Đến năm</label>
                    <input
                      type="number"
                      value={tempDateSelection.endYear}
                      onChange={(e) => setTempDateSelection({ ...tempDateSelection, endYear: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowDateModal(false);
                  setTempDateSelection(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={handleApplyDateSelection}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <AdminLayout>
      <DashboardContent />
    </AdminLayout>
  );
}
