import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Button } from '../components/ui/button';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { toast } from 'sonner';
import { Truck, CreditCard, AlertCircle } from 'lucide-react';

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
        let isSuccess = false;
        let transactionId = '';

        // ===== Handle COD Method =====
        if (method === 'cod') {
          orderId = queryOrderId as string;
          amount = queryAmount ? parseInt(queryAmount as string) : 0;
          isSuccess = queryStatus === 'success';
          transactionId = '';

          if (!orderId) {
            setPaymentResult({
              success: false,
              orderId: '',
              amount: 0,
              status: 'error',
              message: 'Không tìm thấy thông tin đơn hàng',
            });
            setIsLoading(false);
            return;
          }
        }
        // ===== Handle VNPAY Method =====
        else {
          // Parse orderId from vnp_TxnRef (format: orderId-timestamp)
          const txnRef = vnp_TxnRef as string;
          orderId = txnRef?.split('-')[0];

          if (!orderId) {
            setPaymentResult({
              success: false,
              orderId: '',
              amount: 0,
              status: 'error',
              message: 'Không tìm thấy thông tin đơn hàng',
            });
            setIsLoading(false);
            return;
          }

          // Check payment response code
          const responseCode = vnp_ResponseCode as string;
          isSuccess = responseCode === '00';

          // Convert amount (VNPAY sends amount x 100)
          amount = vnp_Amount ? parseInt(vnp_Amount as string) / 100 : 0;
          transactionId = vnp_TransactionNo as string;
        }

        const result: PaymentResult = {
          success: isSuccess,
          orderId,
          amount,
          status: isSuccess ? 'success' : 'failed',
          message: isSuccess
            ? 'Thanh toán thành công! Đơn hàng đã được xác nhận.'
            : 'Thanh toán không thành công. Vui lòng thử lại.',
          transactionId,
        };

        setPaymentResult(result);

        // Fetch order details to verify payment status
        if (isSuccess && orderId) {
          try {
            const response = await fetch(`/api/orders/${orderId}`);
            if (response.ok) {
              const data = await response.json();
              // Backend returns order directly (not wrapped in success/data)
              if (data && !data.message) {
                setOrderDetails(data);
              }
            }
          } catch (error) {
            // Error fetching order details
          }
        }
      } catch (error) {
        // Error processing payment return
        setPaymentResult({
          success: false,
          orderId: '',
          amount: 0,
          status: 'error',
          message: 'Có lỗi xảy ra khi xử lý kết quả thanh toán',
        });
      } finally {
        setIsLoading(false);
      }
    };

    processPaymentReturn();
  }, [router.isReady, router.query]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-8 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mb-4"></div>
          <p className="text-gray-600">Đang xử lý kết quả thanh toán...</p>
        </div>
      </div>
    );
  }

  if (!paymentResult) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-8">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <p className="text-gray-600">Không thể xử lý kết quả thanh toán</p>
          </div>
        </div>
      </div>
    );
  }

  const { success, orderId, amount, message, transactionId } = paymentResult;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-8">
      <div className="container mx-auto px-4">
        <Breadcrumbs links={[{ label: 'Kết quả thanh toán' }]} />

        <div className="max-w-2xl mx-auto">
          {/* Success State */}
          {success ? (
            <div className="space-y-6">
              {/* Success Icon - Different for COD vs VNPAY */}
              <div className="flex justify-center">
                {orderDetails?.paymentMethod === 'cod' || !transactionId ? (
                  // COD Icon - Truck
                  <div className="flex items-center justify-center w-24 h-24 rounded-full bg-yellow-100 animate-in fade-in zoom-in duration-500">
                    <Truck className="w-12 h-12 text-yellow-600" />
                  </div>
                ) : (
                  // VNPAY Icon
                  <div className="flex items-center justify-center w-24 h-24 rounded-full bg-blue-100 animate-in fade-in zoom-in duration-500">
                    <img
                      src="/assets/vnpay.svg"
                      alt="VNPAY"
                      className="h-12 w-auto"
                    />
                  </div>
                )}
              </div>

              {/* Success Message */}
              <div className="text-center">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {orderDetails?.paymentMethod === 'cod' || !transactionId
                    ? '✓ Đặt hàng thành công!'
                    : '✓ Thanh toán thành công!'}
                </h1>
                <p className="text-lg text-gray-600">{message}</p>
              </div>

              {/* Order Summary Card */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 space-y-4">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Thông tin đơn hàng</h2>

                <div className="space-y-4">
                  <div className="flex justify-between py-3 border-b border-gray-200">
                    <span className="text-gray-600">Mã đơn hàng</span>
                    <span className="font-semibold text-gray-900">{orderId}</span>
                  </div>

                  <div className="flex justify-between py-3 border-b border-gray-200">
                    <span className="text-gray-600">Số tiền thanh toán</span>
                    <span className="font-semibold text-lg text-red-600">
                      {amount.toLocaleString('vi-VN')} đ
                    </span>
                  </div>

                  <div className="flex justify-between py-3 border-b border-gray-200">
                    <span className="text-gray-600">Phương thức thanh toán</span>
                    <span className="font-semibold text-gray-900">
                      {orderDetails?.paymentMethod === 'cod' || !transactionId ? 'Thanh toán khi nhận hàng (COD)' : 'VNPAY'}
                    </span>
                  </div>

                  {transactionId && (
                    <div className="flex justify-between py-3 border-b border-gray-200">
                      <span className="text-gray-600">Mã giao dịch</span>
                      <span className="font-mono text-sm text-gray-900">{transactionId}</span>
                    </div>
                  )}

                  <div className="flex justify-between py-3">
                    <span className="text-gray-600">Trạng thái</span>
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full font-semibold text-sm">
                      {orderDetails?.paymentMethod === 'cod' || !transactionId ? 'Chờ thanh toán' : 'Đã thanh toán'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tracking Code Card (if available) */}
              {orderDetails?.ghnOrderCode && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">📦 Mã vận đơn Giao Hàng Nhanh</h2>
                  <div className="bg-white rounded-lg p-4 border-2 border-green-300 text-center">
                    <p className="text-sm text-gray-600 mb-2">Mã tracking:</p>
                    <p className="text-3xl font-bold text-green-600 font-mono tracking-wider">
                      {orderDetails.ghnOrderCode}
                    </p>
                  </div>
                </div>
              )}

              {/* Order Details Card (if available) */}
              {orderDetails && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">Chi tiết đơn hàng</h2>

                  <div className="space-y-4">
                    {orderDetails.shippingAddress && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Địa chỉ giao hàng</p>
                        <div className="text-gray-900">
                          {orderDetails.shippingAddress.name && (
                            <p className="font-semibold">{orderDetails.shippingAddress.name}</p>
                          )}
                          {orderDetails.shippingAddress.address && (
                            <p className="text-sm">{orderDetails.shippingAddress.address}</p>
                          )}
                          <p className="text-sm">
                            {[
                              orderDetails.shippingAddress.wardName,
                              orderDetails.shippingAddress.districtName,
                              orderDetails.shippingAddress.provinceName
                            ].filter(Boolean).join(', ')}
                          </p>
                          {orderDetails.shippingAddress.phone && (
                            <p className="text-sm">{orderDetails.shippingAddress.phone}</p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="pt-4 border-t border-gray-200">
                      <p className="text-sm text-gray-600 mb-3">Các sản phẩm</p>
                      <div className="space-y-2">
                        {orderDetails.orderItems?.map((item: any, index: number) => (
                          <div key={index} className="flex justify-between text-sm">
                            <span className="text-gray-700">
                              {item.name} x {item.qty}
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
                      <p className="font-semibold mb-1">💳 Thanh toán khi nhận hàng (COD)</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Bạn sẽ thanh toán tiền khi nhân viên giao hàng đến</li>
                        <li>Vui lòng chuẩn bị sẵn số tiền: <span className="font-bold text-red-600">{amount.toLocaleString('vi-VN')} đ</span></li>
                        <li>Hàng sẽ được chuẩn bị và giao trong 1-2 ngày làm việc</li>
                        <li>Bạn sẽ nhận được thông báo cập nhật trạng thái qua email</li>
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
                      <p className="font-semibold mb-1">✓ Tiếp theo:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Thanh toán đã được xác nhận thành công</li>
                        <li>Hàng sẽ được chuẩn bị và giao trong thời gian dự tính</li>
                        <li>Bạn sẽ nhận được thông báo cập nhật trạng thái qua email</li>
                        <li>Theo dõi đơn hàng tại trang "Đơn hàng của tôi"</li>
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
                  Xem chi tiết đơn hàng
                </Button>
                <Button
                  onClick={() => router.push('/products')}
                  variant="outline"
                  className="flex-1 py-3 h-11"
                >
                  Tiếp tục mua sắm
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
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Thanh toán không thành công</h1>
                <p className="text-lg text-gray-600">{message}</p>
              </div>

              {/* Error Details Card */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Thông tin giao dịch</h2>

                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-600">Mã đơn hàng</span>
                    <span className="font-semibold text-gray-900">{orderId}</span>
                  </div>

                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Trạng thái</span>
                    <span className="inline-block px-3 py-1 bg-red-100 text-red-700 rounded-full font-semibold text-sm">
                      Thất bại
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
                    <p className="font-semibold mb-1">Các nguyên nhân có thể gây lỗi:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Tài khoản không có đủ số dư</li>
                      <li>Thẻ/Tài khoản đã hết hạn hoặc bị khóa</li>
                      <li>Mật khẩu giao dịch không chính xác</li>
                      <li>Ngân hàng từ chối giao dịch</li>
                      <li>Kết nối internet bị gián đoạn</li>
                    </ul>
                    <p className="font-semibold mt-3 mb-1">Cách xử lý:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Kiểm tra lại thông tin thẻ và số dư</li>
                      <li>Thử lại với phương thức thanh toán khác</li>
                      <li>Liên hệ với ngân hàng để kiểm tra</li>
                      <li>Thử lại sau vài phút</li>
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
                  Xem chi tiết đơn hàng
                </Button>
                <Button
                  onClick={() => window.history.back()}
                  variant="outline"
                  className="flex-1 py-3 h-11"
                >
                  Thử lại
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
