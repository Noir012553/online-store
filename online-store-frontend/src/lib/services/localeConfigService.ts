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

export async function fetchActiveLocaleConfig(): Promise<ActiveLocaleConfigResponse> {
  const response = await fetch('/api/languages/active-config', { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Unable to load active locale configuration: ${response.status}`);
  }

  const payload = await response.json();
  return payload.data;
}
