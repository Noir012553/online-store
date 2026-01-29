import { ShoppingCart, Star, Eye } from "lucide-react";
import Link from "next/link";
import { Laptop } from "../lib/data";
import { formatCurrency } from "../lib/utils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { useCart } from "../lib/context/CartContext";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { toast } from "sonner";
import { useState } from "react";
import { QuickViewModal } from "./QuickViewModal";
import { EmojiSvg } from "./EmojiSvg";
import { getSpecsForCategory, getSpecLabel } from "../lib/specConfig";
import { BACKEND_URL } from "../config";

interface ProductCardProps {
  laptop: any;
  onQuickViewToggle?: (isOpen: boolean) => void;
}

export function ProductCard({ laptop, onQuickViewToggle }: ProductCardProps) {
  const { addToCart } = useCart();
  const [showQuickView, setShowQuickView] = useState(false);

  // Convert backend product to frontend Laptop format
  const convertedLaptop: Laptop = {
    id: laptop._id || laptop.id,
    name: laptop.name,
    brand: laptop.brand,
    category: laptop.category?._id || laptop.category?.id || laptop.category || 'unknown',
    categoryName: laptop.category?.name || '',
    price: laptop.price,
    originalPrice: laptop.originalPrice,
    image: laptop.image?.startsWith('http') ? laptop.image : `${BACKEND_URL}${laptop.image}`,
    images: (laptop.images || []).map((img: string) =>
      img.startsWith('http') ? img : `${BACKEND_URL}${img}`
    ),
    rating: laptop.rating || 0,
    reviews: laptop.numReviews || 0,
    inStock: (laptop.countInStock || 0) > 0,
    specs: laptop.specs || {},
    description: laptop.description,
    features: laptop.features || [],
    featured: laptop.featured || false,
    deal: laptop.deal,
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    addToCart(convertedLaptop);
    toast.success(`Đã thêm ${convertedLaptop.name} vào giỏ hàng`);
  };

  const handleQuickView = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowQuickView(true);
    onQuickViewToggle?.(true);
  };

  const discount = convertedLaptop.originalPrice
    ? Math.round(((convertedLaptop.originalPrice - convertedLaptop.price) / convertedLaptop.originalPrice) * 100)
    : 0;

  // Check if ID is valid MongoDB ObjectId (24 hex characters)
  const isValidId = /^[a-f0-9]{24}$/.test(convertedLaptop.id || '');
  const LinkComponent = isValidId ? Link : ({ children, href, ...props }: any) => <div {...props}>{children}</div>;

  return (
    <>
      <LinkComponent href={isValidId ? `/product/${convertedLaptop.id}` : '#'} className="group">
        <div className="bg-white border rounded-lg overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col min-h-120">
          <div className="relative aspect-square overflow-hidden">
            <ImageWithFallback
              src={convertedLaptop.image}
              alt={convertedLaptop.name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
            {discount > 0 && (
              <Badge className="absolute top-2 right-2 bg-red-600 text-white animate-in zoom-in duration-300">
                -{discount}%
              </Badge>
            )}
            {convertedLaptop.deal && (
              <Badge className="absolute top-2 left-2 bg-black text-white animate-in slide-in-from-left duration-300 flex items-center gap-1">
                <EmojiSvg emoji="🔥" className="w-4 h-4" />
                Deal Sốc
              </Badge>
            )}
            {convertedLaptop.featured && !convertedLaptop.deal && (
              <Badge className="absolute top-2 left-2 bg-red-600 text-white animate-in slide-in-from-left duration-300 flex items-center gap-1">
                <EmojiSvg emoji="⭐" className="w-4 h-4" />
                Nổi bật
              </Badge>
            )}
            {!convertedLaptop.inStock && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="bg-red-600 text-white px-4 py-2 rounded font-semibold">Hết hàng</span>
              </div>
            )}

            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <Button
                onClick={handleQuickView}
                size="sm"
                className="bg-white text-black hover:bg-gray-100 transform -translate-y-2 group-hover:translate-y-0 transition-all duration-300"
              >
                <Eye className="w-4 h-4 mr-2" />
                Xem nhanh
              </Button>
            </div>
          </div>

          <div className="p-3 flex flex-col flex-1">
            <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide h-5">{convertedLaptop.brand}</p>
            <h3 className="line-clamp-2 mb-2 text-black group-hover:text-red-600 transition-colors h-12">
              {convertedLaptop.name}
            </h3>

            <div className="flex items-center gap-2 mb-2 h-5">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm text-black">{convertedLaptop.rating.toFixed(1)}</span>
              </div>
              <span className="text-sm text-black">({convertedLaptop.reviews})</span>
            </div>

            <div className="h-24 mb-3 text-sm text-gray-600 space-y-1 overflow-hidden">
              {(() => {
                const categoryName = convertedLaptop.categoryName || '';
                const specs = convertedLaptop.specs || {};

                // Get relevant specs for this category (max 4 items)
                const specFields = getSpecsForCategory(categoryName);
                const displaySpecs: Array<[string, string]> = [];

                // Collect specs with values only (no N/A)
                specFields.forEach((field) => {
                  const value = specs[field];
                  if (value && value.toString().trim()) {
                    displaySpecs.push([field, value.toString()]);
                  }
                });

                // Show up to 4 specs
                const specsToShow = displaySpecs.slice(0, 4);

                // If no specs found, show placeholder
                if (specsToShow.length === 0) {
                  return <p className="text-gray-400 italic">Không có thông số</p>;
                }

                return (
                  <>
                    {specsToShow.map(([field, value], idx) => (
                      <p key={idx} className="truncate">
                        <span className="text-gray-500">{getSpecLabel(field)}:</span> {value}
                      </p>
                    ))}
                  </>
                );
              })()}
            </div>

            <div className="flex items-center gap-2 mb-3 h-6">
              <span className="text-red-600">{formatCurrency(convertedLaptop.price)}</span>
              {convertedLaptop.originalPrice && (
                <span className="text-gray-400 line-through text-sm">
                  {formatCurrency(convertedLaptop.originalPrice)}
                </span>
              )}
            </div>

            <Button
              onClick={handleAddToCart}
              disabled={!convertedLaptop.inStock}
              className="w-full bg-red-600 hover:bg-red-700 transition-all duration-300 hover:shadow-lg text-white"
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Thêm vào giỏ
            </Button>
          </div>
        </div>
      </LinkComponent>

      {showQuickView && (
        <QuickViewModal laptop={convertedLaptop} onClose={() => {
          setShowQuickView(false);
          onQuickViewToggle?.(false);
        }} />
      )}
    </>
  );
}
