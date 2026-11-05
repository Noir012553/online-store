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
    if (!isVisible) return;

    const bannerElement = bannerRef.current;
    const container = document.querySelector(containerSelector);
    if (!bannerElement || !container) return;

    let frameId: number | null = null;
    let bannerHeight = 0;
    let containerTopDoc = 0;
    let containerBottomDoc = 0;

    const measureLayout = () => {
      bannerHeight = bannerElement.offsetHeight;
      const containerRect = container.getBoundingClientRect();
      containerTopDoc = containerRect.top + window.scrollY;
      containerBottomDoc = containerRect.bottom + window.scrollY;
    };

    const updatePosition = () => {
      frameId = null;
      const scrollY = window.scrollY;
      const initialStickyPos = headerHeight + 16;
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

    const handleResize = () => {
      measureLayout();
      handlePositionChange();
    };
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(handleResize)
      : null;

    resizeObserver?.observe(bannerElement);
    resizeObserver?.observe(container);
    measureLayout();
    window.addEventListener('scroll', handlePositionChange, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    handlePositionChange();

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('scroll', handlePositionChange);
      window.removeEventListener('resize', handleResize);
    };
  }, [containerSelector, minBannerTopDocument, headerHeight, maxBottomOffset, isVisible]);

  return { bannerRef };
}
