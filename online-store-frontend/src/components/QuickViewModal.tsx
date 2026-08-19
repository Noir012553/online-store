import { Star, ShoppingCart, X } from "lucide-react";
import { Laptop, isActiveDeal } from "../lib/data";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { useCart } from "../lib/context/CartContext";
import { useTranslation } from "../lib/i18n";
import { useLanguage } from "../lib/i18n";
import { ImageWithFallback } from "./image/ImageWithFallback";
import { toast } from "sonner";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { UI_EMOJI } from "../lib/uiEmoji";
import { ImageViewer } from "./ImageViewer";

interface QuickViewModalProps {
  laptop: Laptop;
  onClose: () => void;
}

export function QuickViewModal({ laptop, onClose }: QuickViewModalProps) {
  const { addToCart } = useCart();
  const { t } = useTranslation();
  const { locale } = useLanguage();
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const handleAddToCart = () => {
    if (isAddingToCart) return;

    setIsAddingToCart(true);
    try {
      addToCart(laptop);
      toast.success(`${laptop.name} ${t('product_added_to_cart', 'products')}`);
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 300);
    } finally {
      setIsAddingToCart(false);
    }
  };

  const discount = Math.max(
    laptop.originalPrice
      ? Math.round(((laptop.originalPrice - laptop.price) / laptop.originalPrice) * 100)
      : 0,
    isActiveDeal(laptop.deal) ? Number(laptop.deal?.discount) : 0
  );
  const hasActiveDeal = isActiveDeal(laptop.deal);
  const isFeaturedHotDeal = laptop.featured && hasActiveDeal;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-3 animate-in fade-in duration-200 sm:p-5">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <h2 className="text-lg font-semibold text-black sm:text-xl">{t('quick_view_title', 'products')}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full text-black hover:bg-gray-200"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid gap-7 md:grid-cols-2 md:gap-8">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-gray-50">
              <ImageWithFallback
                src={laptop.image}
                alt={String(laptop.name || '')}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="rounded-xl object-cover cursor-zoom-in"
                onClick={() => setIsImageViewerOpen(true)}
              />
              {discount > 0 && (
                <Badge className="absolute top-3 right-3 bg-red-600 text-white">
                  -{discount}%
                </Badge>
              )}
              {hasActiveDeal && (
                <Badge
                  className={`absolute top-3 left-3 flex items-center gap-1 text-white ${
                    isFeaturedHotDeal
                      ? 'bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 shadow-lg shadow-red-500/30'
                      : 'bg-black'
                  }`}
                >
                  <span className={`w-4 h-4 ${isFeaturedHotDeal ? 'motion-safe:animate-bounce' : ''}`}>{UI_EMOJI.hotDeal}</span>
                  {t('hot_deal_badge', 'products')}
                </Badge>
              )}
              {laptop.featured && !hasActiveDeal && (
                <Badge className="absolute top-3 left-3 bg-red-600 text-white flex items-center gap-1">
                  <span className="w-4 h-4">{UI_EMOJI.featured}</span>
                  {t('featured_badge', 'products')}
                </Badge>
              )}
              {!laptop.inStock && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
                  <span className="bg-white px-6 py-3 rounded text-black font-semibold">{t('out_of_stock', 'products')}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col space-y-5">
              <div className="border-b pb-5">
                <h3 className="mb-3 text-xl font-semibold leading-snug text-black">{String(laptop.name || '')}</h3>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                    <span className="font-semibold text-black">{laptop.rating}</span>
                  </div>
                  <span className="text-gray-600">({laptop.reviews} {t('reviews_text', 'products')})</span>
                </div>
              </div>

              <div className="flex min-h-16 flex-col justify-end gap-1 rounded-xl bg-red-50 px-4 py-3">
                {laptop.originalPrice != null && laptop.originalPrice > laptop.price && (
                  <span className="text-base font-semibold text-red-600 line-through">
                    {laptop.formattedOriginalPrice}
                  </span>
                )}
                <span className="text-2xl font-bold text-green-600">{laptop.formattedPrice}</span>
              </div>

              {Object.keys(laptop.specs || {}).length > 0 && (
                <div className="space-y-3 rounded-xl border bg-gray-50 p-4">
                  <h4 className="font-semibold text-black">{t('specifications', 'products')}</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {Object.entries(laptop.specs).slice(0, 6).map(([key, value]) => (
                      <div key={key} className="min-w-0">
                        <p className="font-medium text-gray-700">{key}:</p>
                        <p className="truncate text-black">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-auto space-y-3 border-t pt-5">
                <Button
                  onClick={handleAddToCart}
                  disabled={!laptop.inStock || isAddingToCart}
                  className="w-full bg-red-600 font-semibold text-white shadow-md shadow-red-600/20 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  {isAddingToCart ? t('adding_to_cart', 'products') : t('add_to_cart_btn', 'products')}
                </Button>
                <Link href={`/product/${laptop.id}`} onClick={onClose}>
                  <Button variant="ghost" className="pointer-events-auto w-full border-2 border-red-600 bg-white font-semibold text-red-600 hover:border-red-700 hover:bg-red-50">
                    {t('view_details', 'products')}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      {isImageViewerOpen && (
        <ImageViewer
          src={laptop.image}
          alt={String(laptop.name || '')}
          images={laptop.images}
          onClose={() => setIsImageViewerOpen(false)}
        />
      )}
    </div>
  );
}
