import { Star, ShoppingCart, Minus, Plus, Shield, CreditCard } from 'lucide-react';
import { useLanguage } from '../../lib/i18n';
import { Laptop } from '../../lib/data';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { interpolateTranslation } from '../../lib/translationInterpolate';
import { UI_EMOJI } from '../../lib/uiEmoji';

interface ProductOverviewProps {
  product: Laptop;
  stockCount: number;
  reviewCount: number;
  canDisplayPrice: boolean;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  onAddToCart: () => void;
  onBuyNow: () => void;
}

export function ProductOverview({
  product,
  stockCount,
  reviewCount,
  canDisplayPrice,
  quantity,
  onQuantityChange,
  onAddToCart,
  onBuyNow,
}: ProductOverviewProps) {
  const { t } = useLanguage();

  return (
    <div>
      <h1 className="mb-3 sm:mb-4 text-xl sm:text-2xl">
        {product.name || ''}
      </h1>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
        <div className="flex items-center gap-1 sm:gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Star
              key={index}
              className={`w-4 h-4 sm:w-5 sm:h-5 ${
                index < Math.floor(product.rating || 0)
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-gray-300'
              }`}
            />
          ))}
          <span className="text-sm sm:text-base">{(product.rating || 0).toFixed(1)}</span>
        </div>
        <span className="text-xs sm:text-sm text-gray-500">
          {interpolateTranslation(t('reviews_count', 'product-ui'), { count: reviewCount })}
        </span>
        <Badge variant={stockCount > 0 ? 'default' : 'destructive'} className="text-xs sm:text-sm">
          {stockCount > 0
            ? interpolateTranslation(t('stock_in_stock', 'products'), { count: stockCount })
            : t('stock_out_of_stock', 'products')}
        </Badge>
      </div>

      <div className="flex flex-col gap-2 mb-4 sm:mb-6">
        {canDisplayPrice && (
          <>
            {product.formattedOriginalPrice && (
              <span className="text-lg sm:text-2xl text-red-600 line-through font-semibold">
                {product.formattedOriginalPrice}
              </span>
            )}
            <span className="text-2xl sm:text-3xl text-green-600 font-bold">
              {product.formattedPrice}
            </span>
          </>
        )}
      </div>

      {Object.keys(product.specs).length > 0 && (
        <div className="bg-white p-3 sm:p-4 rounded-lg mb-4 sm:mb-6">
          <h3 className="mb-2 sm:mb-3 text-sm sm:text-base font-semibold">{t('section_specifications', 'products')}</h3>
          <div className="space-y-1 sm:space-y-2 text-gray-700">
            {Object.entries(product.specs).slice(0, 5).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-4 text-xs sm:text-sm">
                <span className="font-medium capitalize">{UI_EMOJI.bullet} {key}:</span>
                <span className="text-right">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6 text-sm sm:text-base">
        <span>{t('label_quantity', 'products')}:</span>
        <div className="flex items-center border rounded">
          <button
            type="button"
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            className="p-1.5 sm:p-2 hover:bg-gray-100"
          >
            <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min="1"
            max={stockCount > 0 ? stockCount : undefined}
            value={quantity}
            onChange={(event) => onQuantityChange(Math.max(1, parseInt(event.target.value) || 1))}
            className="w-12 sm:w-16 text-center border-x text-sm"
          />
          <button
            type="button"
            onClick={() => onQuantityChange(quantity + 1)}
            className="p-1.5 sm:p-2 hover:bg-gray-100"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-4 sm:mb-6">
        <Button
          onClick={onAddToCart}
          disabled={stockCount <= 0}
          variant="outline"
          className="flex-1 text-xs sm:text-sm py-1.5 sm:py-2"
        >
          <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">{t('btn_add_to_cart', 'products')}</span>
          <span className="sm:hidden">{t('btn_add_mobile', 'products')}</span>
        </Button>
        <Button
          onClick={onBuyNow}
          disabled={stockCount <= 0}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm py-1.5 sm:py-2"
        >
          {t('btn_buy_now', 'products')}
        </Button>
      </div>

      <div className="space-y-2 sm:space-y-3 border-t pt-4 sm:pt-6">
        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
          <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 shrink-0" />
          <span>{t('benefit_warranty', 'products')}</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
          <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 shrink-0" />
          <span>{t('benefit_payment', 'products')}</span>
        </div>
      </div>
    </div>
  );
}
