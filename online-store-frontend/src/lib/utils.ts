import { getIntlLocale } from './localeUtils';
import { DEFAULT_LOCALE, type Locale } from './i18n/types';

export function formatDate(date: Date | string | number | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  if (date === null || date === undefined || date === '') {
    return '';
  }

  const parsedDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(getIntlLocale(locale as Parameters<typeof getIntlLocale>[0]), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsedDate);
}

export function formatNumber(value: number, locale: Locale, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    maximumFractionDigits,
  }).format(value);
}

export function formatCurrency(
  value: number | null | undefined,
  formattedValue: string | undefined,
  locale: Locale,
  currencyCode: string,
): string {
  if (typeof formattedValue === 'string' && formattedValue.trim()) {
    return formattedValue;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '';
  }

  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: 'currency',
    currency: currencyCode,
  }).format(value);
}

export function calculateDiscount(original: number, current: number): number {
  return Math.round(((original - current) / original) * 100);
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}


const LOGIN_PATH_REGEX = /^\/login(?:[/?#]|$)/;

export function isLoginPath(path: string): boolean {
  return LOGIN_PATH_REGEX.test(path);
}

export function getLoginPath(fromPath?: string): string {
  if (!fromPath) {
    return '/login';
  }

  return `/login?from=${encodeURIComponent(fromPath)}`;
}

export function getSafeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value) return '/';

  let target = value;

  try {
    while (isLoginPath(target)) {
      const parsedUrl = new URL(target, 'https://example.com');
      const nextFrom = parsedUrl.searchParams.get('from');
      if (!nextFrom) return '/';
      target = nextFrom;
    }

    return target.startsWith('/') ? target : '/';
  } catch {
    return '/';
  }
}

export interface ImageAssetReference {
  publicUrl?: string | null;
  url?: string | null;
}

export function getImageUrl(
  imagePath?: string | ImageAssetReference | null,
): string | undefined {
  const rawPath = typeof imagePath === 'string'
    ? imagePath
    : imagePath?.publicUrl || imagePath?.url;

  if (!rawPath) {
    return undefined;
  }

  const trimmedPath = rawPath.trim();
  if (!trimmedPath) {
    return undefined;
  }

  if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
    return trimmedPath;
  }

  const normalizedPath = trimmedPath.replaceAll(String.fromCharCode(92), '/');
  return normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
}
