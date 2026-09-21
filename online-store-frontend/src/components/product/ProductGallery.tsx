import { Badge } from '../ui/badge';
import { ImageWithFallback } from '../image/ImageWithFallback';
import { Flame, Star } from 'lucide-react';
import { isShockDiscount } from '../../lib/data';

interface ProductGalleryProps {
  productName: string;
  images: string[];
  mainImage?: string;
  selectedImage: number;
  discount: number;
  hasDeal: boolean;
  featured: boolean;
  featuredLabel: string;
  dealLabel: string;
  shockDiscountLabel: string;
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
  featured,
  featuredLabel,
  dealLabel,
  shockDiscountLabel,
  noImageLabel,
  onSelectImage,
  onOpenViewer,
}: ProductGalleryProps) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-red-50/60 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.45)] group">
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
              priority
              loading="eager"
              className="object-contain transition-transform duration-300 group-hover:scale-110"
            />
          </button>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-500">
            <div className="text-center">
              <p className="text-sm">{noImageLabel}</p>
            </div>
          </div>
        )}
        {discount > 0 && (
          <Badge className="absolute right-4 top-4 rounded-full bg-red-600 px-3 py-1.5 text-sm font-bold text-white shadow-lg shadow-red-600/20 animate-in zoom-in duration-300">
            -{discount}%
          </Badge>
        )}
        {(hasDeal || isShockDiscount(discount)) && (
          <Badge className={`absolute left-4 top-4 rounded-full px-3 py-1.5 text-sm font-semibold text-white shadow-lg animate-in zoom-in duration-300 flex items-center gap-1 ${isShockDiscount(discount) ? 'bg-red-600 shadow-red-600/20' : 'bg-slate-950/90 shadow-slate-950/20'}`}>
            <Flame className="h-4 w-4" />
            {isShockDiscount(discount) ? shockDiscountLabel : dealLabel}
          </Badge>
        )}
        {featured && !hasDeal && !isShockDiscount(discount) && (
          <Badge className="absolute left-4 top-4 rounded-full bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-lg shadow-red-600/20 animate-in zoom-in duration-300 flex items-center gap-1">
            <Star className="h-4 w-4 fill-current" />
            {featuredLabel}
          </Badge>
        )}
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200/80 bg-slate-100/70 p-2 sm:grid-cols-4 sm:gap-3">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              onClick={() => onSelectImage(index)}
              className={`relative aspect-video overflow-hidden rounded-xl border-2 bg-white p-1 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
                selectedImage === index ? 'border-red-600 shadow-md shadow-red-600/15' : 'border-transparent'
              }`}
            >
              <ImageWithFallback
                src={image}
                alt={`${productName} ${index + 1}`}
                fill
                sizes="96px"
                loading="lazy"
                className="rounded-lg object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
