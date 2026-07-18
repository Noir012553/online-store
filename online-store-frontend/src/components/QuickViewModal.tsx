import { Star, ShoppingCart, X } from "lucide-react";
import { Laptop } from "../lib/data";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { useCart } from "../lib/context/CartContext";
import { useTranslation } from "../lib/i18n";
import { useLanguage } from "../lib/i18n";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { toast } from "sonner";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useCurrencyConversion } from "../hooks/useCurrencyConversion";

interface QuickViewModalProps {
  laptop: Laptop;
  onClose: () => void;
}

export function QuickViewModal({ laptop, onClose }: QuickViewModalProps) {
  const { addToCart } = useCart();
  const { t } = useTranslation();
  const { locale } = useLanguage();
  const { formatConvertedPrice } = useCurrencyConversion();
  const [isAddingToCart, setIsAddingToCart] = useState(false);
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

  const discount = laptop.originalPrice
    ? Math.round(((laptop.originalPrice - laptop.price) / laptop.originalPrice) * 100)
    : 0;
  const isFeaturedHotDeal = laptop.featured && !!laptop.deal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-black">{t('quick_view_title', 'products')}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full text-black hover:bg-gray-200"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="relative aspect-square">
              <ImageWithFallback
                src={laptop.image}
                alt={String(laptop.name || '')}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="rounded-lg object-cover"
              />
              {discount > 0 && (
                <Badge className="absolute top-3 right-3 bg-red-600 text-white">
                  -{discount}%
                </Badge>
              )}
              {laptop.deal && (
                <Badge
                  className={`absolute top-3 left-3 flex items-center gap-1 text-white ${
                    isFeaturedHotDeal
                      ? 'bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 shadow-lg shadow-red-500/30'
                      : 'bg-black'
                  }`}
                >
                  <span className={`w-4 h-4 ${isFeaturedHotDeal ? 'motion-safe:animate-bounce' : ''}`}>🔥</span>
                  {t('hot_deal_badge', 'products')}
                </Badge>
              )}
              {laptop.featured && !laptop.deal && (
                <Badge className="absolute top-3 left-3 bg-red-600 text-white flex items-center gap-1">
                  <span className="w-4 h-4">⭐</span>
                  {t('featured_badge', 'products')}
                </Badge>
              )}
              {!laptop.inStock && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                  <span className="bg-white px-6 py-3 rounded text-black font-semibold">{t('out_of_stock', 'products')}</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2 text-black">{String(laptop.name || '')}</h3>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                    <span className="font-semibold text-black">{laptop.rating}</span>
                  </div>
                  <span className="text-gray-600">({laptop.reviews} {t('reviews_text', 'products')})</span>
                </div>
              </div>

              <div className="flex flex-col justify-end gap-1 h-14">
                {laptop.originalPrice && (
                  <span className="text-lg text-red-600 line-through font-semibold">
                    {formatConvertedPrice(laptop.originalPrice, laptop.baseCurrencyCode)}
                  </span>
                )}
                <span className="text-xl font-bold text-green-600">{formatConvertedPrice(laptop.price, laptop.baseCurrencyCode)}</span>
              </div>

              {Object.keys(laptop.specs || {}).length > 0 && (
                <div className="space-y-2 py-4 border-y">
                  <h4 className="font-semibold text-black">{t('specifications', 'products')}</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(laptop.specs).slice(0, 6).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-gray-700 font-medium">{key}:</p>
                        <p className="text-black">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Button
                  onClick={handleAddToCart}
                  disabled={!laptop.inStock || isAddingToCart}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  {isAddingToCart ? t('adding_to_cart', 'products') : t('add_to_cart_btn', 'products')}
                </Button>
                <Link href={`/product/${laptop.id}`} onClick={onClose}>
                  <Button variant="ghost" className="w-full bg-white border-2 border-red-600 text-red-600 font-semibold hover:bg-red-50 hover:border-red-700 pointer-events-auto">
                    {t('view_details', 'products')}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
