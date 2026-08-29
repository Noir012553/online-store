import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '../lib/i18n';

interface ImageViewerProps {
  src: string;
  alt: string;
  images?: string[];
  initialIndex?: number;
  onClose: () => void;
}

export function ImageViewer({ src, alt, images = [src], initialIndex = 0, onClose }: ImageViewerProps) {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [isMounted, setIsMounted] = useState(false);
  const imageSources = images.filter(Boolean);
  const currentImage = imageSources[activeIndex] || src;
  const hasGalleryNavigation = imageSources.length > 1;

  useEffect(() => {
    setIsMounted(true);
    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && hasGalleryNavigation) {
        setActiveIndex((index) => (index - 1 + imageSources.length) % imageSources.length);
      }
      if (event.key === 'ArrowRight' && hasGalleryNavigation) {
        setActiveIndex((index) => (index + 1) % imageSources.length);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedElementRef.current?.focus();
    };
  }, [hasGalleryNavigation, imageSources.length, onClose]);

  useEffect(() => {
    if (isMounted) closeButtonRef.current?.focus();
  }, [isMounted]);

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
        <img
          src={currentImage}
          alt={alt}
          className="max-h-full max-w-full object-contain"
        />
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute right-0 top-0 rounded-md bg-white px-4 py-2 text-sm font-medium text-black shadow-lg transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {t('close', 'components')}
        </button>
        {hasGalleryNavigation && (
          <>
            <button
              type="button"
              onClick={() => setActiveIndex((index) => (index - 1 + imageSources.length) % imageSources.length)}
              aria-label={t('previous', 'pagination')}
              className="absolute left-0 rounded-full bg-white p-2 text-black shadow-lg transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => setActiveIndex((index) => (index + 1) % imageSources.length)}
              aria-label={t('next', 'pagination')}
              className="absolute right-0 rounded-full bg-white p-2 text-black shadow-lg transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
            <p className="absolute bottom-0 rounded-full bg-black/70 px-3 py-1 text-sm text-white" aria-live="polite">
              {activeIndex + 1} / {imageSources.length}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
