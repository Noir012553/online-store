import { useEffect, useState, useRef } from 'react';

interface UseStickyBannerScrollProps {
  containerSelector: string; // selector for scroll container (banner confined within this)
  minBannerTopDocument?: number; // min distance from top of page (in px) - banner won't go above this
  headerHeight?: number; // header height in px (default: 80px for h-20)
  maxBottomOffset?: number; // offset before footer
  isVisible?: boolean;
}

export function useStickyBannerScroll({
  containerSelector,
  minBannerTopDocument,
  headerHeight = 80,
  maxBottomOffset = 20,
  isVisible = true,
}: UseStickyBannerScrollProps) {
  const [bannerTop, setBannerTop] = useState(96);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePositionChange = () => {
      if (!bannerRef.current) return;

      const container = document.querySelector(containerSelector);
      if (!container) return;

      const bannerHeight = bannerRef.current.offsetHeight;
      const containerRect = container.getBoundingClientRect();
      const scrollY = window.scrollY;
      const initialStickyPos = headerHeight + 16;
      const containerTopDoc = containerRect.top + scrollY;
      const containerBottomDoc = containerRect.bottom + scrollY;

      let bannerTopDoc = scrollY + initialStickyPos;

      if (minBannerTopDocument !== undefined) {
        bannerTopDoc = Math.max(bannerTopDoc, minBannerTopDocument);
      }

      bannerTopDoc = Math.max(bannerTopDoc, containerTopDoc);

      const maxBannerTopDoc = containerBottomDoc - bannerHeight - maxBottomOffset;
      bannerTopDoc = Math.min(bannerTopDoc, maxBannerTopDoc);

      setBannerTop(bannerTopDoc - scrollY);
    };

    const bannerElement = bannerRef.current;
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(handlePositionChange)
      : null;

    if (bannerElement) resizeObserver?.observe(bannerElement);
    window.addEventListener('scroll', handlePositionChange, { passive: true });
    window.addEventListener('resize', handlePositionChange, { passive: true });
    handlePositionChange();

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('scroll', handlePositionChange);
      window.removeEventListener('resize', handlePositionChange);
    };
  }, [containerSelector, minBannerTopDocument, headerHeight, maxBottomOffset, isVisible]);

  return { bannerTop, bannerRef };
}
