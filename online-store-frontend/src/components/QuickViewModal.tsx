import { Star, ShoppingCart, X } from "lucide-react";
import { Laptop } from "../lib/data";
import { formatCurrency } from "../lib/utils";
import { filterSpecsByCategory, getSpecLabel } from "../lib/specConfig";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { useCart } from "../lib/context/CartContext";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { toast } from "sonner";
import Link from "next/link";

interface QuickViewModalProps {
  laptop: Laptop;
  onClose: () => void;
}

export function QuickViewModal({ laptop, onClose }: QuickViewModalProps) {
  const { addToCart } = useCart();

  const handleAddToCart = () => {
    addToCart(laptop);
    toast.success(`Đã thêm ${laptop.name} vào giỏ hàng`);
    onClose();
  };

  const discount = laptop.originalPrice
    ? Math.round(((laptop.originalPrice - laptop.price) / laptop.originalPrice) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-black">Xem nhanh sản phẩm</h2>
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
            <div className="relative">
              <ImageWithFallback
                src={laptop.image}
                alt={laptop.name}
                className="w-full rounded-lg"
              />
              {discount > 0 && (
                <Badge className="absolute top-3 right-3 bg-red-600 text-white">
                  -{discount}%
                </Badge>
              )}
              {!laptop.inStock && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                  <span className="bg-white px-6 py-3 rounded text-black font-semibold">Hết hàng</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2 text-black">{laptop.name}</h3>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                    <span className="font-semibold text-black">{laptop.rating}</span>
                  </div>
                  <span className="text-gray-600">({laptop.reviews} đánh giá)</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xl font-bold text-red-600">{formatCurrency(laptop.price)}</span>
                {laptop.originalPrice && (
                  <span className="text-gray-500 line-through">
                    {formatCurrency(laptop.originalPrice)}
                  </span>
                )}
              </div>

              {(() => {
                const specs = laptop.specs || {};
                const categoryName = laptop.categoryName || laptop.category || 'gaming';
                const filteredSpecs = filterSpecsByCategory(specs, categoryName);
                const specEntries = Object.entries(filteredSpecs);

                if (specEntries.length === 0) {
                  return null;
                }

                return (
                  <div className="space-y-2 py-4 border-y">
                    <h4 className="font-semibold text-black">Thông số kỹ thuật:</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {specEntries.slice(0, 6).map(([field, value]) => (
                        <div key={field}>
                          <p className="text-gray-700 font-medium">{getSpecLabel(field as any)}:</p>
                          <p className="text-black">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-3">
                <Button
                  onClick={handleAddToCart}
                  disabled={!laptop.inStock}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Thêm vào giỏ hàng
                </Button>
                <Link href={`/product/${laptop.id}`} onClick={onClose}>
                  <Button className="w-full border-2 border-red-600 text-red-600 hover:bg-red-50 font-semibold">
                    Xem chi tiết
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
