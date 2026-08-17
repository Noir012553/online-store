import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { bannerAPI, type BannerRecord } from '../lib/api';
import { getImageUrl } from '../lib/utils';
import { getTranslatedValue } from '../lib/data';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useTranslation } from '../lib/i18n';

export type BannerVariant = 'hero' | 'strip' | 'image-only';

interface BannerSlotProps {
  slot: string;
  variant?: BannerVariant;
  className?: string;
  limit?: number;
}

const slotTranslationKeys: Record<string, string> = {
  sitewide_top: 'banner_sitewide_top',
  homepage_hero: 'banner_homepage_hero',
  homepage_left: 'banner_homepage_left',
  homepage_right: 'banner_homepage_right',
  homepage_inline: 'banner_homepage_inline',
  products_top: 'banner_products_top',
  category_top: 'banner_category_top',
  product_top: 'banner_product_top',
};

export function BannerSlot({ slot, variant = 'strip', className = '', limit = 10 }: BannerSlotProps) {
  const { t, locale } = useTranslation();
  const [banners, setBanners] = useState<BannerRecord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadBanners = async () => {
      setIsLoading(true);
      try {
        const response = await bannerAPI.getBanners(slot, true, 1, limit, locale as any);
        if (!isMounted) return;
        setBanners(response.banners || []);
        setCurrentIndex(0);
      } catch {
        if (isMounted) {
          setBanners([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadBanners();

    return () => {
      isMounted = false;
    };
  }, [limit, slot, locale]);

  useEffect(() => {
    if (banners.length <= 1) return;

    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [banners.length]);

  const currentBanner = useMemo(() => banners[currentIndex], [banners, currentIndex]);

  if (isLoading || banners.length === 0 || !currentBanner) {
    return null;
  }

  const href = currentBanner.targetUrl?.trim();
  const isInternalLink = Boolean(href && href.startsWith('/'));
  const displaySrc = getImageUrl(currentBanner.image);
  const localizedTitle = getTranslatedValue(currentBanner.title, locale);
  const localizedSubtitle = getTranslatedValue(currentBanner.subtitle, locale);
  const localizedDescription = getTranslatedValue(currentBanner.description, locale);
  const localizedCtaText = getTranslatedValue(currentBanner.ctaText, locale);

  // Chỉ hiển thị text/button cho homepage_hero, các slot khác chỉ hiển thị image tĩnh
  const isHeroSlot = slot === 'homepage_hero';
  const effectiveVariant = isHeroSlot ? variant : 'image-only';

  const rootClassName = effectiveVariant === 'hero'
    ? 'relative overflow-hidden rounded-3xl bg-gray-900 shadow-2xl'
    : effectiveVariant === 'image-only'
      ? 'relative overflow-hidden bg-gray-900 shadow-lg'
      : 'relative overflow-hidden rounded-2xl bg-gray-900 shadow-lg';
  const heightClassName = effectiveVariant === 'hero'
    ? 'min-h-[320px] md:min-h-[420px]'
    : variant === 'strip'
      ? 'min-h-[30px] md:min-h-[70px]'
      : 'min-h-[160px] md:min-h-[220px]';
  const contentPaddingClassName = effectiveVariant === 'hero'
    ? 'layout-gutter-wide'
    : 'layout-gutter';

  // Image-only variant: just show image without text, labels, or CTA
  if (effectiveVariant === 'image-only') {
    const content = (
      <div className="relative w-full pointer-events-auto" style={{ aspectRatio: '3/4', maxHeight: '500px' }}>
        <ImageWithFallback
          src={displaySrc}
          alt={localizedTitle}
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
      </div>
    );

    return (
      <section className={`${rootClassName} ${className} pointer-events-auto`}>
        {href ? (
          isInternalLink ? (
            <Link href={href} className="block">
              {content}
            </Link>
          ) : (
            <a href={href} target={currentBanner.openInNewTab ? '_blank' : undefined} rel={currentBanner.openInNewTab ? 'noreferrer' : undefined} className="block">
              {content}
            </a>
          )
        ) : (
          content
        )}
      </section>
    );
  }

  const content = (
    <div className={`relative ${heightClassName}`}>
      <ImageWithFallback
        src={displaySrc}
        alt={localizedTitle}
        fill
        sizes="100vw"
        className="object-cover"
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/10" />
      <div className="absolute inset-0 flex items-center">
        <div className={`mx-auto flex w-full items-center ${contentPaddingClassName}`}>
          <div className={effectiveVariant === 'hero' ? 'max-w-xl text-white' : 'max-w-md text-white'}>
            <div className="mb-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/90 backdrop-blur">
              {t(slotTranslationKeys[slot] || slot)}
            </div>
            <h2 className={effectiveVariant === 'hero' ? 'text-xl font-bold sm:text-2xl md:text-3xl' : 'text-base font-bold sm:text-lg md:text-xl'}>
              {localizedTitle}
            </h2>
            {localizedSubtitle && (
              <p className={effectiveVariant === 'hero' ? 'mt-3 text-xs text-white/90 sm:text-sm md:text-base' : 'mt-2 text-[11px] text-white/90 sm:text-xs md:text-sm'}>
                {localizedSubtitle}
              </p>
            )}
            {localizedDescription && (
              <p className={effectiveVariant === 'hero' ? 'mt-4 max-w-lg text-xs text-white/85 sm:text-sm' : 'mt-2 max-w-md text-[11px] text-white/85 sm:text-xs'}>
                {localizedDescription}
              </p>
            )}
            {href && localizedCtaText && (
              <div className="mt-5">
                <span className="inline-flex rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white sm:px-4 sm:py-2 sm:text-sm">
                  {localizedCtaText}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <section className={`${rootClassName} ${className}`}>
      {href ? (
        isInternalLink ? (
          <Link href={href} className="block">
            {content}
          </Link>
        ) : (
          <a href={href} target={currentBanner.openInNewTab ? '_blank' : undefined} rel={currentBanner.openInNewTab ? 'noreferrer' : undefined} className="block">
            {content}
          </a>
        )
      ) : (
        content
      )}

      {Array.isArray(banners) && banners.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length)}
            className="absolute left-3 top-1/2 z-50 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur hover:bg-black/60"
            aria-label={t('banner_previous', 'banner')}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => (prev + 1) % banners.length)}
            className="absolute right-3 top-1/2 z-50 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur hover:bg-black/60"
            aria-label={t('banner_next', 'banner')}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 z-50 flex -translate-x-1/2 gap-2">
            {banners.map((banner, index) => (
              <button
                key={banner._id}
                type="button"
                onClick={() => setCurrentIndex(index)}
                className={`h-2.5 rounded-full transition-all ${index === currentIndex ? 'w-8 bg-white' : 'w-2.5 bg-white/50'}`}
                aria-label={`${t('banner_indicator', 'banner')} ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
