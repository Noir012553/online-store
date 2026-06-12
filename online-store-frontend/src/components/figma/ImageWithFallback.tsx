import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';
import { useTranslation } from '../../lib/context/LanguageContext';

const ERROR_IMG_SRC =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg==';

type ImageWithFallbackProps = Omit<ImageProps, 'src' | 'alt'> & {
  src?: string | null;
  alt: string;
};

export function ImageWithFallback({
  src,
  alt,
  className,
  style,
  fill,
  sizes,
  priority,
  quality,
  ...rest
}: ImageWithFallbackProps) {
  const [didError, setDidError] = useState(false);
  const { t } = useTranslation();

  const handleError = () => {
    console.error('[ImageWithFallback] ❌ Failed to load image:', { src, alt });
    setDidError(true);
  };

  const hasValidSrc = src && typeof src === 'string' && src.trim() !== '';
  const shouldShowError = didError || !hasValidSrc;
  const { loading, ...restWithoutLoading } = rest as typeof rest & {
    loading?: 'lazy' | 'eager';
  };
  void loading;
  const imageRest = priority ? restWithoutLoading : rest;

  if (shouldShowError) {
    const errorAlt = t('image_load_error_alt', 'components');
    if (fill) {
      return (
        <div className={`relative h-full w-full overflow-hidden bg-gray-100 ${className ?? ''}`} style={style}>
          <Image
            src={ERROR_IMG_SRC}
            alt={errorAlt}
            fill
            sizes={sizes ?? '100vw'}
            className="object-contain"
            unoptimized
          />
        </div>
      );
    }

    return <img src={ERROR_IMG_SRC} alt={errorAlt} className={className} style={style} {...restWithoutLoading} />;
  }

  if (fill) {
    return (
      <Image
        src={src!}
        alt={alt}
        fill
        sizes={sizes ?? '100vw'}
        priority={priority}
        quality={quality}
        className={className}
        style={style}
        onError={handleError}
        {...imageRest}
      />
    );
  }

  if (typeof rest.width === 'number' && typeof rest.height === 'number') {
    return (
      <Image
        src={src!}
        alt={alt}
        width={rest.width}
        height={rest.height}
        sizes={sizes}
        priority={priority}
        quality={quality}
        className={className}
        style={style}
        onError={handleError}
        {...imageRest}
      />
    );
  }

  return <img src={src!} alt={alt} className={className} style={style} onError={handleError} {...restWithoutLoading} />;
}
