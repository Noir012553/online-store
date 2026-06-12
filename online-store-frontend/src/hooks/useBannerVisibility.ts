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
    const handleScroll = () => {
      const hero = document.querySelector(heroSelector);
      const footer = document.querySelector(footerSelector);

      if (!hero && !footer) return;

      let shouldHideBanners = false;

      // Check if hero is visible
      if (hero) {
        const heroRect = hero.getBoundingClientRect();
        const heroVisibleHeight = Math.min(heroRect.bottom, window.innerHeight) - Math.max(heroRect.top, 0);
        const heroVisibilityRatio = heroVisibleHeight / heroRect.height;

        // Hide banners if hero is more visible than threshold
        if (heroVisibilityRatio > triggerThreshold) {
          shouldHideBanners = true;
        }
      }

      // Check if footer is visible
      if (footer && !shouldHideBanners) {
        const footerRect = footer.getBoundingClientRect();
        const footerVisibleHeight = Math.min(footerRect.bottom, window.innerHeight) - Math.max(footerRect.top, 0);
        const footerVisibilityRatio = footerVisibleHeight / footerRect.height;

        // Hide banners if footer is more visible than threshold
        if (footerVisibilityRatio > triggerThreshold) {
          shouldHideBanners = true;
        }
      }

      setIsBannerVisible(!shouldHideBanners);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    // Initial calculation
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [heroSelector, footerSelector, triggerThreshold]);

  return { isBannerVisible };
}
