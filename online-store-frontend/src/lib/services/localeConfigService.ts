export interface ActiveLocaleConfig {
  code: string;
  name: string;
  nativeName?: string;
  currencyCode: string;
  isReady: boolean;
}

export interface ActiveLocaleConfigResponse {
  defaultLocale?: string;
  locales: ActiveLocaleConfig[];
}

const LOCALE_CONFIG_TIMEOUT_MS = 8000;
const LOCALE_CONFIG_MAX_ATTEMPTS = 2;

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));

let activeLocaleConfigRequest: Promise<ActiveLocaleConfigResponse> | null = null;

export function fetchActiveLocaleConfig(): Promise<ActiveLocaleConfigResponse> {
  if (!activeLocaleConfigRequest) {
    activeLocaleConfigRequest = loadActiveLocaleConfig().finally(() => {
      activeLocaleConfigRequest = null;
    });
  }
  return activeLocaleConfigRequest;
}

async function loadActiveLocaleConfig(): Promise<ActiveLocaleConfigResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < LOCALE_CONFIG_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), LOCALE_CONFIG_TIMEOUT_MS);

    try {
      const response = await fetch('/api/languages/active-config', {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw Object.assign(new Error(`Unable to load active locale configuration: ${response.status}`), { status: 429 });
        }
        throw new Error(`Unable to load active locale configuration: ${response.status}`);
      }

      const payload = await response.json();
      if (!payload?.data || !Array.isArray(payload.data.locales)) {
        throw new Error('Active locale configuration is invalid');
      }

      return payload.data;
    } catch (error) {
      lastError = error;
      if ((error as { status?: number })?.status === 429 || attempt >= LOCALE_CONFIG_MAX_ATTEMPTS - 1) break;
      await wait(300);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to load active locale configuration');
}
