import { Locale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from './i18n/types';
import { getIntlLocale } from './localeUtils';
import type { Currency } from './services/currencyService';

function getFormattingLocale(locale?: Locale | string): string | undefined {
  if (typeof locale !== 'string' || !SUPPORTED_LOCALES.includes(locale as Locale)) {
    return undefined;
  }

  return getIntlLocale(locale as Locale);
}

export function formatCurrencyByCode(
  amount: number,
  currencyCode: string,
  locale?: Locale | string
): string {
  return new Intl.NumberFormat(getFormattingLocale(locale), {
    style: 'currency',
    currency: currencyCode,
  }).format(amount);
}

export function formatCurrencyWithMetadata(
  amount: number,
  currency: Pick<Currency, 'symbol' | 'position' | 'decimalPlaces'>,
  locale?: Locale | string
): string {
  const formattedAmount = new Intl.NumberFormat(getFormattingLocale(locale), {
    style: 'decimal',
    minimumFractionDigits: currency.decimalPlaces,
    maximumFractionDigits: currency.decimalPlaces,
  }).format(amount);

  return currency.position === 'before'
    ? `${currency.symbol}${formattedAmount}`
    : `${formattedAmount} ${currency.symbol}`;
}

export function formatDate(date: Date | string | number | null | undefined, locale?: Locale | string): string {
  if (date === null || date === undefined || date === '') {
    return '';
  }

  const parsedDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(getFormattingLocale(locale), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsedDate);
}

export function calculateDiscount(original: number, current: number): number {
  return Math.round(((original - current) / original) * 100);
}

export function capitalizeSpecKey(key: string): string {
  if (!key) return '';
  return key.charAt(0).toUpperCase() + key.slice(1);
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
