import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Bell, AlertCircle, CheckCircle, Clock, TrendingUp, X } from "lucide-react";
import { orderAPI } from "../../lib/api";
import { formatDate } from "../../lib/utils";
import { toast } from "sonner";
import { useLanguage } from '@/lib/i18n';
import { useCurrencyConversion } from '@/hooks/useCurrencyConversion';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Select } from "../ui/select";

interface PendingOrder {
  _id: string;
  totalPrice: number;
  currencyCode: string;
  isPaid: boolean;
  isDelivered: boolean;
  createdAt: Date;
  user: {
    name?: string;
    email?: string;
  };
}

export function NotificationBell() {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const { formatConvertedPrice } = useCurrencyConversion();
  const formatOrderPrice = (amount: number, currencyCode: string) =>
    formatConvertedPrice(amount, currencyCode, currencyCode);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<'pending' | 'delivered'>('pending');
  const [prevDeliveryStatus, setPrevDeliveryStatus] = useState<'pending' | 'delivered'>('pending');

  useEffect(() => {
    fetchPendingOrders();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPendingOrders, 30000);
    return () => clearInterval(interval);
  }, [locale]);

  const fetchPendingOrders = async () => {
    try {
      setIsLoading(true);
      const response = await orderAPI.getAllOrders(1, locale);
      const allOrders = response.orders || [];

      // Filter pending orders (not paid or not delivered)
      const pending = allOrders.filter(
        (order: PendingOrder) => !order.isPaid || !order.isDelivered
      );

      setPendingOrders(pending);
    } catch (error) {
      setPendingOrders([]);
    } finally {
      setIsLoading(false);
    }
  };

  const unreadCount = pendingOrders.length;

  const getOrderStatus = (order: PendingOrder) => {
    if (!order.isPaid) return 'pending_payment';
    if (!order.isDelivered) return 'waiting_delivery';
    return 'completed';
  };

  const handleOpenOrderModal = (order: PendingOrder) => {
    setSelectedOrder(order);
    const status = order.isDelivered ? 'delivered' : 'pending';
    setDeliveryStatus(status);
    setPrevDeliveryStatus(status);
  };

  // Helper: Check if status has changed
  const hasStatusChanged = deliveryStatus !== prevDeliveryStatus;

  const handleSaveOrder = async () => {
    if (!selectedOrder) return;

    // Early return if no changes made
    if (!hasStatusChanged) {
      toast.info(t('no_changes', 'notifications'));
      setSelectedOrder(null);
      return;
    }

    try {
      setIsSaving(true);

      // Build status update payload
      const statusUpdate: { isDelivered: boolean } = {
        isDelivered: deliveryStatus === 'delivered',
      };

      // Send API request with updated status
      await orderAPI.updateOrderStatus(selectedOrder._id, statusUpdate);

      toast.success(t('toast_update_success', 'notifications'));
      setSelectedOrder(null);
      await fetchPendingOrders();
    } catch (error: any) {
      const errorMessage = error?.message || t('error_save_data', 'notifications');

      // Handle specific error cases
      if (errorMessage.includes('Order not found') || errorMessage.includes('404')) {
        setPendingOrders(prev => prev.filter(o => o._id !== selectedOrder._id));
        toast.error(t('error_order_not_found', 'notifications'));
        setSelectedOrder(null);
      } else if (errorMessage.includes('Network') || errorMessage.includes('Failed')) {
        toast.error(t('error_network', 'notifications'));
      } else {
        toast.error(errorMessage);
      }

      // Reset to previous status on error
      setDeliveryStatus(prevDeliveryStatus);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-10 w-10 p-0 hover:bg-blue-50 transition-colors"
        >
          <Bell className="h-5 w-5 text-blue-600 transition-colors" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full animate-pulse">
              {unreadCount > 99 ? t('need_processing', 'notifications').replace('{count}', '99') : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0">
        <div className="space-y-0">
          <div className="bg-linear-to-r from-blue-50 to-blue-50 p-4 border-b space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100">
                  <Bell className="h-4 w-4 text-blue-600" />
                </div>
                <h3 className="font-semibold text-base text-gray-900">{t('notifications', 'notifications')}</h3>
              </div>
              {unreadCount > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-semibold">
                  {unreadCount} {t('need_processing', 'notifications')}
                </span>
              )}
            </div>
          </div>

          <div className="p-4 bg-white">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2"></div>
                <p>{t('loading', 'notifications')}</p>
              </div>
            ) : unreadCount === 0 ? (
              <div className="text-center py-8">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mx-auto mb-3">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <p className="text-gray-600 text-sm font-medium">{t('no_orders_to_process', 'notifications')}</p>
                <p className="text-gray-500 text-xs mt-1">{t('all_orders_processed', 'notifications')}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {pendingOrders.slice(0, 10).map((order) => {
                  const status = getOrderStatus(order);
                  const statusColor = !order.isPaid ? "yellow" : "blue";
                  const statusIcon = !order.isPaid ? Clock : TrendingUp;
                  const StatusIcon = statusIcon;

                  return (
                    <div
                      key={order._id}
                      onClick={() => handleOpenOrderModal(order)}
                      className={`p-3 rounded-lg border transition-all hover:shadow-sm cursor-pointer active:shadow-md ${
                        statusColor === "yellow"
                          ? "bg-yellow-50 border-yellow-200 hover:bg-yellow-100 active:bg-yellow-200"
                          : "bg-blue-50 border-blue-200 hover:bg-blue-100 active:bg-blue-200"
                      }`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handleOpenOrderModal(order);
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 ${
                          statusColor === "yellow" ? "bg-yellow-100" : "bg-blue-100"
                        }`}>
                          <StatusIcon className={`h-4 w-4 ${
                            statusColor === "yellow" ? "text-yellow-600" : "text-blue-600"
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {order.user?.name ? order.user.name : t('admin_customer', 'notifications')}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {order.user?.email}
                          </p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${
                              statusColor === "yellow"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-blue-100 text-blue-700"
                            }`}>
                              {status === 'pending_payment' ? t('pending_payment', 'orders') : t('waiting_delivery', 'notifications')}
                            </span>
                            <span className="text-xs font-bold text-red-600">
                              {formatOrderPrice(order.totalPrice, order.currencyCode)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-2">
                            {formatDate(new Date(order.createdAt), locale)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {unreadCount > 10 && (
                  <div className="text-center text-xs text-gray-500 py-3 border-t">
                    {t('and', 'notifications')} {unreadCount - 10} {t('others', 'notifications')}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t p-3 bg-white">
            <Button
              onClick={fetchPendingOrders}
              variant="ghost"
              size="sm"
              className="w-full text-xs font-medium text-blue-600 hover:bg-blue-100 hover:text-blue-700"
            >
              ↻ {t('refresh', 'notifications')}
            </Button>
          </div>
        </div>
      </PopoverContent>

      <Dialog
        open={!!selectedOrder}
        onOpenChange={(open: boolean) => {
          if (!open) {
            // Reset state when closing dialog
            setDeliveryStatus('pending');
            setPrevDeliveryStatus('pending');
            setSelectedOrder(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle>{t('admin_order_id', 'notifications')}</DialogTitle>
                <DialogDescription>
                  {selectedOrder.user?.name || selectedOrder.user?.email}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs uppercase tracking-wider text-gray-500">{t('admin_total_price', 'admin')}</p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {formatOrderPrice(selectedOrder.totalPrice, selectedOrder.currencyCode)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs uppercase tracking-wider text-gray-500">{t('admin_status', 'admin')}</p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {(() => {
                        const status = getOrderStatus(selectedOrder);
                        if (status === 'pending_payment') return t('pending_payment', 'orders');
                        if (status === 'waiting_delivery') return t('waiting_delivery', 'notifications');
                        return t('status_delivered', 'orders');
                      })()}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs uppercase tracking-wider text-gray-500">{t('admin_customer', 'notifications')}</p>
                  <p className="mt-1 font-semibold text-gray-900">{selectedOrder.user?.name}</p>
                  <p className="text-sm text-gray-600">{selectedOrder.user?.email}</p>
                </div>

                <div className={`rounded-lg border p-3 transition-colors ${hasStatusChanged ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs uppercase tracking-wider text-gray-500">{t('deliveryStatus', 'notifications')}</p>
                    {hasStatusChanged && (
                      <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                        {t('pending_changes', 'notifications')}
                      </span>
                    )}
                  </div>
                  <select
                    value={deliveryStatus}
                    onChange={(e) => setDeliveryStatus(e.target.value as 'pending' | 'delivered')}
                    className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isSaving}
                  >
                    <option value="pending">{t('waiting_delivery', 'notifications')}</option>
                    <option value="delivered">{t('my_orders_status_delivered', 'orders')}</option>
                  </select>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-3">
                <Button
                  variant="outline"
                  onClick={() => setSelectedOrder(null)}
                  disabled={isSaving}
                >
                  {t('dialog_close', 'notifications')}
                </Button>
                <Button
                  className="bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleSaveOrder}
                  disabled={isSaving || !hasStatusChanged}
                  title={!hasStatusChanged ? t('no_changes', 'notifications') : ''}
                >
                  {isSaving ? t('profile_saving', 'notifications') : t('save', 'notifications')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Popover>
  );
}
