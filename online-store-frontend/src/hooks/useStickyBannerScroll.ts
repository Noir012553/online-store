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
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frameId: number | null = null;

    const updatePosition = () => {
      frameId = null;
      const bannerElement = bannerRef.current;
      const container = document.querySelector(containerSelector);
      if (!bannerElement || !container) return;

      const bannerHeight = bannerElement.offsetHeight;
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
      const maxBannerTopDoc = Math.max(
        containerTopDoc,
        containerBottomDoc - bannerHeight - maxBottomOffset,
      );
      bannerTopDoc = Math.min(bannerTopDoc, maxBannerTopDoc);
      bannerElement.style.setProperty('--banner-top', `${bannerTopDoc - scrollY}px`);
    };

    const handlePositionChange = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updatePosition);
    };

    const bannerElement = bannerRef.current;
    const container = document.querySelector(containerSelector);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(handlePositionChange)
      : null;

    if (bannerElement) resizeObserver?.observe(bannerElement);
    if (container) resizeObserver?.observe(container);
    window.addEventListener('scroll', handlePositionChange, { passive: true });
    window.addEventListener('resize', handlePositionChange, { passive: true });
    handlePositionChange();

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('scroll', handlePositionChange);
      window.removeEventListener('resize', handlePositionChange);
    };
  }, [containerSelector, minBannerTopDocument, headerHeight, maxBottomOffset, isVisible]);

  return { bannerRef };
}
