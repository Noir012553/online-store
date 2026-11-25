import { DEFAULT_LOCALE, type Locale } from './i18n/types';

export const SITE_NAME = 'Laptop Store';
export const SITE_URL = 'https://manln.online';
export const normalizeSiteUrl = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) return SITE_URL;
  try {
    const url = new URL(value.trim().startsWith('https://') ? value.trim() : `https://${value.trim()}`);
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
      ? url.origin
      : SITE_URL;
  } catch {
    return SITE_URL;
  }
};
export const DEFAULT_SITE_TITLE = 'Laptop Store | Laptop và phụ kiện chính hãng';
export const DEFAULT_SITE_DESCRIPTION = 'Mua laptop gaming, laptop văn phòng và phụ kiện chính hãng tại Laptop Store. Giá tốt, giao hàng toàn quốc, bảo hành uy tín.';
export const DEFAULT_SITE_IMAGE = `${SITE_URL}/assets/branding/logo-cropped.png`;

export const getProductPath = (
  product: { id?: string; _id?: string; localizedSlugs?: Partial<Record<Locale, string>> },
  locale: Locale,
): string | undefined => {
  const slug = product.localizedSlugs?.[locale] || product.localizedSlugs?.[DEFAULT_LOCALE];
  if (slug) return `/product/${slug}`;

  const id = product._id || product.id;
  return id && /^[a-f\d]{24}$/i.test(id) ? `/product/${id}` : undefined;
};
