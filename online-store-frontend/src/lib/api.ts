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
import { handleApiError } from './errorHandler';
import { productAdapter } from './adapters';
import { DEFAULT_LOCALE, type Locale } from './i18n/types';

// Export BACKEND_URL for use in other files (e.g., image URL construction)
export { BACKEND_URL };

// Get current language from localStorage (SSR-safe)
function getCurrentLang(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const stored = localStorage.getItem('locale');
    return (stored as Locale) || DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export interface BackendProduct {
  _id: string;
  id?: string;
  name: string;
  brand: string;
  category?: { _id?: string; id?: string; name?: string; translationKey?: string } | string;
  price: number;
  originalPrice?: number;
  image?: string;
  images?: string[];
  rating?: number;
  numReviews?: number;
  countInStock?: number;
  specs?: Record<string, string | number>;
  description?: string;
  features?: string[];
  featuresTranslations?: Record<string, Record<string, string>>;
  specDisplay?: Array<{ field: string; label: string; value: string }>;
  featured?: boolean;
  deal?: { discount: number; endTime?: string | Date };
}

// API Base URL = proxy path (cùng domain với frontend)
const API_URL = API_BASE_PATH;

// Custom fetch options type that includes timeout
interface FetchOptions extends RequestInit {
  timeout?: number;
  skipCache?: boolean; // Option to skip deduplication for specific requests
  retry?: boolean; // Internal flag to prevent infinite retry loops
  adapter?: (data: any) => any; // Optional adapter to transform response data
}

// Cache for pending requests - prevent duplicate API calls
// Key: request signature (method + endpoint + body)
// Value: Promise that resolves to response data
const pendingRequests = new Map<string, Promise<any>>();

// Track request start times to invalidate old cache entries after timeout
const requestTimestamps = new Map<string, number>();
const REQUEST_CACHE_TTL = 5000; // 5 seconds - cache dedupe window

// In-memory access token storage (XSS protection)
// Will be implemented in step 2
let inMemoryAccessToken: string | null = null;

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

// Create a signature for deduplication
const createRequestSignature = (endpoint: string, options: FetchOptions): string => {
  const method = options.method || 'GET';
  const body = options.body ? String(options.body) : '';
  return `${method}:${endpoint}:${body}`;
};

/**
 * Get JWT token từ Memory (XSS Protection)
 *
 * Tại sao Memory thay vì localStorage?
 * - localStorage: Nếu dính XSS, hacker có thể JSON.parse() và lấy token
 * - Memory: Token chỉ ở RAM, F5 trang sẽ mất (nhưng refresh token ở httpOnly cookie sẽ lấy token mới)
 *
 * Flow:
 * 1. User login → token lưu vào inMemoryAccessToken (RAM)
 * 2. API call → lấy token từ inMemoryAccessToken
 * 3. Token hết hạn → auto-refresh token mới (từ refresh token httpOnly cookie)
 * 4. F5 trang → token RAM mất, nhưng localStorage có user info
 * 5. Component mount → AuthContext check localStorage, không có token → gọi getMe() để verify, không logout
 *
 * Fallback: Nếu inMemoryAccessToken null nhưng localStorage có user → gọi getMe() để xác minh
 */
export const getAuthToken = () => {
  if (typeof window === 'undefined') return null;
  return inMemoryAccessToken || null;
};

/**
 * Export function để set token từ AuthContext
 * (Phải export để AuthContext có thể gọi)
 */
export const setInMemoryAccessToken = (token: string | null) => {
  inMemoryAccessToken = token;
};

export const clearInMemoryAccessToken = () => {
  inMemoryAccessToken = null;
};

/**
 * Refresh access token bằng refresh token (stored in httpOnly cookie)
 * Called khi access token hết hạn (401 response)
 *
 * Flow:
 * 1. Nếu đang refresh, chờ promise hiện tại thay vì refresh lại
 * 2. Gọi /users/refresh endpoint (refresh token tự động gửi từ httpOnly cookie)
 * 3. Nếu thành công, cập nhật token trong memory để retry request cũ
 * 4. Return true để retry request cũ
 * 5. Nếu thất bại, logout ngay lập tức
 */
const refreshAccessToken = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  // Nếu đang refresh, chờ promise hiện tại thay vì refresh lại (prevent concurrent refresh)
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;

  refreshPromise = (async () => {
    try {
      // Gọi refresh endpoint (refresh token tự động gửi từ cookie nhờ credentials: 'include')
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error('refresh_token_timeout')), 5000); // 5 second timeout

      try {
        const response = await fetch(`${API_URL}/users/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Gửi refresh token từ httpOnly cookie
          signal: controller.signal,
        });

        if (!response.ok) {
          // Refresh failed → logout
          handleUnauthorized();
          return false;
        }

        // Refresh thành công → cập nhật access token
        const data = await response.json();
        const newAccessToken = data.accessToken || data.token;

        if (!newAccessToken) {
          handleUnauthorized();
          return false;
        }

        inMemoryAccessToken = newAccessToken; // Update memory token (if using in-memory storage)
        return true;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      handleUnauthorized();
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

/**
 * Handle 401 Unauthorized responses
 * Clears auth state and redirects to login
 */
const handleUnauthorized = () => {
  if (typeof window === 'undefined') return;

  const pathname = window.location.pathname;
  const isLoginPage = pathname.endsWith('/login') || pathname.endsWith('/login/');
  if (isLoginPage) return;

  // Clear auth from localStorage and memory
  clearInMemoryAccessToken();
  localStorage.removeItem('user');

  // Dispatch custom event for AuthContext to listen
  const event = new CustomEvent('auth:logout');
  window.dispatchEvent(event);

  // Redirect to login page and keep the current path
  const from = `${window.location.pathname}${window.location.search}${window.location.hash}`;
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
  const method = options.method || 'GET';

  // Build headers properly to handle all HeadersInit types
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');

  if (options.headers) {
    if (options.headers instanceof Headers) {
      for (const [k, v] of options.headers.entries()) {
        headers.set(k, v);
      }
    } else if (Array.isArray(options.headers)) {
      for (const [k, v] of options.headers) {
        headers.set(k, v);
      }
    } else {
      Object.entries(options.headers).forEach(([k, v]) => headers.set(k, String(v)));
    }
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Extract custom options
  const { timeout: customTimeout, skipCache = false, ...fetchOptions } = options;
  const timeout = customTimeout || 30000; // Increased from 15s to 30s to allow for slower operations

  // Check deduplication cache (skip for mutations or if explicitly disabled)
  const isMutation = method !== 'GET';

  if (!isMutation && !skipCache) {
    const signature = createRequestSignature(endpoint, options);
    const now = Date.now();
    const lastRequestTime = requestTimestamps.get(signature) || 0;

    // If request is already pending and within cache TTL, return existing promise
    if (pendingRequests.has(signature) && (now - lastRequestTime) < REQUEST_CACHE_TTL) {
      return pendingRequests.get(signature) as Promise<T>;
    }

    // Create new pending request promise
    const requestPromise = executeRequest<T>(url, headers, fetchOptions, timeout, endpoint, method)
      .finally(() => {
        // Remove from cache when done
        pendingRequests.delete(signature);
        requestTimestamps.delete(signature);
      });

    // Store in cache with timestamp
    pendingRequests.set(signature, requestPromise);
    requestTimestamps.set(signature, now);
    return requestPromise;
  }

  // For mutations or skipped cache, execute directly
  return executeRequest<T>(url, headers, fetchOptions, timeout, endpoint, method);
}

/**
 * Execute the actual fetch request with timeout & error handling
 * Includes automatic token refresh on 401
 */
async function executeRequest<T = any>(
  url: string,
  headers: Headers,
  fetchOptions: FetchOptions,
  timeout: number,
  endpoint?: string,
  method?: string
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`request_timeout`));
  }, timeout);
  const startTime = Date.now();
  const methodName = method || 'GET';
  const endpointName = endpoint || url;

  try {
    // ⚠️ SILENT REFRESH: If no token in memory but user is logged in (localStorage),
    // attempt to refresh token before sending request
    // This handles the case where user refreshes the page during checkout
    if (!getAuthToken() && typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        try {
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            const newToken = getAuthToken();
            if (newToken) {
              headers.set('Authorization', `Bearer ${newToken}`);
            }
          }
        } catch (error) {
          // Continue with request anyway, 401 handler will catch it
        }
      }
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include',  // Include cookies (refresh token in httpOnly cookie)
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const duration = Date.now() - startTime;
    const responseSize = response.headers.get('content-length');

    // Handle 401 Unauthorized (token expired or invalid)
    if (response.status === 401) {
      // Prevent infinite retry loops (check if this is already a retry)
      const isRetry = (fetchOptions as FetchOptions).retry;

      if (isRetry) {
        // This is a retry request → token refresh failed → logout
        handleUnauthorized();

        // Show toast
        handleApiError({
          status: 401,
          message: 'error_session_expired',
          endpoint: endpointName,
          method: methodName,
        });

        throw new Error('error_session_expired');
      }

      // Try to refresh access token
      const refreshSuccess = await refreshAccessToken();

      if (!refreshSuccess) {
        // Refresh failed → logout
        // Show toast
        handleApiError({
          status: 401,
          message: 'error_session_expired',
          endpoint: endpointName,
          method: methodName,
        });

        throw new Error('error_session_expired');
      }

      // Refresh successful → retry the original request with updated token
      // Update headers with new token
      const newToken = getAuthToken();
      if (newToken) {
        headers.set('Authorization', `Bearer ${newToken}`);
      }

      // Retry with retry flag to prevent infinite loops
      return executeRequest<T>(url, headers, { ...fetchOptions, retry: true }, timeout, endpoint, method);
    }

    if (!response.ok) {
      let errorMessage = `api_error`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (parseError) {
        // If response body is not JSON, use status code
        errorMessage = `http_error`;
      }

      // Show toast notification for user
      handleApiError({
        status: response.status,
        message: errorMessage,
        endpoint: endpointName,
        method: methodName,
      });

      throw new Error(errorMessage);
    }

    const data = await response.json();

    // Apply adapter if provided
    if (fetchOptions.adapter) {
      try {
        return fetchOptions.adapter(data);
      } catch (adapterError) {
        // Fallback to raw data if adapter fails
        return data as T;
      }
    }

    return data as T;
  } catch (error) {
    clearTimeout(timeoutId);

    const duration = Date.now() - startTime;

    // Check if error is an AbortError (either from our timeout or from browser/Next.js)
    const isAbortError = error && (
      (error as any).name === 'AbortError' ||
      (error as any).name === 'TimeoutError' ||
      (error instanceof Error && error.message.includes('timeout'))
    );

    if (isAbortError) {
      const timeoutError = 'request_timeout';

      // Show toast for timeout
      handleApiError({
        status: 408,
        message: timeoutError,
        endpoint: endpointName,
        method: methodName,
      });

      throw new Error(timeoutError);
    }

    // Handle "Failed to fetch" - usually network error or CORS
    if (error instanceof Error && error.message.includes('Failed to fetch')) {
      const networkError = 'network_error_title';

      // Retry once for GET requests on network failures
      const isGetRequest = methodName === 'GET';
      if (isGetRequest && !(fetchOptions as FetchOptions).retry) {
        try {
          console.warn(`[API] Network error on ${methodName} ${endpointName}, retrying...`);
          return executeRequest<T>(url, headers, { ...fetchOptions, retry: true }, timeout, endpoint, method);
        } catch (retryError) {
          handleApiError({
            status: 0,
            message: networkError,
            endpoint: endpointName,
            method: methodName,
          });
          throw new Error(networkError);
        }
      }

      handleApiError({
        status: 0,
        message: networkError,
        endpoint: endpointName,
        method: methodName,
      });

      throw new Error(networkError);
    }

    // Show toast for other network errors
    if (error instanceof Error && !error.message.includes('API Error')) {
      if (error.message.includes('Network')) {
        handleApiError({
          status: 0,
          message: error.message,
          endpoint: endpointName,
          method: methodName,
        });
      }
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
   * @param minDiscount - Giảm giá tối thiểu (%)
   * @param maxDiscount - Giảm giá tối đa (%)
   * @param lang - Locale hiện tại
   * @param featured - Lọc sản phẩm nổi bật
   * @param hotDeal - Lọc sản phẩm có deal
   * @param minRating - Đánh giá tối thiểu
   * @param maxRating - Đánh giá tối đa
   */
  getProducts: async (
    page = 1,
    keyword?: string,
    category?: string,
    brand?: string,
    pageSize = 9,
    minPrice?: number,
    maxPrice?: number,
    inStock?: boolean,
    minDiscount?: number,
    maxDiscount?: number,
    featured?: boolean,
    hotDeal?: boolean,
    minRating?: number,
    maxRating?: number
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
    if (minDiscount !== undefined) params.append('minDiscount', minDiscount.toString());
    if (maxDiscount !== undefined) params.append('maxDiscount', maxDiscount.toString());
    if (featured !== undefined) params.append('featured', featured.toString());
    if (hotDeal !== undefined) params.append('hasDeal', hotDeal.toString());
    if (minRating !== undefined) params.append('minRating', minRating.toString());
    if (maxRating !== undefined) params.append('maxRating', maxRating.toString());

    return apiCall(`/products?${params.toString()}`, {
      adapter: (data) => ({
        ...data,
        products: productAdapter.transformArray(data.products)
      })
    });
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

    return apiCall(`/products/featured/list?${params.toString()}`, {
      adapter: (data) => ({
        ...data,
        products: productAdapter.transformArray(data.products)
      })
    });
  },

  /**
   * Lấy chi tiết sản phẩm
   */
  getProductById: async (id: string) => {
    return apiCall(`/products/${id}`, {
      adapter: (data) => productAdapter.transform(data)
    });
  },

  /**
   * Lấy sản phẩm được đánh giá cao nhất
   */
  getTopRated: async () => {
    return apiCall(`/products/top/rated`, {
      adapter: (data) => productAdapter.transformArray(data)
    });
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
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'product_creation_failed');
    }

    const data = await response.json();
    return productAdapter.transform(data);
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
      throw new Error('product_update_failed');
    }

    const data = await response.json();
    return productAdapter.transform(data);
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
    return apiCall(`/products/deleted/list?${params.toString()}`, {
      adapter: (data) => ({
        ...data,
        products: productAdapter.transformArray(data.products)
      })
    });
  },

  /**
   * Khôi phục sản phẩm đã xóa (Admin only)
   */
  restoreProduct: async (id: string) => {
    return apiCall(`/products/${id}/restore`, {
      method: 'PUT',
      adapter: (data) => productAdapter.transform(data)
    });
  },

  /**
   * Export products (JSON/CSV format)
   * @param format - 'json' hoặc 'csv'
   * @param category - Filter theo danh mục (optional)
   * @param brand - Filter theo hãng (optional)
   * @param limit - Giới hạn số sản phẩm (mặc định: 10000)
   */
  exportProducts: async (format: 'json' | 'csv' = 'json', category?: string, brand?: string, limit?: number) => {
    const params = new URLSearchParams();
    params.append('format', format);
    if (category && category !== 'all') params.append('category', category);
    if (brand && brand !== 'all') params.append('brand', brand);
    if (limit) params.append('limit', limit.toString());

    const token = getAuthToken();
    const url = `${API_URL}/products/admin/export?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
    });

    if (!response.ok) {
      // Try to parse error message from response
      let errorMessage = 'product_export_failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch (e) {
        // If response is not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    // For CSV, return text; for JSON, return JSON
    if (format === 'csv') {
      return response.text();
    }
    return response.json();
  },

  /**
   * Lấy thống kê export (categories, brands, suppliers, total count)
   */
  getExportStats: async () => {
    return apiCall('/products/admin/export-stats');
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
   * Đăng xuất - Xóa refresh token từ server
   * QUAN TRỌNG: Backend sẽ xóa refresh token từ httpOnly cookie
   * Điều này ngăn chặn việc sử dụng lại refresh token cũ
   */
  logout: async () => {
    try {
      return await apiCall('/users/logout', {
        method: 'POST',
        skipCache: true, // Always send logout request (don't cache)
      });
    } catch (error) {
      // If logout fails, still clear local auth state on client
      // This prevents security issues where client remains authenticated
      throw error;
    }
  },

  /**
   * Refresh access token bằng refresh token
   * Refresh token được gửi tự động từ httpOnly cookie nhờ credentials: 'include'
   * Note: Hàm này được gọi tự động bởi executeRequest khi 401 xảy ra
   * Không cần gọi trực tiếp từ components (nó xử lý auto)
   */
  refreshToken: async () => {
    return apiCall('/users/refresh', {
      method: 'POST',
      skipCache: true, // Always refresh, never cache
    });
  },

  /**
   * Cập nhật thông tin user (name, email, phone, address, password)
   * @param userData - Object chứa các field cần update
   */
  updateProfile: async (userData: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    password?: string;
  }) => {
    return apiCall('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  },

  /**
   * Đổi mật khẩu
   * @param newPassword - Mật khẩu mới
   */
  changePassword: async (newPassword: string) => {
    return apiCall('/users/profile', {
      method: 'PUT',
      body: JSON.stringify({ password: newPassword }),
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
    return await apiCall(`/categories`);
  },

  /**
   * Lấy chi tiết danh mục
   */
  getCategoryById: async (id: string) => {
    return apiCall(`/categories/${id}`);
  },
};

/**
 * Coupon API endpoints
 */
export interface CouponData {
  code: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxUses?: number;
  minOrderAmount?: number;
  applicableProducts?: string[];
  applicableCategories?: string[];
  startDate: string;
  endDate: string;
  isActive?: boolean;
}

export interface BannerRecord {
  _id: string;
  title: string;
  subtitle?: string;
  description?: string;
  ctaText?: string;
  targetUrl?: string;
  image: string;
  imagePublicId?: string | null;
  slot: string;
  sortOrder?: number;
  isActive?: boolean;
  openInNewTab?: boolean;
  startDate?: string;
  endDate?: string;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const couponAPI = {
  /**
   * Lấy danh sách coupon
   */
  getCoupons: async (pageNumber = 1, keyword = '', pageSize = 10, discountType?: 'percentage' | 'fixed') => {
    const params = new URLSearchParams();
    params.append('pageNumber', pageNumber.toString());
    params.append('pageSize', pageSize.toString());
    if (keyword) params.append('keyword', keyword);
    if (discountType) params.append('discountType', discountType);
    return apiCall(`/coupons?${params.toString()}`);
  },

  /**
   * Lấy danh sách coupon đã xóa
   */
  getDeletedCoupons: async (pageNumber = 1, keyword = '', pageSize = 10, discountType?: 'percentage' | 'fixed') => {
    const params = new URLSearchParams();
    params.append('pageNumber', pageNumber.toString());
    params.append('pageSize', pageSize.toString());
    if (keyword) params.append('keyword', keyword);
    if (discountType) params.append('discountType', discountType);
    return apiCall(`/coupons/deleted/list?${params.toString()}`);
  },

  /**
   * Lấy chi tiết coupon
   */
  getCouponById: async (id: string) => {
    return apiCall(`/coupons/${id}`);
  },

  /**
   * Lấy coupon theo code
   */
  getCouponByCode: async (code: string) => {
    return apiCall(`/coupons/code/${encodeURIComponent(code)}`);
  },

  /**
   * Tạo coupon mới
   */
  createCoupon: async (data: CouponData) => {
    return apiCall('/coupons', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Cập nhật coupon
   */
  updateCoupon: async (id: string, data: Partial<CouponData>) => {
    return apiCall(`/coupons/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Xóa coupon
   */
  deleteCoupon: async (id: string) => {
    return apiCall(`/coupons/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Khôi phục coupon
   */
  restoreCoupon: async (id: string) => {
    return apiCall(`/coupons/${id}/restore`, {
      method: 'PUT',
    });
  },

  /**
   * Xóa vĩnh viễn coupon
   */
  hardDeleteCoupon: async (id: string) => {
    return apiCall(`/coupons/${id}/hard`, {
      method: 'DELETE',
    });
  },

  /**
   * Tính giảm giá
   */
  calculateDiscount: async (couponCode: string, orderAmount: number, products?: string[]) => {
    return apiCall('/coupons/calculate', {
      method: 'POST',
      body: JSON.stringify({ couponCode, orderAmount, products }),
    });
  },
};

/**
 * Banner API endpoints
 */
export const bannerAPI = {
  getBanners: async (slot?: string, activeOnly = true, pageNumber = 1, pageSize = 10) => {
    const params = new URLSearchParams();
    params.append('pageNumber', pageNumber.toString());
    params.append('pageSize', pageSize.toString());
    params.append('activeOnly', String(activeOnly));
    if (slot) params.append('slot', slot);
    return apiCall(`/banners?${params.toString()}`);
  },

  getBannerById: async (id: string) => {
    return apiCall(`/banners/${id}`);
  },

  getDeletedBanners: async (pageNumber = 1, pageSize = 10, slot?: string) => {
    const params = new URLSearchParams();
    params.append('pageNumber', pageNumber.toString());
    params.append('pageSize', pageSize.toString());
    if (slot) params.append('slot', slot);
    return apiCall(`/banners/deleted/list?${params.toString()}`);
  },

  createBanner: async (formData: FormData) => {
    const token = getAuthToken();
    const response = await fetch(`${API_URL}/banners`, {
      method: 'POST',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'banner_creation_failed');
    }

    return response.json();
  },

  updateBanner: async (id: string, formData: FormData) => {
    const token = getAuthToken();
    const response = await fetch(`${API_URL}/banners/${id}`, {
      method: 'PUT',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'banner_update_failed');
    }

    return response.json();
  },

  deleteBanner: async (id: string) => {
    return apiCall(`/banners/${id}`, { method: 'DELETE' });
  },

  restoreBanner: async (id: string) => {
    return apiCall(`/banners/${id}/restore`, { method: 'PUT' });
  },

  hardDeleteBanner: async (id: string) => {
    return apiCall(`/banners/${id}/hard`, { method: 'DELETE' });
  },

  getBannerSlots: async () => {
    return apiCall('/banners/slots');
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
      throw new Error(errorData.message || 'review_creation_failed');
    }

    return response.json();
  },
};

/**
 * Order API endpoints
 */
export interface CreateOrderData {
  orderItems: Array<{
    product: string;
    name: string;
    qty: number;
    image?: string;
    price: number;
  }>;
  itemsPrice: number;
  taxPrice: number;
  shippingFee: number;
  totalPrice: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress?: {
    name?: string;
    phone?: string;
    address?: string;
    wardCode?: string;
    wardName?: string;
    districtId?: string | number;
    districtName?: string;
    provinceId?: string | number;
    provinceName?: string;
  };
  paymentMethod?: string;
  shippingProvider?: string;
  shippingService?: string;
}

export const orderAPI = {
  /**
   * Tạo đơn hàng mới
   */
  createOrder: async (orderData: CreateOrderData) => {
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
   * @param lang - Ngôn ngữ để lấy thông tin sản phẩm
   */
  getMyOrders: async () => {
    return apiCall(`/orders/myorders`);
  },

  /**
   * Lấy chi tiết đơn hàng
   * @param id - ID đơn hàng
   * @param lang - Ngôn ngữ để lấy thông tin sản phẩm
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
   * Cập nhật trạng thái đơn hàng (admin)
   * @param orderId - ID của đơn hàng
   * @param status - Object chứa trạng thái cần cập nhật (e.g., { isDelivered: true })
   */
  updateOrderStatus: async (orderId: string, status: { isDelivered?: boolean; isPaid?: boolean }) => {
    return apiCall(`/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify(status),
    });
  },

  /**
   * Xác nhận thanh toán với backend (bảo mật)
   * ⚠️ Gọi endpoint này thay vì tin URL params từ payment gateway
   * Backend sẽ verify: payment record tồn tại, amount khớp, status là success
   * @param orderId - ID của đơn hàng
   */
  confirmPayment: async (orderId: string) => {
    return apiCall(`/payments/confirm/${orderId}`);
  },
};

/**
 * Customer API endpoints
 */

export interface CustomerData {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

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
  createCustomer: async (data: CustomerData) => {
    return apiCall('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Cập nhật khách hàng (Admin only)
   */
  updateCustomer: async (id: string, data: CustomerData) => {
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

  /**
   * Xóa cứng khách hàng (Admin only)
   */
  hardDeleteCustomer: async (id: string) => {
    return apiCall(`/customers/${id}/hard`, { method: 'DELETE' });
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
   * @param lang - Ngôn ngữ (mặc định: hiện tại)
   */
  getTopProducts: async (limit = 5, days = 30, startDate?: Date | string, endDate?: Date | string, lang = getCurrentLang()) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('lang', lang);

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
   * @param lang - Ngôn ngữ (mặc định: hiện tại)
   */
  getDashboardData: async (days = 30, lang = getCurrentLang()) => {
    const params = new URLSearchParams();
    params.append('days', days.toString());
    params.append('lang', lang);
    return apiCall(`/analytics/dashboard-data?${params.toString()}`);
  },

  /**
   * Lấy sản phẩm bán chậm (low-performing products)
   * Dựa trên: số lượng order ít & tồn kho cao
   * @param limit - Số sản phẩm (mặc định 10)
   * @param days - Số ngày quay lại (mặc định 30)
   * @param lang - Ngôn ngữ (mặc định: hiện tại)
   */
  getSlowSellingProducts: async (limit = 10, days = 30, lang = getCurrentLang()) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('days', days.toString());
    params.append('lang', lang);
    return apiCall(`/analytics/slow-selling-products?${params.toString()}`);
  },

  /**
   * Lấy đơn hàng chưa thanh toán (unpaid orders)
   * @param limit - Số đơn (mặc định 20)
   * @param days - Số ngày quay lại (mặc định 30)
   */
  getUnpaidOrders: async (limit = 20, days = 30) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('days', days.toString());
    return apiCall(`/analytics/unpaid-orders?${params.toString()}`);
  },

  /**
   * Lấy khách hàng không hoạt động (inactive customers)
   * Dựa trên: không có order hoặc order cũ
   * @param limit - Số khách (mặc định 10)
   * @param days - Số ngày để xem xét inactive (mặc định 90)
   */
  getInactiveCustomers: async (limit = 10, days = 90) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('days', days.toString());
    return apiCall(`/analytics/inactive-customers?${params.toString()}`);
  },

  /**
   * Lấy sản phẩm tồn kho thấp (low inventory products) với phân trang
   * @param limit - Số sản phẩm mỗi trang (mặc định: 10)
   * @param page - Trang hiện tại (mặc định: 1)
   * @param sort - Sắp xếp: countInStock, price, -countInStock, -price
   * @param threshold - Tồn kho <= threshold là thấp (mặc định: 10)
   */
  getLowInventoryProducts: async (limit = 10, page = 1, sort = 'countInStock', threshold = 10) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('page', page.toString());
    params.append('sort', sort);
    params.append('threshold', threshold.toString());
    return apiCall(`/analytics/low-inventory?${params.toString()}`);
  },

  /**
   * Lấy sản phẩm có rating kém (low rating products) với phân trang
   * @param limit - Số sản phẩm mỗi trang (mặc định: 10)
   * @param page - Trang hiện tại (mặc định: 1)
   * @param sort - Sắp xếp: rating, numReviews, -rating, -numReviews
   * @param ratingThreshold - Rating <= threshold (mặc định: 3.0)
   * @param minReviews - Sản phẩm phải có ít nhất bao nhiêu reviews (mặc định: 1)
   */
  getLowRatingProducts: async (limit = 10, page = 1, sort = 'rating', ratingThreshold = 3.0, minReviews = 1) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('page', page.toString());
    params.append('sort', sort);
    params.append('ratingThreshold', ratingThreshold.toString());
    params.append('minReviews', minReviews.toString());
    return apiCall(`/analytics/low-rating?${params.toString()}`);
  },

  /**
   * Lấy top customers theo tổng chi tiêu (top customers by total spent) với phân trang
   * @param limit - Số khách mỗi trang (mặc định: 10)
   * @param page - Trang hiện tại (mặc định: 1)
   * @param sort - Sắp xếp: totalSpent, totalOrders, -totalSpent, -totalOrders
   * @param days - Chỉ tính đơn hàng trong N ngày gần đây (mặc định: 0 = tất cả)
   */
  getTopCustomers: async (limit = 10, page = 1, sort = '-totalSpent', days = 0) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('page', page.toString());
    params.append('sort', sort);
    params.append('days', days.toString());
    return apiCall(`/analytics/top-customers?${params.toString()}`);
  },

  /**
   * Lấy đơn hàng đã thanh toán (paid orders) với phân trang
   * @param limit - Số đơn mỗi trang (mặc định: 20)
   * @param page - Trang hiện tại (mặc định: 1)
   * @param sort - Sắp xếp: createdAt, totalPrice, -createdAt, -totalPrice
   * @param days - Chỉ lấy đơn hàng từ N ngày gần đây (mặc định: 30)
   */
  getPaidOrders: async (limit = 20, page = 1, sort = '-createdAt', days = 30) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('page', page.toString());
    params.append('sort', sort);
    params.append('days', days.toString());
    return apiCall(`/analytics/paid-orders?${params.toString()}`);
  },

  /**
   * Lấy mã giảm giá chưa được sử dụng hoặc ít sử dụng (unused/underutilized coupons) với phân trang
   * @param limit - Số mã mỗi trang (mặc định: 10)
   * @param page - Trang hiện tại (mặc định: 1)
   * @param sort - Sắp xếp: currentUses, maxUses, discountValue, -currentUses
   * @param maxUsageRatio - Tỷ lệ sử dụng tối đa (mặc định: 0.5 = 50%)
   */
  getUnusedCoupons: async (limit = 10, page = 1, sort = 'currentUses', maxUsageRatio = 0.5) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('page', page.toString());
    params.append('sort', sort);
    params.append('maxUsageRatio', maxUsageRatio.toString());
    return apiCall(`/analytics/unused-coupons?${params.toString()}`);
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
