import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';
import { useTranslation } from '../../lib/context/LanguageContext';

const ERROR_IMG_SRC =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg==';
const imageOptimizerSources = new Set<string>(
  JSON.parse(process.env.NEXT_PUBLIC_IMAGE_OPTIMIZER_SOURCES || '[]'),
);

const shouldUnoptimizeImage = (src: string | null | undefined) => {
  if (!src || !/^https?:\/\//i.test(src)) return false;

  try {
    const imageUrl = new URL(src);
    return !imageOptimizerSources.has(`${imageUrl.protocol}//${imageUrl.hostname}`);
  } catch {
    return true;
  }
};

type ImageWithFallbackProps = Omit<ImageProps, 'src' | 'alt'> & {
  src?: string | null;
  alt: string;
  fallbackSrc?: string | null;
  srcSet?: string;
};

export function ImageWithFallback({
  src,
  alt,
  fallbackSrc,
  className,
  style,
  fill,
  sizes,
  preload,
  loading,
  quality,
  ...rest
}: ImageWithFallbackProps) {
  const [didError, setDidError] = useState(false);
  const [didFallbackError, setDidFallbackError] = useState(false);
  const { t } = useTranslation();

  const hasValidSrc = src && typeof src === 'string' && src.trim() !== '';
  const hasValidFallback = fallbackSrc && typeof fallbackSrc === 'string' && fallbackSrc.trim() !== '';
  const showFallback = Boolean(hasValidFallback && (didError || !hasValidSrc) && !didFallbackError);
  const shouldShowError = !showFallback && (didError || !hasValidSrc || didFallbackError);
  const currentSrc = showFallback ? fallbackSrc : src;
  const unoptimized = shouldUnoptimizeImage(currentSrc);
  const handleError = () => {
    if (showFallback) {
      setDidFallbackError(true);
      return;
    }

    setDidError(true);
  };
  const { srcSet, ...restWithoutImageSources } = rest as typeof rest & {
    srcSet?: string;
  };
  void srcSet;
  const imageRest = showFallback || preload ? restWithoutImageSources : rest;

  if (shouldShowError) {
    const errorAlt = t('image_load_error_alt', 'components');
    if (fill) {
      return (
        <div className={`relative h-full w-full overflow-hidden bg-gray-100 ${className ?? ''}`} style={style}>
          <Image
            src={ERROR_IMG_SRC}
            alt={errorAlt}
            width={88}
            height={88}
            sizes={sizes ?? '100vw'}
            loading={loading}
            className="absolute inset-0 h-full w-full object-contain"
            unoptimized
          />
        </div>
      );
    }

    return <img src={ERROR_IMG_SRC} alt={errorAlt} className={className} style={style} loading={loading} {...restWithoutImageSources} />;
  }

  if (fill) {
    return (
      <Image
        src={(showFallback ? fallbackSrc : src)!}
        alt={alt}
        fill
        sizes={sizes ?? '100vw'}
        preload={preload}
        loading={loading}
        quality={quality}
        className={className}
        style={style}
        onError={handleError}
        {...imageRest}
        unoptimized={unoptimized}
      />
    );
  }

  if (typeof rest.width === 'number' && typeof rest.height === 'number') {
    return (
      <Image
        src={(showFallback ? fallbackSrc : src)!}
        alt={alt}
        width={rest.width}
        height={rest.height}
        sizes={sizes}
        preload={preload}
        loading={loading}
        quality={quality}
        className={className}
        style={style}
        onError={handleError}
        {...imageRest}
        unoptimized={unoptimized}
      />
    );
  }

  return (
    <img
      src={(showFallback ? fallbackSrc : src)!}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      onError={handleError}
      {...(showFallback ? restWithoutImageSources : rest)}
    />
  );
}
