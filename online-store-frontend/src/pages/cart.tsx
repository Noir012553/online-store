import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Trash2, Minus, Plus, ShoppingBag, ArrowRight, CheckCircle } from "lucide-react";
import { useCart } from "../lib/context/CartContext";
import { useTranslation } from "../lib/i18n";
import { useLanguage } from "../lib/i18n";
import { useProductTranslation } from "../hooks/useProductTranslation";
import { getTranslatedValue } from "../lib/data";
import { DEFAULT_LOCALE } from "../lib/i18n/types";
import { Button } from "../components/ui/button";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { EmptyState } from "../components/EmptyState";
import { Badge } from "../components/ui/badge";
import { useCurrencyConversion } from "../hooks/useCurrencyConversion";

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

function CartItemName({ itemLaptop }: { itemLaptop: any }) {
  const { locale } = useLanguage();
  const { translation } = useProductTranslation(itemLaptop.id || itemLaptop._id);

  const displayName = translation?.name || getTranslatedValue(
    typeof itemLaptop.name === 'object' ? itemLaptop.name : { [DEFAULT_LOCALE]: itemLaptop.name },
    locale
  ) || '';

  return <>{displayName}</>;
}

export default function Cart() {
  const { items, removeFromCart, updateQuantity } = useCart();
  const { t, loadNamespace } = useTranslation();
  const { locale } = useLanguage();
  const { convertCurrency, formatConvertedPrice, targetCurrency } = useCurrencyConversion();
  const router = useRouter();
  const throttleTimers = useRef(new Map<string, NodeJS.Timeout>());

  useEffect(() => {
    loadNamespace('products');
    loadNamespace('checkout');
    loadNamespace('payment');
  }, [loadNamespace]);

  // Cleanup throttle timers on unmount
  useEffect(() => {
    return () => {
      throttleTimers.current.forEach((timer) => clearTimeout(timer));
      throttleTimers.current.clear();
    };
  }, []);

  const handleUpdateQuantity = (laptopId: string, newQuantity: number) => {
    // Prevent rapid updates (throttle to 300ms)
    if (throttleTimers.current.has(laptopId)) {
      return;
    }

    updateQuantity(laptopId, newQuantity);

    // Set throttle timer for this product
    const timer = setTimeout(() => {
      throttleTimers.current.delete(laptopId);
    }, 300);

    throttleTimers.current.set(laptopId, timer);
  };

  const itemsTotal = items.reduce<number | null>((sum, item) => {
    if (sum === null) return null;

    const convertedPrice = convertCurrency(item.unitPrice * item.quantity, item.currencyCode, targetCurrency);
    return convertedPrice === null ? null : sum + convertedPrice;
  }, 0);
  const finalTotal = itemsTotal;

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Breadcrumbs links={[{ label: t('shopping_cart', 'cart') }]} />
        <EmptyState
          icon={ShoppingBag}
          title={t('your_cart_is_empty', 'cart')}
          description={t('add_some_items', 'cart')}
          actionLabel={t('cart_continue_shopping', 'cart')}
          onAction={() => router.push("/products")}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 animate-in fade-in duration-300">
      <Breadcrumbs links={[{ label: t('shopping_cart', 'cart') }]} />
      <div className="flex items-center justify-between mb-8">
        <h1>{t('your_shopping_cart', 'cart')}</h1>
        <Badge className="bg-red-600 text-white">{items.length} {t('items_count', 'cart')}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border overflow-hidden shadow-sm">
            <div className="bg-white px-4 py-2 border-b hidden md:block">
              <div className="grid grid-cols-12 gap-1">
                <div className="col-span-6 text-left text-xs">{t('product_header', 'cart')}</div>
                <div className="col-span-2 text-left text-xs">{t('unit_price_header', 'cart')}</div>
                <div className="col-span-2 text-left text-xs">{t('quantity_header', 'cart')}</div>
                <div className="col-span-1 text-left text-xs">{t('subtotal_header', 'cart')}</div>
                <div className="col-span-1 text-right text-xs">{t('remove_header', 'cart')}</div>
              </div>
            </div>

            <div className="divide-y">
              {items.map((item) => (
                <div key={item.laptop.id} className="p-3 md:p-4 hover:bg-white transition-colors animate-in slide-in-from-right duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <div className="md:col-span-6 flex gap-3 items-center">
                      <Link href={`/product/${item.laptop.id}`}>
                        <ImageWithFallback
                          src={item.laptop.image}
                          alt={typeof item.laptop.name === 'object' && item.laptop.name !== null && DEFAULT_LOCALE in item.laptop.name ? (item.laptop.name as any)[DEFAULT_LOCALE] || '' : (item.laptop.name as any) || ''}
                          loading="lazy"
                          className="w-28 h-28 object-cover rounded border hover:shadow-md transition-shadow"
                        />
                      </Link>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <Link
                          href={`/product/${item.laptop.id}`}
                          className="hover:text-red-600 transition-colors"
                        >
                          <h3 className="line-clamp-2 text-sm"><CartItemName itemLaptop={item.laptop} /></h3>
                        </Link>
                        <p className="text-xs text-gray-600 mt-0.5 truncate hidden md:block">
                          {item.laptop.specs.cpu}
                        </p>
                        <div className="md:hidden mt-1">
                          <p className="text-red-600 text-xs">
                            {formatConvertedPrice(item.unitPrice, item.currencyCode)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="hidden md:block md:col-span-2 text-left text-xs">
                      <span className="text-gray-900">{formatConvertedPrice(item.unitPrice, item.currencyCode)}</span>
                    </div>

                    <div className="md:col-span-2 flex items-center justify-between md:justify-start gap-1">
                      <span className="md:hidden text-gray-600 text-xs">{t('label_quantity', 'cart')}:</span>
                      <div className="flex items-center gap-0.5 bg-white rounded-md p-0.5">
                        <button
                          onClick={() => handleUpdateQuantity(item.laptop.id, item.quantity - 1)}
                          className="p-0.5 hover:bg-white rounded transition-all disabled:opacity-50"
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>
                        <span className="w-6 text-left text-xs">{item.quantity}</span>
                        <button
                          onClick={() => handleUpdateQuantity(item.laptop.id, item.quantity + 1)}
                          className="p-0.5 hover:bg-white rounded transition-all"
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>

                    <div className="md:col-span-1 flex items-center justify-start">
                      <div className="text-left">
                        <p className="md:hidden text-xs text-gray-600">{t('label_subtotal', 'cart')}:</p>
                        <span className="text-red-600 text-xs">
                          {formatConvertedPrice(item.unitPrice * item.quantity, item.currencyCode)}
                        </span>
                      </div>
                    </div>

                    <div className="md:col-span-1 flex items-center justify-end">
                      <button
                        onClick={() => removeFromCart(item.laptop.id)}
                        className="text-gray-400 hover:text-red-600"
                        title={t('label_remove_item', 'cart')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-between">
            <Link href="/products">
              <Button variant="outline">
                {t('cart_continue_shopping', 'cart')}
              </Button>
            </Link>
          </div>
        </div>

        <div>
          <div className="bg-white rounded-lg border p-6 sticky top-24">
            <h3 className="mb-4">{t('order_summary', 'cart')}</h3>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between">
                <span>{t('subtotal_label', 'cart')}</span>
                <span>{itemsTotal !== null && formatConvertedPrice(itemsTotal, targetCurrency, targetCurrency)}</span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span>{t('total', 'cart')}</span>
                <span className="text-red-600">{finalTotal !== null && formatConvertedPrice(finalTotal, targetCurrency, targetCurrency)}</span>
              </div>
            </div>

            <Button
              onClick={() => router.push("/checkout")}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              {t('confirm_order_button', 'cart')}
            </Button>

            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <p className="text-gray-600">{t('vnpay_next_step_1', 'cart')}</p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <p className="text-gray-600">{t('vnpay_next_step_2', 'cart')}</p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <p className="text-gray-600">{t('vnpay_next_step_3', 'cart')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
