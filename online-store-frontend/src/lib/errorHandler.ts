import { toast } from 'sonner';

type TranslationFn = (key: string, namespace?: string, fallback?: string) => string;

let tooManyRequestsShown = false;
let tooManyRequestsTimeout: NodeJS.Timeout | null = null;

const errorTimestamps: { [endpoint: string]: number[] } = {};
const MAX_ERROR_HISTORY = 10;
const ERROR_WINDOW_MS = 60000;

export interface ApiError {
  status: number;
  message: string;
  endpoint?: string;
  method?: string;
}

export function handleApiError(error: ApiError, t?: TranslationFn) {
  const { status, message, endpoint, method } = error;

  if (endpoint) {
    if (!errorTimestamps[endpoint]) {
      errorTimestamps[endpoint] = [];
    }
    errorTimestamps[endpoint].push(Date.now());

    if (errorTimestamps[endpoint].length > MAX_ERROR_HISTORY) {
      errorTimestamps[endpoint].shift();
    }
  }

  if (status === 429) {
    handleTooManyRequests(endpoint, method, t);
    return;
  }

  if (status >= 500) {
    toast.error(t?.('error_server_title', 'common') || '', {
      description: t?.('error_server_desc', 'common') || '',
      duration: 5000,
    });
    return;
  }

  if (status >= 400 && status < 500) {
    if (status === 401) {
      return;
    }

    toast.error(t?.('error_request_title', 'common') || '', {
      description: message || (t?.('error_request_status', 'common', `Error ${status}`) || ''),
      duration: 4000,
    });
    return;
  }

  if (status === 0) {
    toast.error(t?.('error_network_title', 'common') || '', {
      description: t?.('error_network_desc', 'common') || '',
      duration: 5000,
    });
    return;
  }
}

function handleTooManyRequests(endpoint?: string, method?: string, t?: TranslationFn) {
  if (endpoint) {
    const recentErrors = errorTimestamps[endpoint]?.filter(
      (ts) => Date.now() - ts < ERROR_WINDOW_MS
    ) || [];

    if (recentErrors.length >= 3) {
      showTooManyRequestsWarning('spam', t);
      return;
    }
  }

  showTooManyRequestsWarning('single', t);
}

function showTooManyRequestsWarning(type: 'spam' | 'single', t?: TranslationFn) {
  if (tooManyRequestsShown) return;

  tooManyRequestsShown = true;

  if (tooManyRequestsTimeout) {
    clearTimeout(tooManyRequestsTimeout);
  }

  if (type === 'spam') {
    toast.warning(t?.('error_too_many_requests_title', 'common') || '', {
      description: t?.('error_too_many_requests_desc', 'common') || '',
      duration: 8000,
      icon: '⏳',
    });
  } else {
    toast.warning(t?.('error_server_overloaded_title', 'common') || '', {
      description: t?.('error_server_overloaded_desc', 'common') || '',
      duration: 6000,
      icon: '⚠️',
    });
  }

  tooManyRequestsTimeout = setTimeout(() => {
    tooManyRequestsShown = false;
  }, 8000);
}

export function getExponentialBackoffDelay(attempt: number): number {
  const baseDelay = 1000;
  const maxDelay = 30000;
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = delay * (Math.random() * 0.2);
  return Math.round(delay + jitter);
}

export function shouldRetryRequest(status: number): boolean {
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  if (status === 0 || status === 408) return true;
  if (status >= 400 && status < 500) return false;
  if (status >= 200 && status < 300) return false;
  return false;
}

export function showSlowRequestWarning(endpoint: string, method: string, duration: number, t?: TranslationFn) {
  const slowThreshold = 5000;

  if (duration > slowThreshold) {
    toast.info(t?.('error_request_slow', 'common') || '', {
      description: `${method} ${endpoint} ${t?.('error_request_processing', 'common') || ''}`,
      duration: 4000,
    });
  }
}

export function getUserFriendlyErrorMessage(error: any, t?: TranslationFn): string {
  if (error instanceof Error) {
    const message = error.message;

    // Check if message is an error key (for API errors)
    const errorKeyPatterns = [
      'refresh_token_timeout',
      'product_creation_failed',
      'product_update_failed',
      'product_export_failed',
      'banner_creation_failed',
      'banner_update_failed',
      'review_creation_failed',
    ];

    if (errorKeyPatterns.some(pattern => message.includes(pattern))) {
      return t?.(message, 'common') || message;
    }

    if (message.includes('429')) {
      return t?.('error_too_many_requests_desc', 'common') || '';
    }

    if (message.includes('timeout')) {
      return t?.('error_request_timeout', 'common') || '';
    }

    if (message.includes('Failed to fetch') || message.includes('Network')) {
      return t?.('error_network_fallback', 'common') || '';
    }

    if (message.includes('401')) {
      return t?.('error_auth_required', 'common') || '';
    }

    if (message.includes('403')) {
      return t?.('error_permission_denied', 'common') || '';
    }

    if (message.includes('404')) {
      return t?.('error_data_not_found', 'common') || '';
    }

    if (message.includes('500')) {
      return t?.('error_generic', 'common') || '';
    }

    return message;
  }

  return t?.('error_generic_fallback', 'common') || '';
}
