import { useEffect, useState } from 'react';

interface UseBannerVisibilityProps {
  heroSelector: string;
  footerSelector: string;
  triggerThreshold?: number; // percentage of element that needs to be visible to hide banners (0-1)
}

export function useBannerVisibility({
  heroSelector,
  footerSelector,
  triggerThreshold = 0.3, // Default: 30% of element visible
}: UseBannerVisibilityProps) {
  const [isBannerVisible, setIsBannerVisible] = useState(true);

  useEffect(() => {
    const hero = document.querySelector(heroSelector);
    const footer = document.querySelector(footerSelector);
    const observedElements = [hero, footer].filter((element): element is Element => Boolean(element));
    if (observedElements.length === 0) return;

    const hiddenElements = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.intersectionRatio > triggerThreshold) {
          hiddenElements.add(entry.target);
        } else {
          hiddenElements.delete(entry.target);
        }
      }
      setIsBannerVisible(hiddenElements.size === 0);
    }, { threshold: triggerThreshold });

    observedElements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [heroSelector, footerSelector, triggerThreshold]);

  return { isBannerVisible };
}
