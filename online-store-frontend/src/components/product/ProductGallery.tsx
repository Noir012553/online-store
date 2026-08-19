import { Badge } from '../ui/badge';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { EmojiSvg } from '../EmojiSvg';
import { UI_EMOJI } from '../../lib/uiEmoji';

interface ProductGalleryProps {
  productName: string;
  images: string[];
  mainImage?: string;
  selectedImage: number;
  discount: number;
  hasDeal: boolean;
  dealLabel: string;
  noImageLabel: string;
  onSelectImage: (index: number) => void;
  onOpenViewer: () => void;
}

export function ProductGallery({
  productName,
  images,
  mainImage,
  selectedImage,
  discount,
  hasDeal,
  dealLabel,
  noImageLabel,
  onSelectImage,
  onOpenViewer,
}: ProductGalleryProps) {
  return (
    <div>
      <div className="relative aspect-video mb-3 sm:mb-4 bg-gray-100 rounded-lg overflow-hidden group">
        {mainImage ? (
          <button
            type="button"
            onClick={onOpenViewer}
            className="absolute inset-0 h-full w-full cursor-zoom-in"
            aria-label={productName}
          >
            <ImageWithFallback
              src={mainImage}
              alt={productName}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              loading="eager"
              className="object-contain transition-transform duration-300 group-hover:scale-110"
            />
          </button>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-500">
            <div className="text-center">
              <p className="text-sm">{noImageLabel}</p>
            </div>
          </div>
        )}
        {discount > 0 && (
          <Badge className="absolute top-4 right-4 bg-red-600 text-white text-lg px-4 py-2 animate-in zoom-in duration-300">
            -{discount}%
          </Badge>
        )}
        {hasDeal && (
          <Badge className="absolute top-4 left-4 bg-black text-white text-lg px-4 py-2 animate-in zoom-in duration-300 flex items-center gap-1">
            <EmojiSvg emoji={UI_EMOJI.hotDeal} className="w-5 h-5" />
            {dealLabel}
          </Badge>
        )}
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              onClick={() => onSelectImage(index)}
              className={`relative aspect-video border-2 rounded overflow-hidden transition-all duration-300 hover:shadow-lg ${
                selectedImage === index ? 'border-red-600 scale-105' : 'border-gray-200'
              }`}
            >
              <ImageWithFallback
                src={image}
                alt={`${productName} ${index + 1}`}
                fill
                sizes="96px"
                loading="lazy"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
