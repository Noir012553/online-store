import { ShoppingCart, Star, Eye } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Laptop, getCategoryName, getTranslatedValue, isActiveDeal, isShockDiscount } from "../lib/data";
import { formatCurrency, formatNumber, getImageUrl } from "../lib/utils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { useCart } from "../lib/context/CartContext";
import { useLanguage } from "../lib/i18n";
import { ImageWithFallback } from "./image/ImageWithFallback";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { EmojiSvg } from "./EmojiSvg";
import { UI_EMOJI } from "../lib/uiEmoji";
import { BackendProduct } from "../lib/api";

const QuickViewModal = dynamic(() => import("./QuickViewModal").then((mod) => mod.QuickViewModal), {
  ssr: false,
});

interface ProductCardProps {
  laptop: BackendProduct;
  onQuickViewToggle?: (isOpen: boolean) => void;
}

const ProductDetailsContainer = ({ href, children, className, ...rest }: { href?: string; children: React.ReactNode; className?: string; [key: string]: any }) => {
  if (href) {
    return <Link href={href} className={className} {...rest}>{children}</Link>;
  }
  return <div className={className} {...rest}>{children}</div>;
};

export function ProductCard({ laptop, onQuickViewToggle }: ProductCardProps) {
  const { addToCart } = useCart();
  const { t, locale } = useLanguage();
  const [showQuickView, setShowQuickView] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  // Convert backend product to frontend Laptop format
  const convertedLaptop: Laptop = useMemo(() => {
    const categoryObj = laptop.category && typeof laptop.category === 'object' ? laptop.category : null;
    const categoryId = categoryObj ? (categoryObj._id ?? categoryObj.id) : (typeof laptop.category === 'string' ? laptop.category : undefined);
    const displayCategoryName = categoryObj ? getCategoryName(categoryObj, locale) : '';
    const displayBrand = getTranslatedValue(laptop.brand, locale) || t('no_brand', 'products');

    return {
      id: laptop._id || laptop.id || '',
      name: getTranslatedValue(laptop.name, locale),
      brand: displayBrand,
      category: categoryId || t('no_category', 'admin'),
      categoryName: displayCategoryName || t('no_category', 'admin'),
      price: laptop.price,
      formattedPrice: formatCurrency(laptop.price, laptop.formattedPrice, locale, laptop.baseCurrencyCode),
      baseCurrencyCode: laptop.baseCurrencyCode,
      originalPrice: laptop.originalPrice,
      formattedOriginalPrice: laptop.formattedOriginalPrice,
      discountPercentage: Math.max(
        Number(laptop.discountPercentage) || 0,
        isActiveDeal(laptop.deal) ? Number(laptop.deal?.discount) || 0 : 0,
      ),
      image: getImageUrl(laptop.image) || '',
      images: (laptop.images || []).map((img: string) => getImageUrl(img) || ''),
      rating: laptop.rating || 0,
      reviews: laptop.numReviews ?? (
        Array.isArray(laptop.reviews) ? laptop.reviews.length : Number(laptop.reviews) || 0
      ),
      inStock: (laptop.countInStock || 0) > 0,
      specs: laptop.specs || {},
      specLabels: laptop.specLabels || {},
      description: laptop.description || '',
      featured: laptop.featured || false,
      deal: laptop.deal,
    };
  }, [laptop, locale, t]);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Prevent multiple rapid clicks
    if (isAddingToCart || !convertedLaptop.inStock) return;

    setIsAddingToCart(true);
    try {
      addToCart(convertedLaptop);
      toast.success(`${convertedLaptop.name} ${t('product_added_to_cart', 'products')}`);
    } finally {
      setTimeout(() => setIsAddingToCart(false), 500);
    }
  };

  const handleQuickView = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowQuickView(true);
    onQuickViewToggle?.(true);
  };

  const discount = Math.max(0, convertedLaptop.discountPercentage ?? 0);
  const hasOriginalPrice = convertedLaptop.originalPrice != null
    && convertedLaptop.originalPrice > convertedLaptop.price
    && Boolean(convertedLaptop.formattedOriginalPrice);
  const hasActiveDeal = isActiveDeal(convertedLaptop.deal);
  const hasShockDiscount = isShockDiscount(discount);
  const isFeaturedHotDeal = convertedLaptop.featured && hasActiveDeal;

  // Check if ID is valid MongoDB ObjectId (24 hex characters)
  const isValidId = useMemo(() => /^[a-f0-9]{24}$/.test(convertedLaptop.id || ''), [convertedLaptop.id]);

  const productHref = isValidId ? `/product/${convertedLaptop.id}` : undefined;

  return (
    <>
      <div className="group block h-full">
        <div className="bg-white border rounded-lg overflow-hidden group-hover:shadow-xl transition-shadow duration-300 flex flex-col h-full relative z-0">
          <div className="relative aspect-square overflow-hidden bg-gray-100">
            <ProductDetailsContainer href={productHref} className="absolute inset-0 z-0 block">
              <ImageWithFallback
                src={convertedLaptop.image}
                alt={String(convertedLaptop.name)}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 256px"
                loading="lazy"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-110 transform-gpu pointer-events-none"
              />
              {discount > 0 && (
                <Badge className="absolute top-2 right-2 bg-red-600 text-white z-10 pointer-events-none">
                  -{discount}%
                </Badge>
              )}
              {(hasActiveDeal || hasShockDiscount) && (
                <Badge
                  className={`absolute top-2 left-2 z-10 flex items-center gap-1 pointer-events-none text-white ${
                    hasShockDiscount
                      ? 'bg-red-600'
                      : isFeaturedHotDeal
                        ? 'bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 shadow-lg shadow-red-500/30'
                        : 'bg-black'
                  }`}
                >
                  <EmojiSvg
                    emoji={UI_EMOJI.hotDeal}
                    className={`w-4 h-4 ${isFeaturedHotDeal && !hasShockDiscount ? 'motion-safe:animate-bounce drop-shadow-[0_0_6px_rgba(255,255,255,0.45)]' : ''}`}
                  />
                  {t(hasShockDiscount ? 'shock_discount_badge' : 'hot_deal_badge', 'products')}
                </Badge>
              )}
              {convertedLaptop.featured && !hasActiveDeal && !hasShockDiscount && (
                <Badge className="absolute top-2 left-2 bg-red-600 text-white z-10 flex items-center gap-1 pointer-events-none">
                  <EmojiSvg emoji={UI_EMOJI.featured} className="w-4 h-4" />
                  {t('featured_badge', 'products')}
                </Badge>
              )}
              {!convertedLaptop.inStock && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
                  <span className="bg-red-600 text-white px-4 py-2 rounded font-semibold">{t('out_of_stock', 'products')}</span>
                </div>
              )}
            </ProductDetailsContainer>

            <div className="absolute inset-0 z-20 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center pointer-events-none">
              <Button
                type="button"
                onClick={handleQuickView}
                size="sm"
                className="bg-white text-black hover:bg-gray-100 transform -translate-y-2 group-hover:translate-y-0 transition-all duration-300 pointer-events-auto cursor-pointer"
              >
                <Eye className="w-4 h-4 mr-2" />
                {t('quick_view', 'products')}
              </Button>
            </div>
          </div>

          <div className="p-2 sm:p-3 flex flex-col flex-1">
            <ProductDetailsContainer href={productHref} className="flex flex-1 flex-col">
              <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide h-4 sm:h-5">{convertedLaptop.brand}</p>
              <h3 className="mb-2 text-xs sm:text-sm text-black group-hover:text-red-600 transition-colors h-16 sm:h-20 line-clamp-3 flex items-start">
                {String(convertedLaptop.name)}
              </h3>

              <div className="flex items-center gap-2 mb-2 h-4 sm:h-5">
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 sm:w-4 sm:h-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-xs sm:text-sm text-black">{formatNumber(convertedLaptop.rating, locale)}</span>
                </div>
                <span className="text-xs sm:text-sm text-black">({convertedLaptop.reviews})</span>
              </div>

              <div className="h-20 sm:h-32 mb-3 text-xs sm:text-sm text-gray-600 space-y-0.5 overflow-hidden">
                {(() => {
                  const specEntries = Object.entries(convertedLaptop.specs || {}).slice(0, 4);
                  if (specEntries.length === 0) {
                    return <p className="text-xs text-gray-400">{t('no_specs', 'products')}</p>;
                  }

                  return specEntries.map(([key, value]) => (
                    <p key={key} className="truncate text-xs">
                      <span className="text-gray-500">{convertedLaptop.specLabels?.[key] || key}:</span> {String(value)}
                    </p>
                  ));
                })()}
              </div>

              <div className="flex flex-col justify-end gap-0.5 mb-2 h-10 sm:h-12 mx-auto">
                {(hasOriginalPrice || discount > 0) && (
                  <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
                    {hasOriginalPrice && (
                      <span className="text-red-600 line-through text-xs sm:text-sm font-medium">
                        {convertedLaptop.formattedOriginalPrice}
                      </span>
                    )}
                    {discount > 0 && (
                      <span className="text-red-600 text-xs sm:text-sm font-semibold">-{discount}%</span>
                    )}
                  </div>
                )}
                <span className="text-green-600 font-bold text-xs sm:text-sm">{convertedLaptop.formattedPrice}</span>
              </div>
            </ProductDetailsContainer>

            <Button
              type="button"
              onClick={handleAddToCart}
              disabled={!convertedLaptop.inStock || isAddingToCart}
              className="w-full bg-red-600 hover:bg-red-700 transition-all duration-300 hover:shadow-lg text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-xs sm:text-sm py-1.5 sm:py-2"
            >
              <span className="flex items-center justify-center gap-1">
                <ShoppingCart className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{t('add_to_cart_btn', 'products')}</span>
                <span className="sm:hidden">{t('add_to_cart_btn', 'products')}</span>
              </span>
            </Button>
          </div>
        </div>
      </div>

      {showQuickView && (
        <QuickViewModal laptop={convertedLaptop} onClose={() => {
          setShowQuickView(false);
          onQuickViewToggle?.(false);
        }} />
      )}
    </>
  );
}
