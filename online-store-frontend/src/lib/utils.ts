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

export function getImageUrl(imagePath?: string | null): string | undefined {
  if (!imagePath) {
    return undefined;
  }

  // If already absolute URL (http/https), return as-is (external image)
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }

  // Normalize backslashes to forward slashes (Windows path compatibility)
  let normalizedPath = imagePath.replace(/\\/g, '/');

  // For relative paths (e.g., "/uploads/..."), return normalized
  // Next.js will rewrite /uploads/* → backend's /uploads/*
  if (normalizedPath.startsWith('/')) {
    return normalizedPath;
  }

  // For paths without leading slash, add it
  // (e.g., "uploads/..." → "/uploads/...")
  const result = `/${normalizedPath}`;
  return result;
}
