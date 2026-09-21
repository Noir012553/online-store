import { Star, ShoppingCart, Minus, Plus, Shield, CreditCard } from 'lucide-react';
import { useLanguage } from '../../lib/i18n';
import { Laptop } from '../../lib/data';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { interpolateTranslation } from '../../lib/translationInterpolate';
import { formatNumber } from '../../lib/utils';
import { SpecsTable } from '../SpecsTable';

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
  const { t, locale } = useLanguage();
  const hasSpecs = Object.keys(product.specs || {}).length > 0;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.45)] sm:p-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
        {product.name || ''}
      </h1>
      <div className="mb-5 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-amber-600 sm:gap-2">
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
          <span className="text-sm font-semibold sm:text-base">{formatNumber(product.rating || 0, locale)}</span>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 sm:text-sm">
          {interpolateTranslation(t('reviews_count', 'product-ui'), { count: reviewCount })}
        </span>
        <Badge variant={stockCount > 0 ? 'default' : 'destructive'} className="rounded-full px-3 py-1 text-xs shadow-sm sm:text-sm">
          {stockCount > 0
            ? interpolateTranslation(t('stock_in_stock', 'products'), { count: stockCount })
            : t('stock_out_of_stock', 'products')}
        </Badge>
      </div>

      <div className="mb-5 flex flex-col gap-1 rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 via-white to-amber-50 p-4 sm:mb-6">
        {canDisplayPrice && (
          <>
            {product.originalPrice != null && product.originalPrice > product.price && product.formattedOriginalPrice && (
              <span className="text-base font-semibold text-slate-400 line-through sm:text-lg">
                {product.formattedOriginalPrice}
              </span>
            )}
            <span className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              {product.formattedPrice}
            </span>
          </>
        )}
      </div>

      {hasSpecs && (
        <div className="mb-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 shadow-sm sm:mb-6 sm:p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 sm:text-base">
            <span className="h-2 w-2 rounded-full bg-red-600 shadow-sm shadow-red-600/40" aria-hidden="true" />
            {t('tab_specs', 'products')}
          </h3>
          <SpecsTable specs={product.specs} specLabels={product.specLabels} />
        </div>
      )}

      <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm sm:mb-6 sm:gap-4 sm:text-base">
        <span className="font-semibold text-slate-700">{t('label_quantity', 'products')}:</span>
        <div className="flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            className="rounded-l-lg p-1.5 transition-colors hover:bg-red-50 hover:text-red-600 sm:p-2"
            aria-label={t('quantity_decrease', 'products')}
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
            className="w-12 border-x border-slate-200 bg-transparent text-center text-sm font-semibold text-slate-900 outline-none sm:w-16"
          />
          <button
            type="button"
            onClick={() => onQuantityChange(quantity + 1)}
            className="rounded-r-lg p-1.5 transition-colors hover:bg-red-50 hover:text-red-600 sm:p-2"
            aria-label={t('quantity_increase', 'products')}
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:gap-4">
        <Button
          onClick={onAddToCart}
          disabled={stockCount <= 0}
          variant="outline"
          className="h-11 flex-1 rounded-xl border-slate-300 text-xs font-semibold shadow-sm transition-transform hover:-translate-y-0.5 sm:text-sm"
        >
          <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">{t('btn_add_to_cart', 'products')}</span>
          <span className="sm:hidden">{t('btn_add_mobile', 'products')}</span>
        </Button>
        <Button
          onClick={onBuyNow}
          disabled={stockCount <= 0}
          className="h-11 flex-1 rounded-xl bg-red-600 text-xs font-semibold text-white shadow-lg shadow-red-600/20 transition-transform hover:-translate-y-0.5 hover:bg-red-700 sm:text-sm"
        >
          {t('btn_buy_now', 'products')}
        </Button>
      </div>

      <div className="mt-1 grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 sm:pt-6">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-700 sm:gap-3 sm:text-sm">
          <Shield className="h-8 w-8 shrink-0 rounded-full bg-red-100 p-2 text-red-600" />
          <span>{t('benefit_warranty', 'products')}</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-700 sm:gap-3 sm:text-sm">
          <CreditCard className="h-8 w-8 shrink-0 rounded-full bg-red-100 p-2 text-red-600" />
          <span>{t('benefit_payment', 'products')}</span>
        </div>
      </div>
    </div>
  );
}
