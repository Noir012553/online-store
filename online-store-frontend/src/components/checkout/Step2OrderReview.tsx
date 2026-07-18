import { useState } from 'react';
import { useCheckout } from '../../context/CheckoutContext';
import { useCart } from '../../lib/context/CartContext';
import { useTranslation } from '../../lib/i18n';
import { useLanguage } from '../../lib/i18n';
import { DEFAULT_LOCALE } from '../../lib/i18n/types';
import { useProductTranslation } from '../../hooks/useProductTranslation';
import { getTranslatedValue } from '../../lib/data';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { couponAPI } from '../../lib/api';
import { User, MapPin, Truck, ShoppingCart, Clock, Phone, Mail, TicketPercent, CheckCircle2, Trash2 } from 'lucide-react';
import { useCurrencyConversion } from '@/hooks/useCurrencyConversion';

function OrderItemName({ itemLaptop }: { itemLaptop: any }) {
  const { locale } = useLanguage();
  const { translation } = useProductTranslation(itemLaptop.id || itemLaptop._id);

  const displayName = translation?.name || getTranslatedValue(
    typeof itemLaptop.name === 'object' ? itemLaptop.name : { [DEFAULT_LOCALE]: itemLaptop.name },
    locale
  ) || '';

  return <>{displayName}</>;
}

export function Step2OrderReview() {
  const { t, loadNamespace } = useTranslation();
  const { locale } = useLanguage();
  const { convertCurrency, formatConvertedPrice, targetCurrency } = useCurrencyConversion();
  const {
    formData,
    goBack,
    goNext,
    couponCode,
    appliedCoupon,
    isCouponApplying,
    couponError,
    setCouponCode,
    setAppliedCoupon,
    setIsCouponApplying,
    setCouponError,
    clearCoupon,
  } = useCheckout();
  const { items } = useCart();
  const isLoading = false;

  const getPaymentMethodLabel = (method: string | undefined) => {
    switch (method) {
      case 'cod':
        return t('payment_method_cod', 'orders');
      case 'vnpay':
        return t('payment_method_vnpay', 'orders');
      case 'card':
        return t('payment_method_card', 'orders');
      default:
        return t('payment_method_unknown', 'orders');
    }
  };

  const itemsTotal = items.reduce<number | null>((sum, item) => {
    if (sum === null) return null;

    const convertedPrice = convertCurrency(item.unitPrice * item.quantity, item.currencyCode, targetCurrency);
    return convertedPrice === null ? null : sum + convertedPrice;
  }, 0);
  const shippingFee = formData.selectedShipping?.fee || 0;
  const shippingCurrencyCode = formData.selectedShipping!.currencyCode;
  const convertedShippingFee = convertCurrency(shippingFee, shippingCurrencyCode, targetCurrency);
  const discountAmount = appliedCoupon?.discount || 0;
  const totalPrice = itemsTotal === null || convertedShippingFee === null
    ? null
    : Math.max(0, itemsTotal + convertedShippingFee - discountAmount);
  const productIds = items.map((item) => item.laptop.id || item.laptop._id).filter(Boolean) as string[];

  const handleApplyCoupon = async () => {
    const code = couponCode.trim();

    if (!code) {
      setCouponError(t('coupon_empty_error'));
      return;
    }

    if (itemsTotal === null) return;

    try {
      setIsCouponApplying(true);
      setCouponError(null);
      const response = await couponAPI.calculateDiscount(code, itemsTotal, targetCurrency, productIds);
      setAppliedCoupon(response);
      setCouponCode(response.coupon || code.toUpperCase());
      toast.success(t('coupon_apply_success'));
    } catch (error: any) {
      setAppliedCoupon(null);
      const message = error?.message || t('coupon_apply_error_fallback');
      setCouponError(message);
      toast.error(message);
    } finally {
      setIsCouponApplying(false);
    }
  };

  const handleRemoveCoupon = () => {
    clearCoupon();
    toast.success(t('coupon_remove_success'));
  };

  const handleNext = () => {
    goNext();
  };

  return (
    <div className="space-y-6">
      {/* Customer Info Section */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">{t('review_customer_info_title')}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-gray-400 mt-1 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-gray-600 font-medium">{t('review_full_name_label')}</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">{formData.name}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-gray-400 mt-1 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-gray-600 font-medium">{t('review_phone_label')}</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">{formData.phone}</p>
            </div>
          </div>
          <div className="md:col-span-2 flex items-start gap-3">
            <Mail className="w-5 h-5 text-gray-400 mt-1 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-gray-600 font-medium">{t('review_email_label')}</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">{formData.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Shipping Address Section */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <MapPin className="w-6 h-6 text-green-600" />
          <h2 className="text-2xl font-bold text-gray-900">{t('review_shipping_address_title')}</h2>
        </div>

        <div className="space-y-3">
          {formData.shippingAddress?.name && (
            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
              <p className="text-lg font-semibold text-gray-900">{formData.shippingAddress.name}</p>
            </div>
          )}
          {(formData.shippingAddress?.address || formData.shippingAddress?.wardName || formData.shippingAddress?.districtName || formData.shippingAddress?.provinceName) && (
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-gray-700">
                  {[formData.shippingAddress?.address, formData.shippingAddress?.wardName, formData.shippingAddress?.districtName, formData.shippingAddress?.provinceName]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
            </div>
          )}
          {formData.shippingAddress?.phone && (
            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
              <p className="text-gray-700">{formData.shippingAddress.phone}</p>
            </div>
          )}
        </div>
      </div>

      {/* Shipping Option Section */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <Truck className="w-6 h-6 text-purple-600" />
          <h2 className="text-2xl font-bold text-gray-900">{t('review_shipping_service_title')}</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-white rounded-lg">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-gray-600" />
              <p className="text-gray-700 font-medium">{t('review_carrier_label')}</p>
            </div>
            <p className="font-semibold text-gray-900">
              {formData.selectedShipping?.providerName || formData.selectedShipping?.provider || ''}
            </p>
          </div>
          <div className="flex items-center justify-between p-3 bg-white rounded-lg">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-gray-600" />
              <p className="text-gray-700 font-medium">{t('review_service_label')}</p>
            </div>
            <p className="font-semibold text-gray-900">
              {formData.selectedShipping?.serviceName || formData.selectedShipping?.serviceType || ''}
            </p>
          </div>
          <div className="flex items-center justify-between p-3 bg-white rounded-lg">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-600" />
              <p className="text-gray-700 font-medium">{t('review_estimated_delivery_label')}</p>
            </div>
            <p className="font-semibold text-gray-900">
              {t('estimated_delivery').replace('{{days}}', formData.selectedShipping?.estimatedDays || '0')}
            </p>
          </div>
          <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-gray-700 font-medium">{t('review_shipping_fee_label')}</p>
            <p className="text-lg font-bold text-red-600">
              {formatConvertedPrice(shippingFee, shippingCurrencyCode)}
            </p>
          </div>
        </div>
      </div>

      {/* Coupon Section */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <TicketPercent className="w-6 h-6 text-red-600" />
          <h2 className="text-2xl font-bold text-gray-900">{t('coupon_title')}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
          <div>
            <Label htmlFor="coupon-code" className="text-base font-medium mb-2 block">
              {t('coupon_enter_code')}
            </Label>
            <Input
              id="coupon-code"
              value={couponCode}
              onChange={(e) => {
                setCouponCode(e.target.value.toUpperCase());
                setCouponError(null);
                setAppliedCoupon(null);
              }}
              placeholder={t('coupon_placeholder')}
              className="h-11 uppercase"
            />
          </div>

          <Button
            type="button"
            onClick={handleApplyCoupon}
            disabled={isCouponApplying}
            className="h-11 px-6 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
          >
            {isCouponApplying ? t('coupon_applying') : t('coupon_apply_button')}
          </Button>
        </div>

        {couponError && <p className="mt-3 text-sm text-red-600">{couponError}</p>}

        {appliedCoupon && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-semibold text-green-800">
                    {t('coupon_applied_prefix')}{appliedCoupon.code}
                  </p>
                  <p className="text-sm text-green-700">
                    {t('coupon_savings_prefix')}{formatConvertedPrice(appliedCoupon.discount, targetCurrency, targetCurrency)}
                  </p>
                </div>
              </div>

              <Button type="button" variant="outline" onClick={handleRemoveCoupon} className="gap-2">
                <Trash2 className="w-4 h-4" />
                {t('coupon_remove_button')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Order Items Section */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <ShoppingCart className="w-6 h-6 text-orange-600" />
          <h2 className="text-2xl font-bold text-gray-900">{t('review_order_details_title')}</h2>
        </div>

        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.laptop.id} className="flex items-center justify-between py-3 border-b border-gray-200">
              <div className="flex items-center space-x-4">
                {item.laptop.image && (
                  <img
                    src={item.laptop.image}
                    alt={typeof item.laptop.name === 'object' && item.laptop.name !== null && DEFAULT_LOCALE in item.laptop.name ? (item.laptop.name as any)[DEFAULT_LOCALE] || '' : (item.laptop.name as any) || ''}
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                )}
                <div>
                  <p className="font-semibold text-gray-900"><OrderItemName itemLaptop={item.laptop} /></p>
                  <p className="text-sm text-gray-600">{t('review_quantity_prefix')}{item.quantity}</p>
                </div>
              </div>
              <p className="font-semibold text-gray-900">
                {formatConvertedPrice(item.unitPrice * item.quantity, item.currencyCode)}
              </p>
            </div>
          ))}
        </div>

        {/* Price Summary */}
        <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
          <div className="flex justify-between text-gray-700">
            <span>{t('items_total', 'checkout')}</span>
            <span className="font-semibold">{itemsTotal !== null && formatConvertedPrice(itemsTotal, targetCurrency, targetCurrency)}</span>
          </div>
          <div className="flex justify-between text-gray-700">
            <span>{t('shipping_fee', 'checkout')}</span>
            <span className="font-semibold">{convertedShippingFee !== null && formatConvertedPrice(convertedShippingFee, targetCurrency, targetCurrency)}</span>
          </div>
          {appliedCoupon && (
            <div className="flex justify-between text-green-700">
              <span>{t('coupon_discount', 'checkout')}</span>
              <span className="font-semibold">-{formatConvertedPrice(discountAmount, targetCurrency, targetCurrency)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-gray-900 pt-3 border-t">
            <span>{t('total_after_discount', 'checkout')}</span>
            <span className="text-red-600">{totalPrice !== null && formatConvertedPrice(totalPrice, targetCurrency, targetCurrency)}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex justify-between gap-4">
          <Button
            type="button"
            onClick={goBack}
            variant="outline"
            className="flex-1 px-8 py-3 h-11"
          >
            {t('back_button')}
          </Button>
          <Button
            onClick={handleNext}
            disabled={isLoading || totalPrice === null}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 h-11 disabled:opacity-50"
          >
            {isLoading ? t('checkout_processing') : t('checkout_continue_payment')}
          </Button>
        </div>
      </div>
    </div>
  );
}
