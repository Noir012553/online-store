/**
 * API Client - Kết nối frontend với backend qua proxy
 * Quản lý tất cả API calls, xác thực, interceptors
 *
 * Cách hoạt động:
 * - Frontend gọi /api/... (cùng domain)
 * - Next.js server proxy tới backend (no CORS needed)
 * - Server-to-server communication = an toàn & sạch
 *
 * Optimizations:
 * - Request deduplication: Nếu request đang pending, reuse result thay vì gửi lại
 * - AbortController: Cancel request khi component unmounts
 */

import { BACKEND_URL, API_BASE_PATH } from '../config';

// Export BACKEND_URL for use in other files (e.g., image URL construction)
export { BACKEND_URL };

// API Base URL = proxy path (cùng domain với frontend)
const API_URL = API_BASE_PATH;

// Custom fetch options type that includes timeout
interface FetchOptions extends RequestInit {
  timeout?: number;
  skipCache?: boolean; // Option to skip deduplication for specific requests
}

// Cache for pending requests - prevent duplicate API calls
// Key: request signature (method + endpoint + body)
// Value: Promise that resolves to response data
const pendingRequests = new Map<string, Promise<any>>();

// Create a signature for deduplication
const createRequestSignature = (endpoint: string, options: FetchOptions): string => {
  const method = options.method || 'GET';
  const body = options.body ? String(options.body) : '';
  return `${method}:${endpoint}:${body}`;
};

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
 * Generic API fetch wrapper with deduplication & AbortController
 * @param endpoint - API endpoint (e.g., /products, /users/login)
 * @param options - Fetch options (method, body, headers, etc., timeout, skipCache)
 *
 * Features:
 * - Request deduplication: Reuse pending requests (prevent 429 errors)
 * - AbortController: Cancel long-running requests on unmount
 * - Timeout: Auto-abort after specified time (default 15s)
 */
export async function apiCall<T = any>(
  endpoint: string,
  options: FetchOptions = {}
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

  // Extract custom options
  const { timeout: customTimeout, skipCache = false, ...fetchOptions } = options;
  const timeout = customTimeout || 15000;

  // Check deduplication cache (skip for mutations or if explicitly disabled)
  const method = options.method || 'GET';
  const isMutation = method !== 'GET';

  if (!isMutation && !skipCache) {
    const signature = createRequestSignature(endpoint, options);

    // If request is already pending, return existing promise
    if (pendingRequests.has(signature)) {
      return pendingRequests.get(signature) as Promise<T>;
    }

    // Create new pending request promise
    const requestPromise = executeRequest<T>(url, headers, fetchOptions, timeout)
      .finally(() => {
        // Remove from cache when done
        pendingRequests.delete(signature);
      });

    // Store in cache
    pendingRequests.set(signature, requestPromise);
    return requestPromise;
  }

  // For mutations or skipped cache, execute directly
  return executeRequest<T>(url, headers, fetchOptions, timeout);
}

/**
 * Execute the actual fetch request with timeout & error handling
 */
async function executeRequest<T = any>(
  url: string,
  headers: Headers,
  fetchOptions: RequestInit,
  timeout: number
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
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

    // Re-throw the error for proper error handling in components
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
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
   */
  getTestimonials: async (limit?: number) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    return await apiCall(`/products/testimonials/featured?${params.toString()}`);
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
   * Note: Không gửi username - backend tự tạo từ email
   * Gửi name để lưu vào user profile
   */
  register: async (name: string, email: string, password: string) => {
    return apiCall('/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  },

  /**
   * Lấy thông tin user hiện tại
   */
  getMe: async () => {
    return apiCall('/users/profile');
  },

  /**
   * Đăng nhập bằng Google
   * @param idToken - Google ID Token từ @react-oauth/google
   */
  googleLogin: async (idToken: string) => {
    return apiCall('/users/google-login', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
  },
};


/**
 * Category API endpoints
 */
export const categoryAPI = {
  /**
   * Lấy danh sách danh mục
   */
  getCategories: async () => {
    return await apiCall('/categories');
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
  getRevenueTimeline: async (period = 'month', days = 90, startDate?: Date | string, endDate?: Date | string) => {
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
  getOrderStatus: async (days = 30, startDate?: Date | string, endDate?: Date | string) => {
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
  getTopProducts: async (limit = 5, days = 30, startDate?: Date | string, endDate?: Date | string) => {
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
 * Shipping API endpoints
 * Quản lý vận chuyển, provider, location data từ GHN
 */
export const shippingAPI = {
  /**
   * Lấy danh sách nhà vận chuyển đang hoạt động
   */
  getProviders: async () => {
    return apiCall('/shipping/providers');
  },

  /**
   * Tính phí vận chuyển từ tất cả carriers
   * @param from - Thông tin địa chỉ gửi {districtId}
   * @param to - Thông tin địa chỉ nhận {districtId, wardCode} - wardCode bắt buộc!
   * @param weight - Cân nặng (gram)
   * @param value - Giá trị hàng (VND, optional)
   */
  calculateShipping: async (from: any, to: any, weight: number, value?: number) => {
    return apiCall('/shipping/calculate', {
      method: 'POST',
      body: JSON.stringify({ from, to, weight, value }),
    });
  },

  /**
   * Lấy danh sách tỉnh/thành từ Location model (GHN)
   */
  getProvinces: async () => {
    return apiCall('/shipping/locations/provinces');
  },

  /**
   * Lấy danh sách quận/huyện của một tỉnh từ Location model (GHN)
   * @param provinceId - ID tỉnh từ GHN
   */
  getDistricts: async (provinceId: number) => {
    return apiCall(`/shipping/locations/districts?provinceId=${provinceId}`);
  },

  /**
   * Lấy danh sách phường/xã của một quận từ Location model (GHN)
   * @param districtId - ID quận từ GHN
   */
  getWards: async (districtId: number) => {
    return apiCall(`/shipping/locations/wards?districtId=${districtId}`);
  },
};

/**
 * Shipment API endpoints
 * Quản lý tạo vận đơn, in nhãn, tracking
 */
export const shipmentAPI = {
  /**
   * Tạo vận đơn mới cho đơn hàng
   * @param orderId - ID đơn hàng
   * @param shippingProvider - Nhà vận chuyển (ghn, ghtk, viettel)
   * @param shippingService - Dịch vụ vận chuyển (standard, express, fast, etc)
   * @param to_name - Tên người nhận
   * @param to_phone - Số điện thoại người nhận
   * @param to_ward_code - Mã phường/xã (optional, lấy từ order nếu không cung cấp)
   */
  createShipment: async (
    orderId: string,
    shippingProvider: string,
    shippingService: string,
    to_name?: string,
    to_phone?: string,
    to_ward_code?: string
  ) => {
    return apiCall('/shipments', {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        shippingProvider,
        shippingService,
        to_name,
        to_phone,
        to_ward_code,
      }),
    });
  },

  /**
   * Lấy thông tin vận đơn
   * @param orderId - ID đơn hàng
   */
  getShipmentInfo: async (orderId: string) => {
    return apiCall(`/shipments/${orderId}`);
  },

  /**
   * Lấy link in nhãn vận đơn
   * @param orderId - ID đơn hàng
   */
  getPrintLabel: async (orderId: string) => {
    return apiCall(`/shipments/${orderId}/print-label`);
  },

  /**
   * Hủy vận đơn
   * @param orderId - ID đơn hàng
   */
  cancelShipment: async (orderId: string) => {
    return apiCall(`/shipments/${orderId}`, {
      method: 'DELETE',
    });
  },
};

/**
 * Location API endpoints
 */
export const locationAPI = {
  /**
   * Lấy danh sách tất cả tỉnh/thành phố Việt Nam
   */
  getProvinces: async () => {
    return await apiCall('/locations/provinces');
  },

  /**
   * Lấy danh sách quận/huyện theo mã tỉnh
   */
  getDistrictsByProvince: async (provinceCode: string) => {
    return await apiCall(`/locations/districts/${provinceCode}`);
  },

  /**
   * Lấy danh sách phường/xã theo mã quận
   */
  getWardsByDistrict: async (districtCode: string) => {
    return await apiCall(`/locations/wards/${districtCode}`);
  },

  /**
   * Tìm kiếm tỉnh theo từ khóa
   */
  searchProvinces: async (query: string) => {
    return await apiCall(`/locations/search/provinces?q=${encodeURIComponent(query)}`);
  },
};
