/**
 * API Client - Kết nối frontend với backend qua proxy
 * Quản lý tất cả API calls, xác thực, interceptors
 *
 * Cách hoạt động:
 * - Frontend gọi /api/... (cùng domain)
 * - Next.js server proxy tới backend (no CORS needed)
 * - Server-to-server communication = an toàn & sạch
 */

// API Base URL = proxy path (cùng domain với frontend)
const API_URL = '/api';

/**
 * Get JWT token từ localStorage
 */
const getAuthToken = () => {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem('user');
  if (user) {
    try {
      const parsed = JSON.parse(user);
      return parsed.token;
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * Handle 401 Unauthorized responses
 * Clears auth state and redirects to login
 */
const handleUnauthorized = () => {
  if (typeof window === 'undefined') return;

  // Clear auth from localStorage
  localStorage.removeItem('user');

  // Dispatch custom event for AuthContext to listen
  const event = new CustomEvent('auth:logout');
  window.dispatchEvent(event);

  // Redirect to login page
  window.location.href = '/login';
};

/**
 * Generic API fetch wrapper
 * @param endpoint - API endpoint (e.g., /products, /users/login)
 * @param options - Fetch options (method, body, headers, etc.)
 */
export async function apiCall<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const token = getAuthToken();

  const headers = new Headers({
    'Content-Type': 'application/json',
    ...(options.headers instanceof Headers ? Object.fromEntries(options.headers.entries()) : options.headers),
  });

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Set default timeout to 15 seconds to prevent hanging
  const timeout = options.timeout || 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',  // Include cookies (refresh token in httpOnly cookie)
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle 401 Unauthorized (token expired or invalid)
    if (response.status === 401) {
      handleUnauthorized();
      throw new Error('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
    }

    if (!response.ok) {
      let errorMessage = `API Error [${response.status}]: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.message) {
          errorMessage = `${errorData.message} [${response.status}]`;
        }
      } catch {
        // If response body is not JSON, use status text
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Product API endpoints
 */
export const productAPI = {
  /**
   * Lấy danh sách sản phẩm
   * @param page - Trang hiện tại
   * @param keyword - Từ khóa tìm kiếm
   * @param category - Filter theo danh mục
   * @param brand - Filter theo hãng
   * @param pageSize - Số sản phẩm trên một trang (mặc định: 9)
   * @param minPrice - Giá tối thiểu
   * @param maxPrice - Giá tối đa
   * @param inStock - Filter theo trạng thái kho (true: còn hàng, false: hết hàng)
   */
  getProducts: async (
    page = 1,
    keyword?: string,
    category?: string,
    brand?: string,
    pageSize = 9,
    minPrice?: number,
    maxPrice?: number,
    inStock?: boolean
  ) => {
    const params = new URLSearchParams();
    params.append('pageNumber', page.toString());
    params.append('pageSize', pageSize.toString());
    if (keyword) params.append('keyword', keyword);
    if (category) params.append('category', category);
    if (brand) params.append('brand', brand);
    if (minPrice !== undefined) params.append('minPrice', minPrice.toString());
    if (maxPrice !== undefined) params.append('maxPrice', maxPrice.toString());
    if (inStock !== undefined) params.append('inStock', inStock.toString());

    return apiCall(`/products?${params.toString()}`);
  },


  /**
   * Lấy danh sách sản phẩm tối ưu (không populate reviews) - dùng cho home page
   * Nhẹ hơn getProducts, không bị timeout
   */
  getFeaturedProducts: async (
    page = 1,
    keyword?: string,
    category?: string,
    brand?: string,
    pageSize = 9,
    minPrice?: number,
    maxPrice?: number,
    inStock?: boolean
  ) => {
    const params = new URLSearchParams();
    params.append('pageNumber', page.toString());
    params.append('pageSize', pageSize.toString());
    if (keyword) params.append('keyword', keyword);
    if (category) params.append('category', category);
    if (brand) params.append('brand', brand);
    if (minPrice !== undefined) params.append('minPrice', minPrice.toString());
    if (maxPrice !== undefined) params.append('maxPrice', maxPrice.toString());
    if (inStock !== undefined) params.append('inStock', inStock.toString());

    return apiCall(`/products/featured/list?${params.toString()}`);
  },

  /**
   * Lấy chi tiết sản phẩm
   */
  getProductById: async (id: string) => {
    return apiCall(`/products/${id}`);
  },

  /**
   * Lấy sản phẩm được đánh giá cao nhất
   */
  getTopRated: async () => {
    return apiCall('/products/top/rated');
  },

  /**
   * Lấy thống kê chung của cửa hàng
   */
  getStatsOverview: async () => {
    return apiCall('/products/stats/overview');
  },

  /**
   * Lấy testimonials từ reviews
   * Fallback to empty array if API fails
   */
  getTestimonials: async (limit?: number) => {
    try {
      const params = new URLSearchParams();
      if (limit) params.append('limit', limit.toString());
      return await apiCall(`/products/testimonials/featured?${params.toString()}`);
    } catch (error) {
      // Return empty array instead of throwing error
      return [];
    }
  },

  /**
   * Tạo sản phẩm mới (Admin only)
   */
  createProduct: async (formData: FormData) => {
    const token = getAuthToken();
    const url = `${API_URL}/products`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
      body: formData, // FormData sẽ tự set Content-Type
    });

    if (!response.ok) {
      throw new Error('Failed to create product');
    }

    return response.json();
  },

  /**
   * Cập nhật sản phẩm (Admin only)
   */
  updateProduct: async (id: string, formData: FormData) => {
    const token = getAuthToken();
    const url = `${API_URL}/products/${id}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to update product');
    }

    return response.json();
  },

  /**
   * Xóa sản phẩm (Admin only)
   */
  deleteProduct: async (id: string) => {
    return apiCall(`/products/${id}`, { method: 'DELETE' });
  },

  /**
   * Lấy danh sách sản phẩm đã xóa (Admin only)
   */
  getDeletedProducts: async (page = 1, pageSize = 9) => {
    const params = new URLSearchParams();
    params.append('pageNumber', page.toString());
    params.append('pageSize', pageSize.toString());
    return apiCall(`/products/deleted/list?${params.toString()}`);
  },

  /**
   * Khôi phục sản phẩm đã xóa (Admin only)
   */
  restoreProduct: async (id: string) => {
    return apiCall(`/products/${id}/restore`, { method: 'PUT' });
  },
};

/**
 * User/Auth API endpoints
 */
export const authAPI = {
  /**
   * Đăng nhập
   */
  login: async (email: string, password: string) => {
    return apiCall('/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  /**
   * Đăng ký
   */
  register: async (name: string, email: string, password: string) => {
    return apiCall('/users', {
      method: 'POST',
      body: JSON.stringify({ username: name, email, password }),
    });
  },

  /**
   * Lấy thông tin user hiện tại
   */
  getMe: async () => {
    return apiCall('/users/profile');
  },
};

/**
 * Fallback categories data
 * Used when API fails to ensure categories dropdown still works
 */
const FALLBACK_CATEGORIES = {
  categories: [
    { _id: "1", name: "Laptop Gaming", description: "Laptop cao cấp dành cho game" },
    { _id: "2", name: "Laptop Văn Phòng", description: "Laptop cho công việc văn phòng" },
    { _id: "3", name: "Laptop Đồ Họa", description: "Laptop chuyên dụng cho thiết kế" },
    { _id: "4", name: "Laptop Sinh Viên", description: "Laptop phổ thông cho sinh viên" },
  ],
  page: 1,
  pages: 1,
};

/**
 * Category API endpoints
 */
export const categoryAPI = {
  /**
   * Lấy danh sách danh mục
   * Fallback to default categories if API fails
   */
  getCategories: async () => {
    try {
      return await apiCall('/categories');
    } catch (error) {
      return FALLBACK_CATEGORIES;
    }
  },

  /**
   * Lấy chi tiết danh mục
   */
  getCategoryById: async (id: string) => {
    return apiCall(`/categories/${id}`);
  },
};

/**
 * Supplier API endpoints
 */
export const supplierAPI = {
  /**
   * Lấy danh sách nhà cung cấp công khai (brands)
   */
  getPublicSuppliers: async () => {
    return apiCall('/suppliers/public/list');
  },
};

/**
 * Review API endpoints
 */
export const reviewAPI = {
  /**
   * Lấy reviews của sản phẩm
   */
  getProductReviews: async (productId: string) => {
    return apiCall(`/reviews/products/${productId}/reviews`);
  },

  /**
   * Tạo review mới (với avatar upload tùy chọn)
   */
  createReview: async (productId: string, rating: number, comment: string, avatarFile?: File) => {
    const token = getAuthToken();
    const url = `${API_URL}/reviews/products/${productId}/reviews`;

    const formData = new FormData();
    formData.append('rating', rating.toString());
    formData.append('comment', comment);
    if (avatarFile) {
      formData.append('avatar', avatarFile);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to create review');
    }

    return response.json();
  },
};

/**
 * Order API endpoints
 */
export const orderAPI = {
  /**
   * Tạo đơn hàng mới
   */
  createOrder: async (orderData: any) => {
    return apiCall('/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  },

  /**
   * Lấy tất cả đơn hàng (Admin only)
   */
  getAllOrders: async (pageNumber?: number) => {
    const params = new URLSearchParams();
    if (pageNumber) params.append('pageNumber', pageNumber.toString());
    return apiCall(`/orders${params.toString() ? '?' + params.toString() : ''}`);
  },

  /**
   * Lấy danh sách đơn hàng đã xóa (Admin only)
   */
  getDeletedOrders: async (pageNumber?: number) => {
    const params = new URLSearchParams();
    params.append('pageNumber', pageNumber?.toString() || '1');
    return apiCall(`/orders/deleted/list?${params.toString()}`);
  },

  /**
   * Lấy đơn hàng của user
   */
  getMyOrders: async () => {
    return apiCall('/orders/myorders');
  },

  /**
   * Lấy chi tiết đơn hàng
   */
  getOrderById: async (id: string) => {
    return apiCall(`/orders/${id}`);
  },

  /**
   * Lấy chi tiết đơn hàng (alias for getOrderById)
   */
  getOrder: async (id: string) => {
    return apiCall(`/orders/${id}`);
  },

  /**
   * Khôi phục đơn hàng đã xóa (Admin only)
   */
  restoreOrder: async (id: string) => {
    return apiCall(`/orders/${id}/restore`, { method: 'PUT' });
  },

  /**
   * Xác nhận thanh toán cho đơn hàng
   */
  confirmPayment: async (orderId: string) => {
    return apiCall(`/orders/${orderId}/payment/confirm`, { method: 'PUT' });
  },
};

/**
 * Customer API endpoints
 */
export const customerAPI = {
  /**
   * Lấy danh sách khách hàng (Admin only)
   */
  getCustomers: async (pageNumber?: number, pageSize = 1000, keyword?: string) => {
    const params = new URLSearchParams();
    params.append('pageSize', pageSize.toString());
    if (pageNumber) params.append('pageNumber', pageNumber.toString());
    if (keyword) params.append('keyword', keyword);
    return apiCall(`/customers?${params.toString()}`);
  },

  /**
   * Lấy danh sách khách hàng đã xóa (Admin only)
   */
  getDeletedCustomers: async (pageNumber?: number, pageSize = 1000) => {
    const params = new URLSearchParams();
    params.append('pageSize', pageSize.toString());
    params.append('pageNumber', pageNumber?.toString() || '1');
    return apiCall(`/customers/deleted/list?${params.toString()}`);
  },

  /**
   * Lấy chi tiết khách hàng
   */
  getCustomerById: async (id: string) => {
    return apiCall(`/customers/${id}`);
  },

  /**
   * Tạo khách hàng mới (Admin only)
   */
  createCustomer: async (data: any) => {
    return apiCall('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Cập nhật khách hàng (Admin only)
   */
  updateCustomer: async (id: string, data: any) => {
    return apiCall(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Xóa khách hàng (Admin only)
   */
  deleteCustomer: async (id: string) => {
    return apiCall(`/customers/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Khôi phục khách hàng đã xóa (Admin only)
   */
  restoreCustomer: async (id: string) => {
    return apiCall(`/customers/${id}/restore`, { method: 'PUT' });
  },
};

/**
 * Analytics API endpoints - Optimized for dashboard
 * Sử dụng MongoDB aggregation pipeline để lấy dữ liệu nhanh
 */
export const analyticsAPI = {
  /**
   * Lấy KPI stats dashboard
   * Response: { totalProducts, inStockProducts, totalOrders, totalRevenue, totalCustomers }
   */
  getDashboardStats: async () => {
    return apiCall('/analytics/dashboard-stats');
  },

  /**
   * Lấy doanh thu theo timeline
   * @param period - 'day' | 'month' | 'quarter' | 'year'
   * @param days - Số ngày quay lại (mặc định 90)
   * @param startDate - Ngày bắt đầu (Date object hoặc ISO string)
   * @param endDate - Ngày kết thúc (Date object hoặc ISO string)
   */
  getRevenueTimeline: async (period = 'month', days = 90, startDate?, endDate?) => {
    const params = new URLSearchParams();
    params.append('period', period);

    if (startDate && endDate) {
      // Sử dụng local date format (YYYY-MM-DD) để khớp với frontend
      // Điều này đảm bảo timezone consistency giữa UI selection và API call
      const formatLocalDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const start = startDate instanceof Date ? formatLocalDate(startDate) : startDate;
      const end = endDate instanceof Date ? formatLocalDate(endDate) : endDate;
      params.append('startDate', start);
      params.append('endDate', end);
    } else {
      params.append('days', days.toString());
    }
    return apiCall(`/analytics/revenue-timeline?${params.toString()}`);
  },

  /**
   * Lấy phân bố trạng thái đơn hàng
   * @param days - Số ngày quay lại (mặc định 30)
   * @param startDate - Ngày bắt đầu (Date object hoặc ISO string)
   * @param endDate - Ngày kết thúc (Date object hoặc ISO string)
   */
  getOrderStatus: async (days = 30, startDate?, endDate?) => {
    const params = new URLSearchParams();

    if (startDate && endDate) {
      // Sử dụng local date format (YYYY-MM-DD) để khớp với frontend
      // Điều này đảm bảo timezone consistency giữa UI selection và API call
      const formatLocalDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const start = startDate instanceof Date ? formatLocalDate(startDate) : startDate;
      const end = endDate instanceof Date ? formatLocalDate(endDate) : endDate;
      params.append('startDate', start);
      params.append('endDate', end);
    } else {
      params.append('days', days.toString());
    }
    return apiCall(`/analytics/order-status?${params.toString()}`);
  },

  /**
   * Lấy sản phẩm bán chạy nhất
   * @param limit - Số sản phẩm (mặc định 5)
   * @param days - Số ngày quay lại (mặc định 30)
   * @param startDate - Ngày bắt đầu (Date object hoặc ISO string)
   * @param endDate - Ngày kết thúc (Date object hoặc ISO string)
   */
  getTopProducts: async (limit = 5, days = 30, startDate?, endDate?) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());

    if (startDate && endDate) {
      // Sử dụng local date format (YYYY-MM-DD) để khớp với frontend
      // Điều này đảm bảo timezone consistency giữa UI selection và API call
      const formatLocalDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const start = startDate instanceof Date ? formatLocalDate(startDate) : startDate;
      const end = endDate instanceof Date ? formatLocalDate(endDate) : endDate;
      params.append('startDate', start);
      params.append('endDate', end);
    } else {
      params.append('days', days.toString());
    }
    return apiCall(`/analytics/top-products?${params.toString()}`);
  },

  /**
   * Lấy tất cả dữ liệu dashboard một lần
   * Kết hợp: stats + recent orders + top products + order status
   * @param days - Số ngày quay lại (mặc định 30)
   */
  getDashboardData: async (days = 30) => {
    const params = new URLSearchParams();
    params.append('days', days.toString());
    return apiCall(`/analytics/dashboard-data?${params.toString()}`);
  },
};

/**
 * Fallback provinces data (61 provinces of Vietnam)
 * Used when API fails to ensure form is still usable
 * Codes match database format (single digits)
 */
const FALLBACK_PROVINCES = [
  { "code": "1", "name": "Hà Nội" },
  { "code": "2", "name": "Hà Giang" },
  { "code": "4", "name": "Cao Bằng" },
  { "code": "6", "name": "Bắc Kạn" },
  { "code": "8", "name": "Tuyên Quang" },
  { "code": "10", "name": "Lào Cai" },
  { "code": "11", "name": "Điện Biên" },
  { "code": "12", "name": "Lai Châu" },
  { "code": "14", "name": "Sơn La" },
  { "code": "15", "name": "Yên Bái" },
  { "code": "17", "name": "Hòa Bình" },
  { "code": "19", "name": "Thái Nguyên" },
  { "code": "20", "name": "Lạng Sơn" },
  { "code": "22", "name": "Quảng Ninh" },
  { "code": "24", "name": "Bắc Giang" },
  { "code": "25", "name": "Phú Thọ" },
  { "code": "26", "name": "Vĩnh Phúc" },
  { "code": "27", "name": "Bắc Ninh" },
  { "code": "30", "name": "Hải Dương" },
  { "code": "31", "name": "Hải Phòng" },
  { "code": "33", "name": "Hưng Yên" },
  { "code": "35", "name": "Thái Bình" },
  { "code": "37", "name": "Nam Định" },
  { "code": "38", "name": "Ninh Bình" },
  { "code": "40", "name": "Thanh Hóa" },
  { "code": "42", "name": "Nghệ An" },
  { "code": "44", "name": "Hà Tĩnh" },
  { "code": "45", "name": "Quảng Bình" },
  { "code": "46", "name": "Quảng Trị" },
  { "code": "48", "name": "Thừa Thiên Huế" },
  { "code": "49", "name": "Đà Nẵng" },
  { "code": "51", "name": "Quảng Nam" },
  { "code": "52", "name": "Quảng Ngãi" },
  { "code": "54", "name": "Bình Định" },
  { "code": "56", "name": "Phú Yên" },
  { "code": "58", "name": "Khánh Hòa" },
  { "code": "60", "name": "Ninh Thuận" },
  { "code": "62", "name": "Bình Thuận" },
  { "code": "64", "name": "Gia Lai" },
  { "code": "66", "name": "Đắk Lắk" },
  { "code": "67", "name": "Đắk Nông" },
  { "code": "68", "name": "Lâm Đồng" },
  { "code": "70", "name": "Bình Phương" },
  { "code": "72", "name": "Tây Ninh" },
  { "code": "74", "name": "Bình Dương" },
  { "code": "75", "name": "Đồng Nai" },
  { "code": "77", "name": "Bà Rịa - Vũng Tàu" },
  { "code": "79", "name": "Hồ Chí Minh" },
  { "code": "80", "name": "Long An" },
  { "code": "82", "name": "Tiền Giang" },
  { "code": "83", "name": "Bến Tre" },
  { "code": "84", "name": "Trà Vinh" },
  { "code": "86", "name": "Vĩnh Long" },
  { "code": "87", "name": "Đồng Tháp" },
  { "code": "89", "name": "An Giang" },
  { "code": "91", "name": "Kiên Giang" },
  { "code": "92", "name": "Cần Thơ" },
  { "code": "93", "name": "Hậu Giang" },
  { "code": "94", "name": "Sóc Trăng" },
  { "code": "95", "name": "Bạc Liêu" },
  { "code": "96", "name": "Cà Mau" }
];

/**
 * Location API endpoints
 */
export const locationAPI = {
  /**
   * Lấy danh sách tất cả tỉnh/thành phố Việt Nam
   * Fallback to hardcoded data nếu API fail (không throw error)
   */
  getProvinces: async () => {
    try {
      console.log('[locationAPI] Calling GET /locations/provinces');
      const data = await apiCall('/locations/provinces');
      console.log('[locationAPI] Provinces response:', {
        length: Array.isArray(data) ? data.length : 0,
        type: typeof data,
        isArray: Array.isArray(data),
      });
      // If API returns empty array, use fallback
      if (!data || (Array.isArray(data) && data.length === 0)) {
        console.log('[locationAPI] Empty response, using fallback');
        return FALLBACK_PROVINCES;
      }
      return data;
    } catch (error) {
      // Always return fallback - never reject
      console.error('[locationAPI] Error fetching provinces, using fallback:', error);
      return FALLBACK_PROVINCES;
    }
  },

  /**
   * Lấy danh sách quận/huyện theo mã tỉnh
   * Return empty array on error (don't throw)
   */
  getDistrictsByProvince: async (provinceCode: string) => {
    try {
      return await apiCall(`/locations/districts/${provinceCode}`);
    } catch (error) {
      return [];
    }
  },

  /**
   * Lấy danh sách phường/xã theo mã quận
   * Return empty array on error (don't throw)
   */
  getWardsByDistrict: async (districtCode: string) => {
    try {
      return await apiCall(`/locations/wards/${districtCode}`);
    } catch (error) {
      return [];
    }
  },

  /**
   * Tìm kiếm tỉnh theo từ khóa
   * Fallback to client-side filtering if API unavailable
   */
  searchProvinces: async (query: string) => {
    try {
      return await apiCall(`/locations/search/provinces?q=${encodeURIComponent(query)}`);
    } catch (error) {
      // Client-side search fallback
      const q = query.toLowerCase();
      return FALLBACK_PROVINCES.filter(p =>
        p.name.toLowerCase().includes(q)
      );
    }
  },
};

/**
 * Shipping Methods API endpoints
 * Bao gồm mock methods + real GHN API
 */
export const shippingAPI = {
  /**
   * Lấy tất cả phương thức vận chuyển (mock fallback)
   */
  getShippingMethods: async () => {
    return apiCall('/shipping');
  },

  /**
   * Tính phí vận chuyển thực tế từ GHN API
   */
  calculateShippingFee: async (districtId: number, wardCode: string, weight: number = 1000) => {
    return apiCall('/shipping/calculate-fee', {
      method: 'POST',
      body: JSON.stringify({
        districtId,
        wardCode,
        weight
      })
    });
  },

  /**
   * Lấy danh sách tỉnh từ GHN
   */
  getGHNProvinces: async () => {
    return apiCall('/shipping/ghn/provinces');
  },

  /**
   * Lấy danh sách quận/huyện theo tỉnh
   */
  getGHNDistricts: async (provinceId: number) => {
    return apiCall(`/shipping/ghn/districts/${provinceId}`);
  },

  /**
   * Lấy danh sách phường/xã theo quận
   */
  getGHNWards: async (districtId: number) => {
    return apiCall(`/shipping/ghn/wards/${districtId}`);
  }
};

/**
 * Payment Methods API endpoints
 * Bao gồm mock methods + real VNPay integration
 */
export const paymentAPI = {
  /**
   * Lấy tất cả phương thức thanh toán
   */
  getPaymentMethods: async () => {
    return apiCall('/payment/methods');
  },

  /**
   * Lấy chi tiết phương thức thanh toán theo ID
   */
  getPaymentMethodById: async (id: string) => {
    return apiCall(`/payment-methods/${id}`);
  },

  /**
   * Tạo link thanh toán VNPay
   */
  createVNPayLink: async (orderId: string, amount: number, customerInfo: any, returnUrl?: string) => {
    return apiCall('/payment/vnpay/create', {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        amount,
        returnUrl,
        customerName: customerInfo.name,
        customerEmail: customerInfo.email,
        customerPhone: customerInfo.phone,
        address: customerInfo.address,
        city: customerInfo.city,
        ward: customerInfo.ward,
        orderInfo: customerInfo.orderInfo
      })
    });
  },

  /**
   * Verify VNPay response từ return URL
   * (Cái này xử lý trên frontend bằng query params)
   */
  verifyVNPayResponse: (queryParams: Record<string, any>) => {
    // Frontend chỉ cần extract query params, backend verify qua IPN
    return queryParams;
  },

  /**
   * Xử lý thanh toán bằng thẻ
   */
  createCardPayment: async (orderId: string, amount: number, cardDetails: any) => {
    return apiCall('/payment/card/create', {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        amount,
        cardDetails
      })
    });
  }
};
