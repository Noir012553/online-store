import { useEffect, useState, useRef } from 'react';

interface UseStickyBannerScrollProps {
  containerSelector: string; // selector for scroll container (banner confined within this)
  minBannerTopDocument?: number; // min distance from top of page (in px) - banner won't go above this
  headerHeight?: number; // header height in px (default: 80px for h-20)
  maxBottomOffset?: number; // offset before footer
}

export function useStickyBannerScroll({
  containerSelector,
  minBannerTopDocument,
  headerHeight = 80,
  maxBottomOffset = 20,
}: UseStickyBannerScrollProps) {
  const [bannerTop, setBannerTop] = useState(96);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!bannerRef.current) return;

      const container = document.querySelector(containerSelector);
      if (!container) return;

      // Get banner height
      const bannerHeight = bannerRef.current.offsetHeight;

      // Get container position in viewport and document
      const containerRect = container.getBoundingClientRect();
      const scrollY = window.scrollY;

      // Initial sticky position (96px = 80px header + 16px margin)
      const initialStickyPos = headerHeight + 16;

      // Container boundaries in document coordinates
      const containerTopDoc = containerRect.top + scrollY;
      const containerBottomDoc = containerRect.bottom + scrollY;

      // Calculate where banner should be in document
      let bannerTopDoc = scrollY + initialStickyPos;

      // Constraint 1: Banner can't go above minBannerTopDocument (if provided)
      if (minBannerTopDocument !== undefined) {
        bannerTopDoc = Math.max(bannerTopDoc, minBannerTopDocument);
      }

      // Constraint 2: Banner can't go above container top (fallback)
      bannerTopDoc = Math.max(bannerTopDoc, containerTopDoc);

      // Constraint 3: Banner can't go below container bottom
      const maxBannerTopDoc = containerBottomDoc - bannerHeight - maxBottomOffset;
      bannerTopDoc = Math.min(bannerTopDoc, maxBannerTopDoc);

      // Convert back to viewport coordinates for fixed positioning
      const bannerTopViewport = bannerTopDoc - scrollY;

      setBannerTop(bannerTopViewport);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    // Initial calculation
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [containerSelector, minBannerTopDocument, headerHeight, maxBottomOffset]);

  return { bannerTop, bannerRef };
}
