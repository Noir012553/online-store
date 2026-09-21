import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '../lib/i18n';

interface ImageViewerProps {
  src: string;
  alt: string;
  images?: string[];
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  onClose: () => void;
}

export function ImageViewer({
  src,
  alt,
  images = [src],
  initialIndex = 0,
  onIndexChange,
  onClose,
}: ImageViewerProps) {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mobileGalleryRef = useRef<HTMLDivElement>(null);
  const mobileDragRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number } | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const imageSources = (images.length > 0 ? images : [src]).filter(Boolean);
  const normalizedInitialIndex = Math.min(Math.max(initialIndex, 0), Math.max(imageSources.length - 1, 0));
  const [activeIndex, setActiveIndex] = useState(normalizedInitialIndex);
  const activeIndexRef = useRef(normalizedInitialIndex);
  const [isMounted, setIsMounted] = useState(false);
  const currentImage = imageSources[activeIndex] || src;
  const hasGalleryNavigation = imageSources.length > 1;
  const mobileImageSources = hasGalleryNavigation
    ? [...imageSources, ...imageSources, ...imageSources]
    : imageSources;

  const scrollMobileTo = (index: number, behavior: ScrollBehavior = 'smooth') => {
    const mobileGallery = mobileGalleryRef.current;
    if (!mobileGallery) return;

    const mobileIndex = hasGalleryNavigation ? index + imageSources.length : index;
    mobileGallery.scrollTo({
      left: mobileIndex * mobileGallery.clientWidth,
      behavior,
    });
  };

  const goToImage = (index: number) => {
    const nextIndex = (index + imageSources.length) % imageSources.length;
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
    onIndexChange?.(nextIndex);
    scrollMobileTo(nextIndex);
  };

  useEffect(() => {
    setIsMounted(true);
    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && hasGalleryNavigation) {
        goToImage(activeIndexRef.current - 1);
      }
      if (event.key === 'ArrowRight' && hasGalleryNavigation) {
        goToImage(activeIndexRef.current + 1);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedElementRef.current?.focus();
    };
  }, [hasGalleryNavigation, imageSources.length, onClose]);

  const handleMobileScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const slideWidth = event.currentTarget.clientWidth;
    if (!slideWidth) return;

    const slideCount = imageSources.length;
    let rawIndex = Math.round(event.currentTarget.scrollLeft / slideWidth);
    if (hasGalleryNavigation) {
      if (rawIndex < slideCount) {
        event.currentTarget.scrollLeft += slideCount * slideWidth;
        rawIndex += slideCount;
      } else if (rawIndex >= slideCount * 2) {
        event.currentTarget.scrollLeft -= slideCount * slideWidth;
        rawIndex -= slideCount;
      }
    }

    const nextIndex = hasGalleryNavigation
      ? (rawIndex - slideCount + slideCount) % slideCount
      : 0;
    if (nextIndex !== activeIndexRef.current) {
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
      onIndexChange?.(nextIndex);
    }
  };

  const handleMobilePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;

    mobileDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMobilePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = mobileDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.currentTarget.scrollLeft = drag.startScrollLeft - (event.clientX - drag.startX);
  };

  const handleMobilePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = mobileDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    mobileDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => {
    if (isMounted) closeButtonRef.current?.focus();
  }, [isMounted]);

  useEffect(() => {
    if (isMounted) scrollMobileTo(normalizedInitialIndex, 'auto');
  }, [isMounted, normalizedInitialIndex]);

  if (!isMounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/80 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex h-full w-full max-w-7xl items-center justify-center"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={mobileGalleryRef}
          className="hide-scrollbar flex h-full w-full select-none snap-x snap-mandatory touch-pan-x overflow-x-auto overscroll-x-contain lg:hidden"
          onScroll={handleMobileScroll}
          onPointerDown={handleMobilePointerDown}
          onPointerMove={handleMobilePointerMove}
          onPointerUp={handleMobilePointerEnd}
          onPointerCancel={handleMobilePointerEnd}
          aria-label={alt}
        >
          {mobileImageSources.map((image, index) => (
            <div key={`${image}-${index}`} className="flex h-full w-full shrink-0 snap-center items-center justify-center">
              <img
                src={image}
                alt={alt}
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ))}
        </div>

        <div className="relative hidden h-full w-full items-center justify-center lg:flex">
          <img
            src={currentImage}
            alt={alt}
            className="max-h-full max-w-full object-contain"
          />
          {hasGalleryNavigation && (
            <>
              <button
                type="button"
                onClick={() => goToImage(activeIndex - 1)}
                aria-label={t('previous', 'pagination')}
                className="absolute left-0 rounded-full bg-white p-2 text-black shadow-lg transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => goToImage(activeIndex + 1)}
                aria-label={t('next', 'pagination')}
                className="absolute right-0 rounded-full bg-white p-2 text-black shadow-lg transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </div>

        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute right-0 top-0 z-10 rounded-md bg-white px-4 py-2 text-sm font-medium text-black shadow-lg transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {t('close', 'components')}
        </button>
        {hasGalleryNavigation && (
          <p className="pointer-events-none absolute bottom-0 z-10 rounded-full bg-black/70 px-3 py-1 text-sm text-white" aria-live="polite">
            {activeIndex + 1} / {imageSources.length}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
