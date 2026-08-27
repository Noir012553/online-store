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
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from './i18n/types';

// Export BACKEND_URL for use in other files (e.g., image URL construction)
export { BACKEND_URL };

// Get current language from localStorage (SSR-safe)
// Must match key used in LanguageContext (laptopstore_lang)
function getCurrentLang(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const stored = localStorage.getItem('laptopstore_lang');
    const normalized = stored?.toLowerCase().split('-')[0];
    return normalized && SUPPORTED_LOCALES.includes(normalized as Locale)
      ? normalized as Locale
      : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Wrapper để tự động thêm ?lang=currentLang vào dynamic data requests
 * Cơ chế: Intercept tất cả fetch calls tới /products, /categories, /orders
 * Tự động append ?lang=${getCurrentLang()} nếu chưa có
 */
function buildLocalizedUrl(endpoint: string): string {
  const localizableEndpoints = [
    '/products',
    '/categories',
    '/brands',
    '/orders',
    '/shipping',
    '/coupons',
    '/banners',
    '/reviews',
  ];

  const needsLocalization = localizableEndpoints.some(ep => endpoint.includes(ep));

  if (!needsLocalization) return endpoint;

  const separator = endpoint.includes('?') ? '&' : '?';
  const currentLang = getCurrentLang();

  if (endpoint.includes('lang=')) return endpoint;

  return `${endpoint}${separator}lang=${currentLang}`;
}

export interface BackendProduct {
  _id: string;
  id?: string;
  name: string;
  brand: string;
  category?: { _id?: string; id?: string; name?: string; translationKey?: string } | string;
  categoryName?: string;
  price: number;
  formattedPrice?: string;
  baseCurrencyCode: string;
  originalPrice?: number;
  formattedOriginalPrice?: string;
  discountPercentage?: number;
  image?: string;
  images?: string[];
  rating?: number;
  numReviews?: number;
  reviews?: number | unknown[];
  countInStock?: number;
  specs?: Record<string, string | number>;
  specLabels?: Record<string, string>;
  description?: string;
  specDisplay?: Array<{ field: string; label: string; value: string }>;
  featured?: boolean;
  deal?: { discount: number; endTime?: string | Date };
}

// API Base URL = proxy path (cùng domain với frontend)
const API_URL = API_BASE_PATH;
const API_DEBUG_ENABLED = process.env.NEXT_PUBLIC_API_DEBUG !== 'false';
let apiRequestSequence = 0;

const debugApi = (event: string, details: Record<string, unknown> = {}) => {
  if (!API_DEBUG_ENABLED || typeof console === 'undefined') return;
  console.log(`[API_DEBUG] ${event}`, details);
};

const describeResponse = (data: unknown) => ({
  type: Array.isArray(data) ? 'array' : data === null ? 'null' : typeof data,
  arrayLength: Array.isArray(data) ? data.length : undefined,
  keys: data && typeof data === 'object' && !Array.isArray(data)
    ? Object.keys(data).slice(0, 20)
    : undefined,
});

const isFeaturedProductsEndpoint = (endpoint: string) => endpoint.includes('/products/featured/list');

// Custom fetch options type that includes timeout
interface FetchOptions extends RequestInit {
  timeout?: number;
  skipCache?: boolean; // Option to skip deduplication for specific requests
  skipAuthRecovery?: boolean; // Auth endpoints handle their own 401 response
  skipErrorToast?: boolean; // Optional requests render their own error state
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
let isHandlingUnauthorized = false;
let isRefreshing = false;
let refreshPromise: Promise<boolean | 'rate_limited'> | null = null;
let refreshBlockedUntil = 0;
let authRefreshPromise: Promise<any> | null = null;
const REFRESH_BLOCKED_UNTIL_KEY = 'laptopstore_refresh_blocked_until';

const getPersistedRefreshBlockedUntil = () => {
  if (typeof window === 'undefined') return 0;
  try {
    const blockedUntil = Number(localStorage.getItem(REFRESH_BLOCKED_UNTIL_KEY));
    return Number.isFinite(blockedUntil) ? blockedUntil : 0;
  } catch {
    return 0;
  }
};

const persistRefreshBlockedUntil = (retryAfterSeconds: number) => {
  if (typeof window === 'undefined' || !Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) return;
  try {
    localStorage.setItem(
      REFRESH_BLOCKED_UNTIL_KEY,
      String(Date.now() + retryAfterSeconds * 1000),
    );
  } catch {
    return;
  }
};

const clearPersistedRefreshBlock = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(REFRESH_BLOCKED_UNTIL_KEY);
  } catch {
    return;
  }
};

const requestAuthRefresh = async () => {
  if (typeof window === 'undefined' || Date.now() < getPersistedRefreshBlockedUntil()) {
    return undefined;
  }

  if (authRefreshPromise) return authRefreshPromise;

  if (isRefreshing && refreshPromise) {
    const refreshed = await refreshPromise;
    return refreshed === true ? { accessToken: getAuthToken() } : undefined;
  }

  authRefreshPromise = apiCall('/users/refresh', {
    method: 'POST',
    skipCache: true,
    skipAuthRecovery: true,
  })
    .then((data) => {
      clearPersistedRefreshBlock();
      return data;
    })
    .catch((error: any) => {
      if (error?.status === 429) {
        persistRefreshBlockedUntil(Number(error.retryAfter));
      }
      throw error;
    })
    .finally(() => {
      authRefreshPromise = null;
    });

  return authRefreshPromise;
};

// Create a signature for deduplication
const createRequestSignature = (endpoint: string, options: FetchOptions): string => {
  const method = options.method || 'GET';
  const body = options.body ? String(options.body) : '';
  const session = getAuthToken() || 'anonymous';
  return `${method}:${endpoint}:${body}:${session}`;
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
 * 4. F5 trang → AuthContext lấy access token mới từ refresh token trong cookie HttpOnly
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
  if (token) isHandlingUnauthorized = false;
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
const refreshAccessToken = async (): Promise<boolean | 'rate_limited'> => {
  if (typeof window === 'undefined' || isHandlingUnauthorized) return false;
  if (Date.now() < refreshBlockedUntil || Date.now() < getPersistedRefreshBlockedUntil()) {
    return 'rate_limited';
  }

  if (authRefreshPromise) {
    try {
      const data = await authRefreshPromise;
      const newAccessToken = data?.accessToken || data?.token;
      if (newAccessToken) {
        inMemoryAccessToken = newAccessToken;
        return true;
      }
    } catch (error: any) {
      if (error?.status === 429) return 'rate_limited';
      handleUnauthorized();
      return false;
    }
    handleUnauthorized();
    return false;
  }

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

        if (response.status === 429) {
          const retryAfterSeconds = Number(response.headers.get('Retry-After'));
          if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
            refreshBlockedUntil = Date.now() + retryAfterSeconds * 1000;
            persistRefreshBlockedUntil(retryAfterSeconds);
          }
          return 'rate_limited';
        }

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
        clearPersistedRefreshBlock();
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
  if (typeof window === 'undefined' || isHandlingUnauthorized) return;

  isHandlingUnauthorized = true;
  clearInMemoryAccessToken();
  window.dispatchEvent(new CustomEvent('auth:logout'));

  const pathname = window.location.pathname;
  const isLoginPage = pathname.endsWith('/login') || pathname.endsWith('/login/');
  if (isLoginPage) return;

  const from = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(`/login?from=${encodeURIComponent(from)}`);
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
  const requestId = ++apiRequestSequence;

  debugApi('request:queued', {
    requestId,
    method,
    endpoint,
    url,
    hasAuthToken: Boolean(token),
    hasExternalSignal: Boolean(options.signal),
    timeout: options.timeout || 30000,
    retry: Boolean(options.retry),
    skipCache: Boolean(options.skipCache),
  });

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
  const {
    timeout: customTimeout,
    skipCache = false,
    skipAuthRecovery = false,
    skipErrorToast = false,
    adapter,
    signal: externalSignal,
    ...fetchOptions
  } = options;
  const timeout = customTimeout || 30000; // Increased from 15s to 30s to allow for slower operations

  // Requests with caller-owned signals must keep their own cancellation lifecycle.
  const isMutation = method !== 'GET';

  if (!isMutation && !skipCache && !externalSignal) {
    const signature = createRequestSignature(endpoint, options);
    const now = Date.now();
    const lastRequestTime = requestTimestamps.get(signature) || 0;

    // If request is already pending and within cache TTL, return existing promise
    if (pendingRequests.has(signature) && (now - lastRequestTime) < REQUEST_CACHE_TTL) {
      return pendingRequests.get(signature) as Promise<T>;
    }

    // Create new pending request promise
    const requestPromise = executeRequest<T>(
      url,
      headers,
      { ...fetchOptions, skipAuthRecovery, skipErrorToast, adapter, signal: externalSignal },
      timeout,
      endpoint,
      method,
      requestId,
    )
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
  return executeRequest<T>(
    url,
    headers,
    { ...fetchOptions, skipAuthRecovery, skipErrorToast, adapter, signal: externalSignal },
    timeout,
    endpoint,
    method,
    requestId,
  );
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
  method?: string,
  requestId?: number,
): Promise<T> {
  const controller = new AbortController();
  const externalSignal = fetchOptions.signal;
  const abortRequest = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener('abort', abortRequest, { once: true });
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`request_timeout`));
  }, timeout);
  const startTime = Date.now();
  const methodName = method || 'GET';
  const endpointName = endpoint || url;

  debugApi('attempt:start', {
    requestId,
    method: methodName,
    endpoint: endpointName,
    timeout,
    retry: Boolean(fetchOptions.retry),
    signalAborted: Boolean(externalSignal?.aborted),
  });

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include',  // Include cookies (refresh token in httpOnly cookie)
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortRequest);

    const duration = Date.now() - startTime;
    const responseSize = response.headers.get('content-length');

    debugApi('attempt:response', {
      requestId,
      method: methodName,
      endpoint: endpointName,
      status: response.status,
      ok: response.ok,
      durationMs: duration,
      responseSize,
      retry: Boolean(fetchOptions.retry),
    });

    if (isFeaturedProductsEndpoint(endpointName)) {
      const responseBody = await response.clone().text().catch((bodyError) => `[unreadable: ${bodyError instanceof Error ? bodyError.message : String(bodyError)}]`);
      debugApi('featured:response-body', {
        requestId,
        endpoint: endpointName,
        status: response.status,
        body: responseBody,
      });
    }

    // Handle 401 Unauthorized (token expired or invalid)
    if (response.status === 401 && !fetchOptions.skipAuthRecovery) {
      const errorCode = await response.clone().json()
        .then((data) => data?.code)
        .catch(() => undefined);

      if (errorCode === 'USER_NOT_FOUND') {
        handleUnauthorized();
        throw new Error('error_session_expired');
      }

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
      const refreshResult = await refreshAccessToken();

      if (refreshResult === 'rate_limited') {
        handleApiError({
          status: 429,
          message: 'error_rate_limited',
          endpoint: endpointName,
          method: methodName,
        });
        throw new Error('error_rate_limited');
      }

      if (!refreshResult) {
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

      debugApi('retry:auth-refresh', {
        requestId,
        endpoint: endpointName,
        status: response.status,
      });
      return await executeRequest<T>(url, headers, { ...fetchOptions, retry: true }, timeout, endpoint, method, requestId);
    }

    const isRetry = Boolean((fetchOptions as FetchOptions).retry);
    const isRetryableUpstreamStatus = [500, 502, 503, 504].includes(response.status);
    if (methodName === 'GET' && isRetryableUpstreamStatus && !isRetry) {
      debugApi('retry:upstream-status', {
        requestId,
        endpoint: endpointName,
        status: response.status,
      });
      return await executeRequest<T>(url, headers, { ...fetchOptions, retry: true }, timeout, endpoint, method, requestId);
    }

    if (!response.ok) {
      let errorMessage = `api_error`;
      let errorCode: string | undefined;
      let errorParams: Record<string, unknown> | undefined;
      try {
        const errorData = await response.json();
        if (errorData && errorData.message) {
          errorMessage = errorData.message;
        }
        errorCode = errorData?.code;
        errorParams = errorData?.params;
      } catch (parseError) {
        // If response body is not JSON, use status code
        errorMessage = `http_error`;
      }

      if (!fetchOptions.skipErrorToast) {
        handleApiError({
          status: response.status,
          message: errorMessage,
          code: errorCode,
          params: errorParams,
          endpoint: endpointName,
          method: methodName,
        });
      }

      const apiError = new Error(errorMessage) as Error & {
        code?: string;
        params?: Record<string, unknown>;
        status?: number;
        retryAfter?: number;
      };
      apiError.code = errorCode;
      apiError.params = errorParams;
      apiError.status = response.status;
      const retryAfter = Number(response.headers.get('Retry-After'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        apiError.retryAfter = retryAfter;
      }
      throw apiError;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json();

    debugApi('response:parsed', {
      requestId,
      endpoint: endpointName,
      ...describeResponse(data),
    });

    if (isFeaturedProductsEndpoint(endpointName)) {
      debugApi('featured:parsed-payload', {
        requestId,
        endpoint: endpointName,
        payload: data,
      });
    }

    // Apply adapter if provided
    if (fetchOptions.adapter) {
      try {
        const adaptedData = fetchOptions.adapter(data);
        debugApi('response:adapted', {
          requestId,
          endpoint: endpointName,
          ...describeResponse(adaptedData),
        });
        return adaptedData;
      } catch (adapterError) {
        debugApi('response:adapter-error', {
          requestId,
          endpoint: endpointName,
          errorName: adapterError instanceof Error ? adapterError.name : typeof adapterError,
          message: adapterError instanceof Error ? adapterError.message : String(adapterError),
          stack: adapterError instanceof Error ? adapterError.stack : undefined,
          payload: data,
        });
        // Fallback to raw data if adapter fails
        return data as T;
      }
    }

    return data as T;
  } catch (error) {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortRequest);

    debugApi('attempt:error', {
      requestId,
      method: methodName,
      endpoint: endpointName,
      durationMs: Date.now() - startTime,
      retry: Boolean(fetchOptions.retry),
      externalAborted: Boolean(externalSignal?.aborted),
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      code: typeof error === 'object' && error !== null ? String((error as any).code || '') : undefined,
      causeCode: typeof error === 'object' && error !== null ? String((error as any).cause?.code || '') : undefined,
    });

    const duration = Date.now() - startTime;

    if (externalSignal?.aborted) {
      throw error;
    }

    // Check if error is an AbortError (either from our timeout or from browser/Next.js)
    const isAbortError = error && (
      (error as any).name === 'AbortError' ||
      (error as any).name === 'TimeoutError' ||
      (error instanceof Error && error.message.includes('timeout'))
    );

    if (isAbortError) {
      debugApi('timeout:detected', {
        requestId,
        endpoint: endpointName,
        timeout,
        externalAborted: Boolean(externalSignal?.aborted),
      });
      const timeoutError = 'request_timeout';

      if (!fetchOptions.skipErrorToast) {
        handleApiError({
          status: 408,
          message: timeoutError,
          endpoint: endpointName,
          method: methodName,
        });
      }

      throw new Error(timeoutError);
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const transportErrorCode = typeof error === 'object' && error !== null
      ? String((error as any).code || (error as any).cause?.code || '')
      : '';
    const isNetworkTransportError = errorMessage.includes('Failed to fetch')
      || errorMessage.includes('fetch failed')
      || ['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'UND_ERR_SOCKET'].includes(transportErrorCode);

    if (isNetworkTransportError) {
      const networkError = 'network_error_title';

      if (methodName === 'GET' && !(fetchOptions as FetchOptions).retry) {
        debugApi('retry:transport-error', {
          requestId,
          endpoint: endpointName,
          message: errorMessage,
          code: transportErrorCode,
        });
        try {
          return await executeRequest<T>(url, headers, { ...fetchOptions, retry: true }, timeout, endpoint, method, requestId);
        } catch (retryError) {
          if (!fetchOptions.skipErrorToast) {
            handleApiError({
              status: 0,
              message: networkError,
              endpoint: endpointName,
              method: methodName,
            });
          }
          throw new Error(networkError);
        }
      }

      if (!fetchOptions.skipErrorToast) {
        handleApiError({
          status: 0,
          message: networkError,
          endpoint: endpointName,
          method: methodName,
        });
      }

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
   * @param requestOptions - Tùy chọn hủy request
   * @param sortBy - Cách sắp xếp kết quả
   * @param shockDeal - Lọc sản phẩm giảm từ 30% trở lên
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
    maxRating?: number,
    lang?: string,
    locale: string = lang || getCurrentLang(),
    currencyCode?: string,
    requestOptions?: Pick<FetchOptions, 'signal' | 'skipErrorToast' | 'timeout'>,
    sortBy = 'featured',
    shockDeal?: boolean
  ) => {
    const params = new URLSearchParams();
    params.append('pageNumber', page.toString());
    params.append('pageSize', pageSize.toString());
    params.append('lang', lang || getCurrentLang());
    params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
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
    if (sortBy) params.append('sortBy', sortBy);
    if (shockDeal !== undefined) params.append('shockDeal', shockDeal.toString());

    return apiCall(`/products?${params.toString()}`, {
      adapter: (data) => ({
        ...data,
        products: productAdapter.transformArray(data.products)
      }),
      ...requestOptions
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
    inStock?: boolean,
    lang?: string,
    locale: string = lang || getCurrentLang(),
    currencyCode?: string,
    hasSpecs?: boolean,
    prioritizeSpecs?: boolean,
    hasDeal?: boolean,
  ) => {
    const params = new URLSearchParams();
    params.append('pageNumber', page.toString());
    params.append('pageSize', pageSize.toString());
    params.append('lang', lang || getCurrentLang());
    params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
    if (keyword) params.append('keyword', keyword);
    if (category) params.append('category', category);
    if (brand) params.append('brand', brand);
    if (minPrice !== undefined) params.append('minPrice', minPrice.toString());
    if (maxPrice !== undefined) params.append('maxPrice', maxPrice.toString());
    if (inStock !== undefined) params.append('inStock', inStock.toString());
    if (hasSpecs !== undefined) params.append('hasSpecs', hasSpecs.toString());
    if (prioritizeSpecs !== undefined) params.append('prioritizeSpecs', prioritizeSpecs.toString());
    if (hasDeal !== undefined) params.append('hasDeal', hasDeal.toString());

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
  getProductById: async (
    id: string,
    lang?: Locale,
    requestOptions?: Pick<FetchOptions, 'signal'>,
    locale: string = lang || getCurrentLang(),
    currencyCode?: string,
  ) => {
    const params = new URLSearchParams({
      lang: lang || getCurrentLang(),
      locale,
    });
    if (currencyCode) params.append('currencyCode', currencyCode);
    return apiCall(`/products/${id}?${params.toString()}`, {
      adapter: (data) => productAdapter.transform(data),
      ...requestOptions
    });
  },

  /**
   * Lấy sản phẩm được đánh giá cao nhất
   * @param lang - Ngôn ngữ (mặc định: hiện tại)
   */
  getTopRated: async (lang = getCurrentLang(), locale: string = lang, currencyCode?: string) => {
    const params = new URLSearchParams();
    params.append('lang', lang);
    params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
    return apiCall(`/products/top/rated?${params.toString()}`, {
      adapter: (data) => productAdapter.transformArray(data)
    });
  },

  /**
   * Lấy thống kê chung của cửa hàng
   */
  getStatsOverview: async (locale?: string, currencyCode?: string) => {
    const params = new URLSearchParams({ lang: locale || getCurrentLang() });
    if (currencyCode) params.append('currencyCode', currencyCode);
    return apiCall(`/products/stats/overview?${params.toString()}`);
  },

  getAboutMedia: async () => {
    return apiCall('/products/about/media');
  },

  /**
   * Lấy testimonials từ reviews
   */
  getTestimonials: async (limit?: number, locale?: string) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    params.append('lang', locale || getCurrentLang());
    return await apiCall(`/products/testimonials/featured?${params.toString()}`);
  },

  /**
   * Tạo sản phẩm mới (Admin only)
   */
  createProduct: async (formData: FormData) => {
    const token = getAuthToken();
    const url = `${API_URL}/products?lang=${encodeURIComponent(getCurrentLang())}`;

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
    const url = `${API_URL}/products/${id}?lang=${encodeURIComponent(getCurrentLang())}`;

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
  getDeletedProducts: async (page = 1, pageSize = 9, lang?: Locale) => {
    const params = new URLSearchParams();
    params.append('pageNumber', page.toString());
    params.append('pageSize', pageSize.toString());
    const endpoint = `/products/deleted/list?${params.toString()}`;
    const finalEndpoint = lang ? `${endpoint}&lang=${lang}` : buildLocalizedUrl(endpoint);
    return apiCall(finalEndpoint, {
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
  exportProducts: async (format: 'json' | 'csv' = 'json', category?: string, brand?: string, limit?: number, locale?: string) => {
    const params = new URLSearchParams();
    params.append('format', format);
    if (locale) params.append('lang', locale);
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
   * Lấy thống kê export (categories, brands, total count)
   */
  getExportStats: async (locale?: string) => {
    const endpoint = '/products/admin/export-stats';
    const finalEndpoint = locale ? `${endpoint}?lang=${locale}` : buildLocalizedUrl(endpoint);
    return apiCall(finalEndpoint);
  },

  exportProductBundle: async (category?: string, brand?: string, limit?: number, locale?: string) => {
    const params = new URLSearchParams();
    if (locale) params.append('lang', locale);
    if (category && category !== 'all') params.append('category', category);
    if (brand && brand !== 'all') params.append('brand', brand);
    if (limit) params.append('limit', limit.toString());

    const token = getAuthToken();
    const response = await fetch(`${API_URL}/products/admin/export-bundle?${params.toString()}`, {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      credentials: 'include',
    });

    if (!response.ok) {
      let errorMessage = 'product_export_failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.blob();
  },
};

export const productTranslationAPI = {
  importProductTranslations: async (payload: {
    records: Array<Record<string, unknown>>;
    idempotencyKey: string;
    replaceManualTranslations?: boolean;
    dryRun?: boolean;
  }) => apiCall('/translations/admin/products/import', {
    method: 'POST',
    body: JSON.stringify(payload),
    skipCache: true,
  }),

  exportProductTranslations: async (productIds: string[], languages: string[], fields?: string[]) => {
    const params = new URLSearchParams({
      productIds: productIds.join(','),
      languages: languages.join(','),
    });
    if (fields?.length) params.set('fields', fields.join(','));
    return apiCall(`/translations/admin/products/export?${params.toString()}`);
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
      skipAuthRecovery: true,
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
      skipAuthRecovery: true,
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
        skipAuthRecovery: true,
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
  refreshToken: async () => requestAuthRefresh(),

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
  getCategories: async (
    lang?: Locale,
    requestOptions?: Pick<FetchOptions, 'signal'>,
    withProducts = false,
  ) => {
    const endpoint = `/categories`;
    const localizedEndpoint = lang ? `${endpoint}?lang=${lang}` : buildLocalizedUrl(endpoint);
    const separator = localizedEndpoint.includes('?') ? '&' : '?';
    const finalEndpoint = withProducts
      ? `${localizedEndpoint}${separator}withProducts=true&pageSize=500`
      : localizedEndpoint;
    return await apiCall(finalEndpoint, requestOptions);
  },

  /**
   * Lấy chi tiết danh mục
   */
  getCategoryById: async (id: string, lang?: Locale) => {
    const endpoint = `/categories/${id}`;
    const finalEndpoint = lang ? `${endpoint}?lang=${lang}` : buildLocalizedUrl(endpoint);
    return apiCall(finalEndpoint);
  },

};

/**
 * Brand API endpoints
 */
export const brandAPI = {
  /**
   * Lấy danh sách thương hiệu
   */
  getBrands: async (lang?: Locale) => {
    const endpoint = `/brands`;
    const finalEndpoint = lang ? `${endpoint}?lang=${lang}` : buildLocalizedUrl(endpoint);
    return await apiCall(finalEndpoint);
  },

  /**
   * Lấy chi tiết thương hiệu
   */
  getBrandById: async (id: string, lang?: Locale) => {
    const endpoint = `/brands/${id}`;
    const finalEndpoint = lang ? `${endpoint}?lang=${lang}` : buildLocalizedUrl(endpoint);
    return apiCall(finalEndpoint);
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
  currencyCode: string;
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

export interface CheckoutSummaryRequest {
  cartItems: Array<{ productId: string; quantity: number }>;
  couponCode?: string | null;
  shippingAddress?: {
    districtId?: number;
    wardCode?: string;
  };
  shippingProvider?: string;
  shippingService?: string;
  currencyCode: string;
}

export const couponAPI = {
  /**
   * Lấy danh sách coupon
   */
  getCoupons: async (pageNumber = 1, keyword = '', pageSize = 10, discountType?: 'percentage' | 'fixed', lang?: string, locale = lang, currencyCode?: string) => {
    const params = new URLSearchParams();
    params.append('pageNumber', pageNumber.toString());
    params.append('pageSize', pageSize.toString());
    if (keyword) params.append('keyword', keyword);
    if (discountType) params.append('discountType', discountType);
    if (lang) params.append('lang', lang);
    if (locale) params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
    return apiCall(`/coupons?${params.toString()}`);
  },

  /**
   * Lấy danh sách coupon đã xóa
   */
  getDeletedCoupons: async (pageNumber = 1, keyword = '', pageSize = 10, discountType?: 'percentage' | 'fixed', locale?: string) => {
    const params = new URLSearchParams();
    params.append('pageNumber', pageNumber.toString());
    params.append('pageSize', pageSize.toString());
    if (keyword) params.append('keyword', keyword);
    if (discountType) params.append('discountType', discountType);
    if (locale) params.append('lang', locale);
    return apiCall(`/coupons/deleted/list?${params.toString()}`);
  },

  /**
   * Lấy chi tiết coupon
   */
  getCouponById: async (id: string) => {
    return apiCall(buildLocalizedUrl(`/coupons/${id}`));
  },

  /**
   * Lấy coupon theo code
   */
  getCouponByCode: async (code: string) => {
    return apiCall(buildLocalizedUrl(`/coupons/code/${encodeURIComponent(code)}`));
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
  calculateDiscount: async (
    couponCode: string,
    orderAmount: number,
    orderCurrencyCode: string,
    products?: string[],
    locale?: string,
  ) => {
    const endpoint = '/coupons/calculate';
    const params = new URLSearchParams();
    if (locale) params.set('locale', locale);
    const localizedEndpoint = buildLocalizedUrl(endpoint);
    const separator = localizedEndpoint.includes('?') ? '&' : '?';
    const finalEndpoint = params.toString()
      ? `${localizedEndpoint}${separator}${params.toString()}`
      : localizedEndpoint;
    return apiCall(finalEndpoint, {
      method: 'POST',
      body: JSON.stringify({ couponCode, orderAmount, orderCurrencyCode, products }),
    });
  },
};

/**
 * Banner API endpoints
 */
export const bannerAPI = {
  getBanners: async (slot?: string, activeOnly = true, pageNumber = 1, pageSize = 10, lang?: Locale) => {
    const params = new URLSearchParams();
    params.append('pageNumber', pageNumber.toString());
    params.append('pageSize', pageSize.toString());
    params.append('activeOnly', String(activeOnly));
    if (slot) params.append('slot', slot);
    const endpoint = `/banners?${params.toString()}`;
    const finalEndpoint = lang ? `${endpoint}&lang=${lang}` : buildLocalizedUrl(endpoint);
    return apiCall(finalEndpoint);
  },

  getBannerById: async (id: string, lang?: Locale) => {
    const endpoint = `/banners/${id}`;
    const finalEndpoint = lang ? `${endpoint}?lang=${lang}` : buildLocalizedUrl(endpoint);
    return apiCall(finalEndpoint);
  },

  getDeletedBanners: async (pageNumber = 1, pageSize = 10, slot?: string, lang?: Locale) => {
    const params = new URLSearchParams();
    params.append('pageNumber', pageNumber.toString());
    params.append('pageSize', pageSize.toString());
    if (slot) params.append('slot', slot);
    const endpoint = `/banners/deleted/list?${params.toString()}`;
    const finalEndpoint = lang ? `${endpoint}&lang=${lang}` : buildLocalizedUrl(endpoint);
    return apiCall(finalEndpoint);
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

  getBannerSlots: async (locale?: string) => {
    const params = new URLSearchParams();
    if (locale) params.append('lang', locale);
    return apiCall(`/banners/slots${params.toString() ? '?' + params.toString() : ''}`);
  },
};

/**
 * Review API endpoints
 */
export const reviewAPI = {
  /**
   * Lấy reviews của sản phẩm
   */
  getProductReviews: async (
    productId: string,
    lang?: Locale,
    requestOptions?: Pick<FetchOptions, 'signal' | 'skipErrorToast' | 'timeout'>,
  ) => {
    const endpoint = `/reviews/products/${productId}/reviews`;
    const finalEndpoint = lang ? `${endpoint}?lang=${lang}` : buildLocalizedUrl(endpoint);
    const currentLang = lang || getCurrentLang();
    return apiCall(`${endpoint}?lang=${currentLang}`, requestOptions);
  },

  /**
   * Tạo review mới
   */
  createReview: async (
    productId: string,
    rating: number,
    comment: string,
    avatar?: { url: string; publicId: string; claimId: string },
    requestOptions?: Pick<FetchOptions, 'signal'>,
  ) => {
    const endpoint = buildLocalizedUrl(`/reviews/products/${productId}/reviews`);

    return apiCall(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        rating,
        comment,
        ...(avatar && {
          avatarUrl: avatar.url,
          avatarPublicId: avatar.publicId,
          avatarClaimId: avatar.claimId,
        }),
      }),
      ...requestOptions,
    });
  },
};

/**
 * Order API endpoints
 */
export const orderAPI = {
  getSummary: async (data: CheckoutSummaryRequest, lang: string, locale: string) => {
    const params = new URLSearchParams({ lang, locale, currencyCode: data.currencyCode });
    return apiCall<{ success: boolean; data: unknown }>(`/orders/summary?${params.toString()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },


  /**
   * Lấy tất cả đơn hàng (Admin only)
   */
  getAllOrders: async (pageNumber?: number, lang?: Locale, locale?: string, currencyCode?: string) => {
    const params = new URLSearchParams();
    if (pageNumber) params.append('pageNumber', pageNumber.toString());
    if (lang) params.append('lang', lang);
    if (locale) params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
    const query = params.toString();
    return apiCall(`/orders${query ? `?${query}` : ''}`);
  },

  /**
   * Lấy danh sách đơn hàng đã xóa (Admin only)
   */
  getDeletedOrders: async (pageNumber?: number, lang?: Locale, locale?: string, currencyCode?: string) => {
    const params = new URLSearchParams();
    params.append('pageNumber', pageNumber?.toString() || '1');
    if (lang) params.append('lang', lang);
    if (locale) params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
    return apiCall(`/orders/deleted/list?${params.toString()}`);
  },

  /**
   * Lấy đơn hàng của user
   * @param lang - Ngôn ngữ để lấy thông tin sản phẩm
   */
  getMyOrders: async (lang?: Locale, locale?: string, currencyCode?: string) => {
    const params = new URLSearchParams();
    if (lang) params.append('lang', lang);
    if (locale) params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
    const query = params.toString();
    return apiCall(`/orders/myorders${query ? `?${query}` : ''}`);
  },

  /**
   * Lấy chi tiết đơn hàng
   * @param id - ID đơn hàng
   * @param lang - Ngôn ngữ để lấy thông tin sản phẩm
   */
  getOrderById: async (id: string, lang: Locale, locale?: string, currencyCode?: string) => {
    const params = new URLSearchParams({ lang });
    if (locale) params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
    return apiCall(`/orders/${id}?${params.toString()}`);
  },

  /**
   * Lấy chi tiết đơn hàng (alias for getOrderById)
   */
  getOrder: async (id: string, lang: Locale, locale?: string, currencyCode?: string) => {
    const params = new URLSearchParams({ lang });
    if (locale) params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
    return apiCall(`/orders/${id}?${params.toString()}`);
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
    const endpoint = `/payments/confirm/${orderId}`;
    const finalEndpoint = buildLocalizedUrl(endpoint);
    return apiCall(finalEndpoint);
  },

  verifyVnpayReturn: async (params: Record<string, string | string[] | undefined>) => {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (!key.startsWith('vnp_') || value === undefined) return;
      searchParams.set(key, Array.isArray(value) ? value[0] : value);
    });

    return apiCall(`/payments/webhook/vnpay?${searchParams.toString()}`, { skipCache: true });
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
  getCustomers: async (pageNumber?: number, pageSize = 1000, keyword?: string, locale?: string) => {
    const params = new URLSearchParams();
    params.append('pageSize', pageSize.toString());
    if (pageNumber) params.append('pageNumber', pageNumber.toString());
    if (keyword) params.append('keyword', keyword);
    if (locale) params.append('lang', locale);
    return apiCall(`/customers?${params.toString()}`);
  },

  /**
   * Lấy danh sách khách hàng đã xóa (Admin only)
   */
  getDeletedCustomers: async (pageNumber?: number, locale?: string, pageSize = 1000) => {
    const params = new URLSearchParams();
    params.append('pageSize', pageSize.toString());
    params.append('pageNumber', pageNumber?.toString() || '1');
    if (locale) params.append('lang', locale);
    return apiCall(`/customers/deleted/list?${params.toString()}`);
  },

  /**
   * Lấy chi tiết khách hàng
   */
  getCustomerById: async (id: string, currencyCode?: string) => {
    const params = new URLSearchParams();
    if (currencyCode) params.set('currencyCode', currencyCode);
    const query = params.toString();
    return apiCall(`/customers/${id}${query ? `?${query}` : ''}`);
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
  getDashboardStats: async (currencyCode: string) => {
    const params = new URLSearchParams({ currencyCode });
    return apiCall(`/analytics/dashboard-stats?${params.toString()}`);
  },

  /**
   * Lấy doanh thu theo timeline
   * @param period - 'day' | 'month' | 'quarter' | 'year'
   * @param days - Số ngày quay lại (mặc định 90)
   * @param startDate - Ngày bắt đầu (Date object hoặc ISO string)
   * @param endDate - Ngày kết thúc (Date object hoặc ISO string)
   */
  getRevenueTimeline: async (
    period: string,
    days: number,
    currencyCode: string,
    startDate?: Date | string,
    endDate?: Date | string,
    lang = getCurrentLang(),
    locale: string = lang
  ) => {
    const params = new URLSearchParams();
    params.append('period', period);
    params.append('lang', lang);
    params.append('locale', locale);
    params.append('currencyCode', currencyCode);

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
  getOrderStatus: async (days = 30, startDate?: Date | string, endDate?: Date | string, lang = getCurrentLang()) => {
    const params = new URLSearchParams();
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
  getTopProducts: async (limit = 5, days = 30, startDate?: Date | string, endDate?: Date | string, lang = getCurrentLang(), locale: string = lang) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('lang', lang);
    params.append('locale', locale);

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
  getDashboardData: async (days = 30, lang = getCurrentLang(), currencyCode: string, locale: string = lang) => {
    const params = new URLSearchParams({
      days: days.toString(),
      lang,
      locale,
      currencyCode,
    });
    return apiCall(`/analytics/dashboard-data?${params.toString()}`);
  },

  /**
   * Lấy sản phẩm bán chậm (low-performing products)
   * Dựa trên: số lượng order ít & tồn kho cao
   * @param limit - Số sản phẩm (mặc định 10)
   * @param days - Số ngày quay lại (mặc định 30)
   * @param lang - Ngôn ngữ (mặc định: hiện tại)
   */
  getSlowSellingProducts: async (limit = 10, days = 30, lang = getCurrentLang(), locale: string = lang, currencyCode?: string) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('days', days.toString());
    params.append('lang', lang);
    params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
    return apiCall(`/analytics/slow-selling-products?${params.toString()}`);
  },

  /**
   * Lấy đơn hàng chưa thanh toán (unpaid orders)
   * @param limit - Số đơn (mặc định 20)
   * @param days - Số ngày quay lại (mặc định 30)
   * @param lang - Ngôn ngữ (mặc định: hiện tại) để dịch product names
   */
  getUnpaidOrders: async (limit = 20, days = 30, lang = getCurrentLang(), locale: string = lang, currencyCode?: string) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('days', days.toString());
    params.append('lang', lang);
    params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
    return apiCall(`/analytics/unpaid-orders?${params.toString()}`);
  },

  /**
   * Lấy khách hàng không hoạt động (inactive customers)
   * Dựa trên: không có order hoặc order cũ
   * @param limit - Số khách (mặc định 10)
   * @param days - Số ngày để xem xét inactive (mặc định 90)
   * @param lang - Ngôn ngữ (mặc định: hiện tại)
   */
  getInactiveCustomers: async (limit = 10, days = 90, lang = getCurrentLang(), locale: string = lang, currencyCode?: string) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('days', days.toString());
    params.append('lang', lang);
    params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
    return apiCall(`/analytics/inactive-customers?${params.toString()}`);
  },

  /**
   * Lấy sản phẩm tồn kho thấp (low inventory products) với phân trang
   * @param limit - Số sản phẩm mỗi trang (mặc định: 10)
   * @param page - Trang hiện tại (mặc định: 1)
   * @param sort - Sắp xếp: countInStock, price, -countInStock, -price
   * @param threshold - Tồn kho <= threshold là thấp (mặc định: 10)
   */
  getLowInventoryProducts: async (limit = 10, page = 1, sort = 'countInStock', threshold = 10, lang = getCurrentLang(), locale: string = lang, currencyCode?: string) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('page', page.toString());
    params.append('sort', sort);
    params.append('threshold', threshold.toString());
    params.append('lang', lang);
    params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
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
  getLowRatingProducts: async (limit = 10, page = 1, sort = 'rating', ratingThreshold = 3.0, minReviews = 1, lang = getCurrentLang(), locale: string = lang, currencyCode?: string) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('page', page.toString());
    params.append('sort', sort);
    params.append('ratingThreshold', ratingThreshold.toString());
    params.append('minReviews', minReviews.toString());
    params.append('lang', lang);
    params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
    return apiCall(`/analytics/low-rating?${params.toString()}`);
  },

  /**
   * Lấy top customers theo tổng chi tiêu (top customers by total spent) với phân trang
   * @param limit - Số khách mỗi trang (mặc định: 10)
   * @param page - Trang hiện tại (mặc định: 1)
   * @param sort - Sắp xếp: totalSpent, totalOrders, -totalSpent, -totalOrders
   * @param days - Chỉ tính đơn hàng trong N ngày gần đây (mặc định: 0 = tất cả)
   */
  getTopCustomers: async (
    limit = 10,
    page = 1,
    sort = '-totalSpent',
    days = 0,
    lang = getCurrentLang(),
    currencyCode?: string,
    locale: string = lang
  ) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('page', page.toString());
    params.append('sort', sort);
    params.append('days', days.toString());
    params.append('lang', lang);
    params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
    return apiCall(`/analytics/top-customers?${params.toString()}`);
  },

  /**
   * Lấy đơn hàng đã thanh toán (paid orders) với phân trang
   * @param limit - Số đơn mỗi trang (mặc định: 20)
   * @param page - Trang hiện tại (mặc định: 1)
   * @param sort - Sắp xếp: createdAt, totalPrice, -createdAt, -totalPrice
   * @param days - Chỉ lấy đơn hàng từ N ngày gần đây (mặc định: 30)
   */
  getPaidOrders: async (limit = 20, page = 1, sort = '-createdAt', days = 30, lang = getCurrentLang(), locale: string = lang, currencyCode?: string) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('page', page.toString());
    params.append('sort', sort);
    params.append('days', days.toString());
    params.append('lang', lang);
    params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
    return apiCall(`/analytics/paid-orders?${params.toString()}`);
  },

  /**
   * Lấy mã giảm giá chưa được sử dụng hoặc ít sử dụng (unused/underutilized coupons) với phân trang
   * @param limit - Số mã mỗi trang (mặc định: 10)
   * @param page - Trang hiện tại (mặc định: 1)
   * @param sort - Sắp xếp: currentUses, maxUses, discountValue, -currentUses
   * @param maxUsageRatio - Tỷ lệ sử dụng tối đa (mặc định: 0.5 = 50%)
   * @param lang - Ngôn ngữ (mặc định: hiện tại)
   */
  getUnusedCoupons: async (limit = 10, page = 1, sort = 'currentUses', maxUsageRatio = 0.5, lang = getCurrentLang(), locale: string = lang, currencyCode?: string) => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('page', page.toString());
    params.append('sort', sort);
    params.append('maxUsageRatio', maxUsageRatio.toString());
    params.append('lang', lang);
    params.append('locale', locale);
    if (currencyCode) params.append('currencyCode', currencyCode);
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
    const endpoint = '/shipping/providers';
    const finalEndpoint = buildLocalizedUrl(endpoint);
    return apiCall(finalEndpoint);
  },

  /**
   * Tính phí vận chuyển từ tất cả carriers
   * @param to - Thông tin địa chỉ nhận {districtId, wardCode} - wardCode bắt buộc!
   * @param cartItems - Sản phẩm và số lượng để backend tính trọng lượng
   * @param value - Giá trị hàng (VND, optional)
   */
  calculateShipping: async (
    to: { districtId: number; wardCode: string },
    cartItems: Array<{ productId: string; quantity: number }>,
    value?: number,
    locale?: string,
    currencyCode?: string,
  ) => {
    const endpoint = '/shipping/calculate';
    const localizedEndpoint = buildLocalizedUrl(endpoint);
    const params = new URLSearchParams();
    if (locale) params.set('locale', locale);
    if (currencyCode) params.set('currencyCode', currencyCode);
    const separator = localizedEndpoint.includes('?') ? '&' : '?';
    const finalEndpoint = params.toString()
      ? `${localizedEndpoint}${separator}${params.toString()}`
      : localizedEndpoint;
    return apiCall(finalEndpoint, {
      method: 'POST',
      body: JSON.stringify({ to, cartItems, value }),
    });
  },

  /**
   * Lấy danh sách tỉnh/thành từ Location model (GHN)
   */
  getProvinces: async () => {
    const endpoint = '/shipping/locations/provinces';
    const finalEndpoint = buildLocalizedUrl(endpoint);
    return apiCall(finalEndpoint);
  },

  /**
   * Lấy danh sách quận/huyện của một tỉnh từ Location model (GHN)
   * @param provinceId - ID tỉnh từ GHN
   */
  getDistricts: async (provinceId: number) => {
    const endpoint = `/shipping/locations/districts?provinceId=${provinceId}`;
    const finalEndpoint = buildLocalizedUrl(endpoint);
    return apiCall(finalEndpoint);
  },

  /**
   * Lấy danh sách phường/xã của một quận từ Location model (GHN)
   * @param districtId - ID quận từ GHN
   */
  getWards: async (districtId: number) => {
    const endpoint = `/shipping/locations/wards?districtId=${districtId}`;
    const finalEndpoint = buildLocalizedUrl(endpoint);
    return apiCall(finalEndpoint);
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
