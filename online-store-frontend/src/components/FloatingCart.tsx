import { ShoppingCart, X } from "lucide-react";
import { useRouter } from "next/router";
import { useCart } from "../lib/context/CartContext";
import { useTranslation } from "../lib/i18n";
import { Badge } from "./ui/badge";
import { formatCurrency } from "../lib/utils";
import { useState, useCallback } from "react";

export function FloatingCart() {
  const router = useRouter();
  const { totalItems, totalPrice } = useCart();
  const { t } = useTranslation();
  const [isMinimized, setIsMinimized] = useState(false);

  const handleCartClick = useCallback(() => {
    if (router.isReady) {
      router.push("/cart");
    }
  }, [router]);

  if (isMinimized) {
    return (
      <div
        style={{
          position: "fixed",
          right: "32px",
          bottom: "32px",
          zIndex: 40,
        }}
      >
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-red-600 hover:bg-red-700 text-white w-12 h-12 rounded-full shadow-lg transition-all duration-300 hover:scale-105 flex items-center justify-center"
          title={t('floating_cart_open', 'components')}
        >
          <ShoppingCart className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: "32px",
        bottom: "32px",
        zIndex: 40,
      }}
      className="select-none"
    >
      <div className="relative inline-block">
        <button
          onClick={handleCartClick}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-full shadow-lg transition-all duration-300 hover:scale-105 flex items-center gap-3 group"
          title={t('floating_cart_view', 'components')}
        >
          <div className="relative">
            <ShoppingCart className="w-5 h-5" />
            {totalItems > 0 && (
              <Badge className="absolute -top-2 -right-2 bg-white text-red-600 min-w-5 h-5 flex items-center justify-center">
                {totalItems}
              </Badge>
            )}
          </div>
          <div className="hidden sm:block">
            <p className="text-xs opacity-90">{t('floating_cart_label', 'components')}</p>
            <p className="font-semibold">{formatCurrency(totalPrice)}</p>
          </div>
        </button>
        <button
          onClick={() => setIsMinimized(true)}
          className="absolute -top-2 -right-2 bg-white text-red-600 rounded-full w-6 h-6 flex items-center justify-center shadow-md hover:bg-red-50 transition-colors"
          title={t('floating_cart_hide', 'components')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
