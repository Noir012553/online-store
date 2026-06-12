import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { toast } from 'sonner';
import { Truck, CreditCard, AlertCircle } from 'lucide-react';
import { useCart } from '../lib/context/CartContext';
import { useAuth } from '../lib/context/AuthContext';
import { orderAPI } from '../lib/api';
import { useLanguage } from '@/lib/i18n';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

interface PaymentResult {
  success: boolean;
  orderId: string;
  amount: number;
  status: string;
  message: string;
  transactionId?: string;
}

export default function PaymentResultPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { clearCart } = useCart();
  const { t } = useLanguage();
  const hasCleared = useRef(false);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [orderDetails, setOrderDetails] = useState<any>(null);

  useEffect(() => {
    const processPaymentReturn = async () => {
      try {
        if (!router.isReady) return;

        // Extract parameters from URL query string
        const {
          method, // 'cod' or 'vnpay'
          orderId: queryOrderId,
          amount: queryAmount,
          status: queryStatus,
          vnp_ResponseCode,
          vnp_Amount,
          vnp_OrderInfo,
          vnp_TxnRef,
          vnp_TransactionNo,
        } = router.query;

        let orderId = '';
        let amount = 0;
        let transactionId = '';

        // ===== Parse Order ID from URL params =====
        if (method === 'cod') {
          orderId = queryOrderId as string;
          amount = queryAmount ? parseInt(queryAmount as string) : 0;
        } else {
          // VNPAY: Parse orderId from vnp_TxnRef (format: orderId-timestamp)
          const txnRef = vnp_TxnRef as string;
          orderId = txnRef?.split('-')[0];
          amount = vnp_Amount ? parseInt(vnp_Amount as string) / 100 : 0;
          transactionId = vnp_TransactionNo as string;
        }

        if (!orderId) {
          setPaymentResult({
            success: false,
            orderId: '',
            amount: 0,
            status: 'error',
            message: t('error_no_order_info'),
          });
          setIsLoading(false);
          return;
        }

        // ==================== CONDITIONAL PAYMENT CONFIRMATION ====================
        // Different flows for COD vs VNPAY:
        // - COD: No payment record needed, order is success immediately
        // - VNPAY: Must verify payment with backend before marking success
        let isSuccess = false;
        let verifiedAmount = 0;
        let verificationError: string | null = null;

        if (method === 'cod') {
          // ✅ COD FLOW: Order created = payment is pending (cash on delivery)
          // No need to call confirmPayment API
          isSuccess = true;
          verifiedAmount = amount;
        } else {
          // 💳 VNPAY FLOW: Must verify payment status with backend
          // Backend will check:
          // 1. Payment record exists for this order
          // 2. Payment amount matches order total
          // 3. Payment status is success or processing
          try {
            const confirmResponse = await (orderAPI as any).confirmPayment(orderId);

            if (confirmResponse.success) {
              isSuccess = true;
              verifiedAmount = confirmResponse.data?.totalPrice || 0;
            } else {
              isSuccess = false;
              verificationError = confirmResponse.error;
            }
          } catch (confirmError: any) {
            isSuccess = false;
            verificationError = confirmError?.message || t('error_verify_payment');
          }
        }

        const result: PaymentResult = {
          success: isSuccess,
          orderId,
          amount: verifiedAmount || amount, // Use verified amount if available
          status: isSuccess ? 'success' : 'failed',
          message: isSuccess
            ? t('payment_success_message')
            : verificationError || t('payment_failed_message'),
          transactionId,
        };

        setPaymentResult(result);

        // Fetch full order details for display
        if (orderId && user) {
          try {
            const response = await orderAPI.getOrder(orderId as string);
            const data = (response as any).order || response;
            if (data && !data.message) {
              setOrderDetails(data);
            }
          } catch (error) {
          }
        }
      } catch (error) {
        setPaymentResult({
          success: false,
          orderId: '',
          amount: 0,
          status: 'error',
          message: t('error_process_payment_result'),
        });
      } finally {
        setIsLoading(false);
      }
    };

    processPaymentReturn();
  }, [router.isReady, router.query, user]);

  // Clear cart and payment flag when payment is successful (only once)
  useEffect(() => {
    if (paymentResult?.success && !hasCleared.current) {
      clearCart();
      sessionStorage.removeItem('paymentInProgress');
      sessionStorage.removeItem('lastOrder');
      hasCleared.current = true;
    }
  }, [paymentResult?.success, clearCart]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white py-8 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mb-4"></div>
          <p className="text-gray-600">{t('processing_payment_result')}</p>
        </div>
      </div>
    );
  }

  if (!paymentResult) {
    return (
      <div className="min-h-screen bg-white py-8">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <p className="text-gray-600">{t('error_process_payment_result')}</p>
          </div>
        </div>
      </div>
    );
  }

  const { success, orderId, amount, message, transactionId } = paymentResult;

  return (
    <div className="min-h-screen bg-white py-8">
      <div className="container mx-auto px-4">
        <Breadcrumbs links={[{ label: t('payment_result_breadcrumb') }]} />

        <div className="max-w-2xl mx-auto">
          {/* Success State */}
          {success ? (
            <div className="space-y-6">
              {/* Success Icon - Different for COD vs VNPAY */}
              <div className="flex justify-center">
                {orderDetails?.paymentMethod === 'cod' || !transactionId ? (
                  // COD Icon - Truck
                  <div className="flex items-center justify-center w-24 h-24 rounded-none bg-yellow-100 animate-in fade-in zoom-in duration-500">
                    <Truck className="w-12 h-12 text-yellow-600" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-24 h-24 rounded-none bg-blue-100 animate-in fade-in zoom-in duration-500">
                    <img
                      src="/assets/vnpay.svg"
                      alt={t('payment_vnpay_logo_alt', 'payment')}
                      className="h-12 w-auto"
                    />
                  </div>
                )}
              </div>

              {/* Success Message */}
              <div className="text-center">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {orderDetails?.paymentMethod === 'cod' || !transactionId
                    ? t('order_success_title')
                    : t('payment_success_title')}
                </h1>
                <p className="text-lg text-gray-600">{message}</p>
              </div>

              {/* Order Summary Card */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 space-y-4">
                <h2 className="text-xl font-bold text-gray-900 mb-6">{t('order_summary')}</h2>

                <div className="space-y-4">
                  <div className="flex justify-between py-3 border-b border-gray-200">
                    <span className="text-gray-600">{t('order_id_label')}</span>
                    <span className="font-semibold text-gray-900">{orderId}</span>
                  </div>

                  <div className="flex justify-between py-3 border-b border-gray-200">
                    <span className="text-gray-600">{t('amount_paid_label')}</span>
                    <span className="font-semibold text-lg text-red-600">
                      {amount.toLocaleString('vi-VN')} đ
                    </span>
                  </div>

                  <div className="flex justify-between py-3 border-b border-gray-200">
                    <span className="text-gray-600">{t('payment_methods')}</span>
                    <span className="font-semibold text-gray-900">
                      {orderDetails?.paymentMethod === 'cod' || !transactionId ? t('payment_cod') : t('payment_vnpay', 'payment')}
                    </span>
                  </div>

                  {transactionId && (
                    <div className="flex justify-between py-3 border-b border-gray-200">
                      <span className="text-gray-600">{t('transaction_id_label')}</span>
                      <span className="font-mono text-sm text-gray-900">{transactionId}</span>
                    </div>
                  )}

                  <div className="flex justify-between py-3">
                    <span className="text-gray-600">{t('status_label')}</span>
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full font-semibold text-sm">
                      {orderDetails?.paymentMethod === 'cod' || !transactionId ? t('pending_payment') : t('paid_status')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tracking Code Card (if available) */}
              {orderDetails?.ghnOrderCode && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">{t('tracking_code_label')}</h2>
                  <div className="bg-white rounded-lg p-4 border-2 border-green-300 text-center">
                    <p className="text-sm text-gray-600 mb-2">{t('tracking_code_desc')}</p>
                    <p className="text-3xl font-bold text-green-600 font-mono tracking-wider">
                      {orderDetails.ghnOrderCode}
                    </p>
                  </div>
                </div>
              )}

              {/* Order Details Card (if available) */}
              {orderDetails && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">{t('order_details')}</h2>

                  <div className="space-y-4">
                    {orderDetails.shippingAddress && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">{t('shipping_address')}</p>
                        <div className="text-gray-900 space-y-1">
                          {orderDetails.shippingAddress.name && (
                            <p className="font-semibold">{orderDetails.shippingAddress.name}</p>
                          )}
                          {(orderDetails.shippingAddress.address || orderDetails.shippingAddress.wardName || orderDetails.shippingAddress.districtName || orderDetails.shippingAddress.provinceName) && (
                            <p className="text-sm">
                              {[
                                orderDetails.shippingAddress.address,
                                orderDetails.shippingAddress.wardName,
                                orderDetails.shippingAddress.districtName,
                                orderDetails.shippingAddress.provinceName
                              ].filter(Boolean).join(', ')}
                            </p>
                          )}
                          {orderDetails.shippingAddress.phone && (
                            <p className="text-sm">{orderDetails.shippingAddress.phone}</p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="pt-4 border-t border-gray-200">
                      <p className="text-sm text-gray-600 mb-3">{t('order_items_title')}</p>
                      <div className="space-y-2">
                        {orderDetails.orderItems?.map((item: any, index: number) => (
                          <div key={index} className="flex justify-between text-sm">
                            <span className="text-gray-700">
                              {item.name || ''} x {item.qty}
                            </span>
                            <span className="font-semibold text-gray-900">
                              {(item.price * item.qty).toLocaleString('vi-VN')} đ
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Info Box - Different for COD vs VNPAY */}
              {orderDetails?.paymentMethod === 'cod' || !transactionId ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex gap-3">
                    <svg
                      className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div className="text-sm text-yellow-700">
                      <p className="font-semibold mb-1">{t('cod_next_steps_title')}</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>{t('cod_next_step_1')}</li>
                        <li>{t('cod_next_step_2')}<span className="font-bold text-red-600">{amount.toLocaleString('vi-VN')} đ</span></li>
                        <li>{t('cod_next_step_3')}</li>
                        <li>{t('cod_next_step_4')}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex gap-3">
                    <svg
                      className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div className="text-sm text-blue-700">
                      <p className="font-semibold mb-1">{t('vnpay_next_steps_title')}</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>{t('vnpay_next_step_1')}</li>
                        <li>{t('vnpay_next_step_2')}</li>
                        <li>{t('vnpay_next_step_3')}</li>
                        <li>{t('vnpay_next_step_4')}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4">
                <Button
                  onClick={() => router.push(`/orders/${orderId}`)}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 h-11"
                >
                  {t('view_order_details_button')}
                </Button>
                <Button
                  onClick={() => router.push('/products')}
                  variant="outline"
                  className="flex-1 py-3 h-11"
                >
                  {t('continue_shopping_button')}
                </Button>
              </div>
            </div>
          ) : (
            /* Failed State */
            <div className="space-y-6">
              {/* Error Icon */}
              <div className="flex justify-center">
                <div className="flex items-center justify-center w-24 h-24 rounded-full bg-red-100 animate-in fade-in zoom-in duration-500">
                  <AlertCircle className="w-12 h-12 text-red-600" />
                </div>
              </div>

              {/* Error Message */}
              <div className="text-center">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('payment_failed_title')}</h1>
                <p className="text-lg text-gray-600">{message}</p>
              </div>

              {/* Error Details Card */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
                <h2 className="text-lg font-bold text-gray-900 mb-4">{t('store_info')}</h2>

                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-600">{t('order_id_label')}</span>
                    <span className="font-semibold text-gray-900">{orderId}</span>
                  </div>

                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">{t('status_label')}</span>
                    <span className="inline-block px-3 py-1 bg-red-100 text-red-700 rounded-full font-semibold text-sm">
                      {t('failed_status')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Troubleshooting Info */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <svg
                    className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="text-sm text-yellow-700">
                    <p className="font-semibold mb-1">{t('possible_causes_title')}</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>{t('cause_1')}</li>
                      <li>{t('cause_2')}</li>
                      <li>{t('cause_3')}</li>
                      <li>{t('cause_4')}</li>
                      <li>{t('cause_5')}</li>
                    </ul>
                    <p className="font-semibold mt-3 mb-1">{t('how_to_fix_title')}</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>{t('fix_1')}</li>
                      <li>{t('fix_2')}</li>
                      <li>{t('fix_3')}</li>
                      <li>{t('fix_4')}</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 flex-col sm:flex-row">
                <Button
                  onClick={() => router.push(`/orders/${orderId}`)}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 h-11"
                >
                  {t('view_order_details_button')}
                </Button>
                <Button
                  onClick={() => window.history.back()}
                  variant="outline"
                  className="flex-1 py-3 h-11"
                >
                  {t('retry_button')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
