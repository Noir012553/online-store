import { toast } from 'sonner';
import { UI_EMOJI } from './uiEmoji';

type TranslationFn = (key: string, namespace?: string, fallback?: string) => string;

let tooManyRequestsShown = false;
let tooManyRequestsTimeout: NodeJS.Timeout | null = null;
let apiErrorTranslator: TranslationFn | undefined;

const errorTimestamps = new Map<string, number[]>();
const MAX_ERROR_HISTORY = 10;
const MAX_TRACKED_ENDPOINTS = 500;
const ERROR_WINDOW_MS = 60000;

export interface ApiError {
  status: number;
  message: string;
  code?: string;
  params?: Record<string, unknown>;
  endpoint?: string;
  method?: string;
}

export function setApiErrorTranslator(translator?: TranslationFn) {
  apiErrorTranslator = translator;
}

export function handleApiError(error: ApiError, t?: TranslationFn) {
  const translate = t ?? apiErrorTranslator;
  const { status, message, code, endpoint, method } = error;

  if (endpoint) {
    const timestamps = errorTimestamps.get(endpoint) || [];
    timestamps.push(Date.now());

    if (timestamps.length > MAX_ERROR_HISTORY) {
      timestamps.shift();
    }

    errorTimestamps.set(endpoint, timestamps);
    if (errorTimestamps.size > MAX_TRACKED_ENDPOINTS) {
      const oldestEndpoint = errorTimestamps.keys().next().value;
      if (oldestEndpoint) errorTimestamps.delete(oldestEndpoint);
    }
  }

  if (status === 429) {
    handleTooManyRequests(endpoint, method, translate);
    return;
  }

  if (status >= 500) {
    const statusMessage = translate?.('error_request_status', 'common', `Error ${status}`) || `Error ${status}`;
    toast.error(translate?.('error_server_title', 'common') || '', {
      description: `${translate?.('error_server_desc', 'common') || ''} (${statusMessage.replace('{status}', String(status))})`,
      duration: 5000,
    });
    return;
  }

  if (status >= 400 && status < 500) {
    const statusMessage = translate?.('error_request_status', 'common', `Error ${status}`) || `Error ${status}`;
    const codeMessage = code ? translate?.(code, 'common') : '';
    const errorReference = code || statusMessage.replace('{status}', String(status));
    toast.error(translate?.('error_request_title', 'common') || '', {
      description: `${codeMessage && codeMessage !== code ? `${codeMessage} ` : ''}(${errorReference})`,
      duration: 4000,
    });
    return;
  }

  if (status === 0) {
    toast.error(translate?.('error_network_title', 'common') || '', {
      description: translate?.('error_network_desc', 'common') || '',
      duration: 5000,
    });
    return;
  }
}

function handleTooManyRequests(endpoint?: string, method?: string, t?: TranslationFn) {
  if (endpoint) {
    const recentErrors = errorTimestamps.get(endpoint)?.filter(
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
  const translate = t ?? apiErrorTranslator;
  if (tooManyRequestsShown) return;

  tooManyRequestsShown = true;

  if (tooManyRequestsTimeout) {
    clearTimeout(tooManyRequestsTimeout);
  }

  if (type === 'spam') {
    toast.warning(translate?.('error_too_many_requests_title', 'common') || '', {
      description: translate?.('error_too_many_requests_desc', 'common') || '',
      duration: 8000,
      icon: UI_EMOJI.statusPending,
    });
  } else {
    toast.warning(translate?.('error_server_overloaded_title', 'common') || '', {
      description: translate?.('error_server_overloaded_desc', 'common') || '',
      duration: 6000,
      icon: UI_EMOJI.statusWarning,
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
  const translate = t ?? apiErrorTranslator;
  const slowThreshold = 5000;

  if (duration > slowThreshold) {
    toast.info(translate?.('error_request_slow', 'common') || '', {
      description: `${method} ${endpoint} ${translate?.('error_request_processing', 'common') || ''}`,
      duration: 4000,
    });
  }
}

export function getUserFriendlyErrorMessage(error: any, t?: TranslationFn): string {
  const translate = t ?? apiErrorTranslator;
  const code = error && typeof error === 'object' ? error.code : undefined;

  if (code) {
    return translate?.(code, 'common') || translate?.('error_generic', 'common') || '';
  }

  if (error instanceof Error && error.message) {
    return translate?.('error_generic_fallback', 'common') || translate?.('error_generic', 'common') || '';
  }

  return translate?.('error_generic_fallback', 'common') || translate?.('error_generic', 'common') || '';
}
