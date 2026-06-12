import React, { useState, useRef, useEffect } from 'react';
import { useCheckout } from '../../context/CheckoutContext';
import { useCart } from '../../lib/context/CartContext';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { apiCall } from '../../lib/api';
import { formatCurrency } from '../../lib/utils';
import { useRouter } from 'next/router';
import { CreditCard, Truck, Wallet } from 'lucide-react';
import { generateIdempotencyKey, storeIdempotencyKey, getStoredIdempotencyKey, clearIdempotencyKey } from '../../lib/idempotencyKey';
import { useTranslation } from '../../lib/i18n';

export function Step3Payment() {
  const router = useRouter();
  const { formData, goBack, setFormData, appliedCoupon } = useCheckout();
  const { items, clearCart } = useCart();
  const [isLoading, setIsLoading] = useState(false);
  const { t, loadNamespace } = useTranslation();

  React.useEffect(() => {
    loadNamespace('orders');
    loadNamespace('payment');
  }, [loadNamespace]);

  // Track idempotency keys for each payment method
  const codIdempotencyKeyRef = useRef<string | null>(null);
  const vnpayIdempotencyKeyRef = useRef<string | null>(null);
  const vnpayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle VNPay redirect timeout (fix for VNPay sandbox timer error)
  useEffect(() => {
    return () => {
      if (vnpayTimeoutRef.current) {
        clearTimeout(vnpayTimeoutRef.current);
      }
    };
  }, []);

  const itemsTotal = items.reduce((sum, item) => sum + item.laptop.price * item.quantity, 0);
  const shippingFee = formData.selectedShipping?.fee || 0;
  const discountAmount = appliedCoupon?.discount || 0;
  const totalPrice = Math.max(0, itemsTotal + shippingFee - discountAmount);

  const handleSelectPaymentMethod = (method: 'cod' | 'vnpay') => {
    setFormData({ paymentMethod: method });
  };

  const createOrder = async (idempotencyKey: string) => {
    try {
      // ==================== SECURITY FIX ====================
      // Only send cartItems (productId + quantity) + couponCode
      // Backend will recalculate prices from DB, we don't send totalPrice anymore
      const orderPayload = {
        cartItems: items.map((item) => {
          const productId = item.laptop.id || item.laptop._id;
          if (!productId) {
            throw new Error(t('error_invalid_product', 'checkout'));
          }
          return {
            productId,
            quantity: item.quantity,
          };
        }),
        couponCode: appliedCoupon?.code || null,
        shippingFee,
        customerName: formData.name,
        customerEmail: formData.email,
        customerPhone: formData.phone,
        shippingAddress: formData.shippingAddress,
        shippingProvider: formData.selectedShipping?.provider,
        shippingService: formData.selectedShipping?.serviceName,
        paymentMethod: formData.paymentMethod,
        idempotencyKey,
      };

      const orderResponse = await apiCall<{ success: boolean; data?: any }>('/orders', {
        method: 'POST',
        body: JSON.stringify(orderPayload),
      });

      if (!orderResponse.success) {
        toast.error(t('error_create_order'));
        return null;
      }

      return orderResponse.data._id || orderResponse.data.data?._id;
    } catch (error) {
      throw error;
    }
  };

  const createShipment = async (orderId: string) => {
    try {
      const shipmentPayload = {
        orderId,
        shippingProvider: formData.selectedShipping?.provider,
        shippingService: formData.selectedShipping?.serviceType,
        to_name: formData.shippingAddress?.name,
        to_phone: formData.shippingAddress?.phone,
        to_address: formData.shippingAddress?.address,
        to_district_id: formData.shippingAddress?.districtId,
        to_ward_code: formData.shippingAddress?.wardCode,
        required_note: 'CHOXEMHANGKHONGTHU',
      };

      const shipmentResponse = await apiCall<{ success: boolean }>('/shipments', {
        method: 'POST',
        body: JSON.stringify(shipmentPayload),
      });

      if (!shipmentResponse.success) {
        toast.error(t('error_create_shipment'));
        throw new Error(t('shipment_creation_failed'));
      }

      return true;
    } catch (error) {
      throw error;
    }
  };

  const handleCOD = async () => {
    if (isLoading) return;

    try {
      setIsLoading(true);

      if (!codIdempotencyKeyRef.current) {
        codIdempotencyKeyRef.current = generateIdempotencyKey();
        storeIdempotencyKey(codIdempotencyKeyRef.current, 'cod_payment');
      }

      const orderId = await createOrder(codIdempotencyKeyRef.current);
      if (!orderId) {
        return;
      }

      await createShipment(orderId);

      clearIdempotencyKey('cod_payment');
      codIdempotencyKeyRef.current = null;

      sessionStorage.setItem('lastOrder', JSON.stringify({
        _id: orderId,
        totalPrice,
        itemsPrice: itemsTotal,
        orderItems: items.map((item) => ({
          name: item.laptop.name,
          qty: item.quantity,
          price: item.laptop.price,
        })),
        paymentMethod: 'cod',
      }));

      sessionStorage.setItem('paymentInProgress', 'true');
      if (router.isReady) {
        router.push(`/return?method=cod&orderId=${orderId}&amount=${totalPrice}&status=success`);
      }
    } catch (error) {
      toast.error(t('error_order_processing'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVNPAY = async () => {
    if (isLoading) return;

    try {
      setIsLoading(true);

      if (!vnpayIdempotencyKeyRef.current) {
        vnpayIdempotencyKeyRef.current = generateIdempotencyKey();
        storeIdempotencyKey(vnpayIdempotencyKeyRef.current, 'vnpay_payment');
      }

      const orderId = await createOrder(vnpayIdempotencyKeyRef.current);
      if (!orderId) {
        toast.error(t('error_order_id'));
        return;
      }

      await createShipment(orderId);

      const paymentPayload = {
        orderId,
        gateway: 'vnpay',
        amount: totalPrice,
        customerInfo: {
          email: formData.email,
          name: formData.name,
          phone: formData.phone,
        },
      };

      const paymentResponse = await apiCall<{ success: boolean; data?: any }>('/payments/initiate', {
        method: 'POST',
        body: JSON.stringify(paymentPayload),
      });

      if (!paymentResponse.success) {
        toast.error(t('error_create_payment_link'));
        return;
      }

      const redirectUrl = paymentResponse.data?.redirectUrl;

      if (!redirectUrl) {
        toast.error(t('error_vnpay_link'));
        return;
      }

      clearIdempotencyKey('vnpay_payment');
      vnpayIdempotencyKeyRef.current = null;

      sessionStorage.setItem('paymentInProgress', 'true');

      // Add 500ms delay để đảm bảo sessionStorage được save
      // Trước khi redirect (fix VNPAY sandbox timeout issue)
      const redirectTimeout = setTimeout(() => {
        window.location.href = redirectUrl;
      }, 500);

      // Timeout 30s - nếu VNPay không load (lỗi timer is not defined), fallback tới result page
      vnpayTimeoutRef.current = setTimeout(() => {
        clearTimeout(redirectTimeout);
        // Kiểm tra xem có vẫn còn trên trang này không
        if (typeof window !== 'undefined' && !window.location.href.includes('/return')) {
          toast.warning(t('vnpay_timeout_fallback'));
          router.push(`/return?method=vnpay&orderId=${orderId}&amount=${totalPrice}&status=processing`);
        }
      }, 30000);
    } catch (error) {
      toast.error(t('error_payment_init'));
    } finally {
      setIsLoading(false);
    }
  };

  const selectedMethod = formData.paymentMethod;

  return (
    <div className="space-y-6">
      {/* Price Summary */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <Wallet className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">{t('order_summary')}</h2>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-gray-700">
            <span>{t('items_total')}</span>
            <span className="font-semibold">{formatCurrency(itemsTotal)}</span>
          </div>
          <div className="flex justify-between text-gray-700">
            <span>{t('shipping_fee')}</span>
            <span className="font-semibold">{formatCurrency(shippingFee)}</span>
          </div>
          {appliedCoupon && (
            <div className="flex justify-between text-green-700">
              <span>{t('coupon_discount')}</span>
              <span className="font-semibold">-{formatCurrency(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-gray-900 pt-3 border-t">
            <span>{t('total_after_discount')}</span>
            <span className="text-red-600">{formatCurrency(totalPrice)}</span>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <CreditCard className="w-6 h-6 text-purple-600" />
          <h2 className="text-2xl font-bold text-gray-900">{t('payment_method_select')}</h2>
        </div>

        <div className="space-y-4">
          {/* COD Option */}
          <div
            onClick={() => handleSelectPaymentMethod('cod')}
            className={`border-2 rounded-lg p-6 cursor-pointer transition-all ${
              selectedMethod === 'cod'
                ? 'border-green-600 bg-green-50'
                : 'border-gray-200 hover:border-green-300'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-green-600" />
                  <h3 className="font-bold text-gray-900">{t('payment_method_cod', 'orders')}</h3>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {t('payment_method_cod_desc', 'orders')}
                </p>
              </div>
            </div>
          </div>

          {/* VNPAY Option */}
          <div
            onClick={() => handleSelectPaymentMethod('vnpay')}
            className={`border-2 rounded-lg p-6 cursor-pointer transition-all ${
              selectedMethod === 'vnpay'
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <img src="/assets/vnpay.svg" alt={t('vnpay_logo', 'checkout')} className="h-6 w-auto" />
                  <h3 className="font-bold text-gray-900">{t('payment_method_vnpay', 'orders')}</h3>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {t('payment_method_vnpay_desc', 'orders')}
                </p>
              </div>
            </div>
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
            {t('back', 'orders')}
          </Button>
          <Button
            onClick={() => {
              if (!selectedMethod) {
                toast.error(t('select_payment_method_error', 'checkout') || t('select_payment_method_error', 'orders'));
                return;
              }

              if (selectedMethod === 'cod') {
                handleCOD();
              } else {
                handleVNPAY();
              }
            }}
            disabled={isLoading || !selectedMethod}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 h-11 disabled:opacity-50"
          >
            {isLoading ? t('processing', 'orders') : selectedMethod === 'vnpay' ? t('vnpay_button', 'checkout') : t('confirm_order_button', 'checkout')}
          </Button>
        </div>
      </div>
    </div>
  );
}
