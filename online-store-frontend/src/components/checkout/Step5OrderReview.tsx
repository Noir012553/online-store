import { useState } from 'react';
import { useRouter } from 'next/router';
import { useCheckout } from '../../context/CheckoutContext';
import { useCart } from '../../lib/context/CartContext';
import { useAuth } from '../../lib/context/AuthContext';
import { useTranslation, useLanguage } from '../../lib/i18n';
import { useCurrencyContext } from '../../lib/context/CurrencyContext';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { orderAPI } from '../../lib/api';
import { useCurrencyConversion } from '../../hooks/useCurrencyConversion';

export function Step5OrderReview() {
  const router = useRouter();
  const { formData, goBack } = useCheckout();
  const { items, clearCart } = useCart();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { locale } = useLanguage();
  const { currencyCode } = useCurrencyContext();
  const { convertCurrency, formatConvertedPrice, targetCurrency } = useCurrencyConversion();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const itemsTotal = items.reduce<number | null>((sum, item) => {
    if (sum === null) return null;

    const convertedPrice = convertCurrency(item.unitPrice * item.quantity, item.currencyCode, targetCurrency);
    return convertedPrice === null ? null : sum + convertedPrice;
  }, 0);
  const shippingFee = formData.selectedShipping!.fee;
  const shippingCurrencyCode = formData.selectedShipping!.currencyCode;
  const convertedShippingFee = convertCurrency(shippingFee, shippingCurrencyCode, targetCurrency);
  const finalTotal = itemsTotal === null || convertedShippingFee === null
    ? null
    : itemsTotal + convertedShippingFee;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error(t('please_login', 'auth'));
      router.push(`/login?from=${encodeURIComponent(router.asPath)}`);
      return;
    }

    if (finalTotal === null || itemsTotal === null || convertedShippingFee === null) return;

    setIsSubmitting(true);
    try {
      // Create order via backend API
      const orderData = {
        orderItems: items.map((item) => {
          // Ensure product ID is properly extracted (_id from backend or id from cart)
          const productId = item.laptop.id || item.laptop._id;
          if (!productId) {
            throw new Error(`Invalid product in cart: ${item.laptop.name || t('payment_method_unknown', 'checkout')}`);
          }
          return {
            product: productId,
            name: item.laptop.name || '',
            qty: item.quantity,
            image: item.laptop.image,
            price: item.unitPrice, // PHASE 3: Use snapshot price from cart
          };
        }),
        itemsPrice: itemsTotal,
        taxPrice: 0,
        shippingFee: convertedShippingFee,
        totalPrice: finalTotal,
        customerName: formData.name,
        customerEmail: user?.email || formData.email || '',
        customerPhone: formData.phone,
        // Add shipping address (match Order model schema)
        shippingAddress: {
          name: formData.shippingAddress?.name,
          phone: formData.shippingAddress?.phone,
          address: formData.shippingAddress?.address,
          wardCode: formData.shippingAddress?.wardCode,
          wardName: formData.shippingAddress?.wardName,
          districtId: formData.shippingAddress?.districtId,
          districtName: formData.shippingAddress?.districtName,
          provinceId: formData.shippingAddress?.provinceId,
          provinceName: formData.shippingAddress?.provinceName,
        },
        // Add payment method
        paymentMethod: formData.paymentMethod || 'cod',
        // Add shipping provider and service
        shippingProvider: formData.selectedShipping?.provider,
        shippingService: formData.selectedShipping?.serviceName,
        // PHASE 3: Add currency code for historical tracking
        currencyCode,
      };

      const orderResponse = await orderAPI.createOrder(orderData);
      const order = orderResponse.order || orderResponse;
      const orderId = order._id || order.id;

      if (!orderId) {
        throw new Error(t('error_order_id', 'checkout'));
      }

      toast.success(t('order_success', 'checkout'));
      clearCart();
      router.push(`/my-orders?newOrder=${orderId}`);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getErrorMessage = (error: any): string => {
    if (error instanceof Error) {
      if (error.message.includes('Email already in use')) {
        return t('email_in_use', 'checkout');
      } else if (error.message.includes('Insufficient stock')) {
        return t('insufficient_stock', 'checkout');
      } else if (error.message.includes('No order items')) {
        return t('cart_empty', 'checkout');
      }
      return t('create_order', 'checkout');
    }

    return t('create_order', 'checkout');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t('order_confirm', 'checkout')}</h2>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Products */}
            <div>
              <h3 className="font-bold text-lg text-gray-900 mb-4">{t('product_list', 'checkout')}</h3>
              <div className="space-y-3 bg-white rounded-lg p-4 max-h-64 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.laptop.id} className="flex gap-4 pb-3 border-b last:border-b-0 last:pb-0">
                    <img
                      src={item.laptop.image}
                      alt={item.laptop.name}
                      className="w-16 h-16 object-cover rounded-lg shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 line-clamp-2">{item.laptop.name}</p>
                      <p className="text-sm text-gray-600 mt-1">{t('quantity', 'checkout')}: {item.quantity}</p>
                      <p className="text-red-600 font-bold mt-1">
                        {formatConvertedPrice(item.unitPrice * item.quantity, item.currencyCode)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between">
              <Button
                type="button"
                onClick={goBack}
                className="bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold px-8 py-3 h-11"
              >
                {t('back_button', 'checkout')}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 h-11 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('processing', 'checkout')}
                  </span>
                ) : (
                  t('place_order', 'checkout')
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Order Summary Sidebar */}
      <div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 sticky top-24">
          <h3 className="text-xl font-bold text-gray-900 mb-4">{t('order_summary', 'checkout')}</h3>

          <div className="space-y-3 mb-6 pb-6 border-b border-gray-200">
            <div className="flex justify-between items-center text-gray-700">
              <span>{t('subtotal_label', 'checkout')}</span>
              <span className="font-medium">{itemsTotal !== null && formatConvertedPrice(itemsTotal, targetCurrency, targetCurrency)}</span>
            </div>
          </div>

          <div className="flex justify-between items-center mb-4">
            <span className="font-bold text-gray-900">{t('total', 'checkout')}</span>
            <span className="text-2xl font-bold text-red-600">{finalTotal !== null && formatConvertedPrice(finalTotal, targetCurrency, targetCurrency)}</span>
          </div>

          <div className="text-xs text-gray-500 text-center">
            {t('order_protection', 'checkout')}
          </div>
        </div>
      </div>
    </div>
  );
}
