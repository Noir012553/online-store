import { useEffect, useState } from "react";
import { Bell, AlertCircle, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { orderAPI } from "../../lib/api";
import { formatCurrency, formatDate } from "../../lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import { Button } from "../ui/button";

interface PendingOrder {
  _id: string;
  totalPrice: number;
  isPaid: boolean;
  isDelivered: boolean;
  createdAt: Date;
  user: {
    name?: string;
    email?: string;
  };
}

export function NotificationBell() {
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchPendingOrders();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPendingOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchPendingOrders = async () => {
    try {
      setIsLoading(true);
      const response = await orderAPI.getAllOrders(1);
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
    if (!order.isPaid) return "Chờ thanh toán";
    if (!order.isDelivered) return "Chờ giao hàng";
    return "Hoàn tất";
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
              {unreadCount > 99 ? "99+" : unreadCount}
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
                <h3 className="font-semibold text-base text-gray-900">Thông báo</h3>
              </div>
              {unreadCount > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-semibold">
                  {unreadCount} cần xử lý
                </span>
              )}
            </div>
          </div>

          <div className="p-4 bg-white">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2"></div>
                <p>Đang tải...</p>
              </div>
            ) : unreadCount === 0 ? (
              <div className="text-center py-8">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mx-auto mb-3">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <p className="text-gray-600 text-sm font-medium">Không có đơn hàng cần xử lý</p>
                <p className="text-gray-500 text-xs mt-1">Tất cả đơn hàng đã được xử lý</p>
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
                      className={`p-3 rounded-lg border transition-all hover:shadow-sm cursor-pointer ${
                        statusColor === "yellow"
                          ? "bg-yellow-50 border-yellow-200 hover:bg-yellow-100"
                          : "bg-blue-50 border-blue-200 hover:bg-blue-100"
                      }`}
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
                            {order.user?.name || "Khách hàng"}
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
                              {status}
                            </span>
                            <span className="text-xs font-bold text-red-600">
                              {formatCurrency(order.totalPrice)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-2">
                            {formatDate(new Date(order.createdAt))}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {unreadCount > 10 && (
                  <div className="text-center text-xs text-gray-500 py-3 border-t">
                    ... và {unreadCount - 10} đơn hàng khác
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t p-3 bg-gray-50">
            <Button
              onClick={fetchPendingOrders}
              variant="ghost"
              size="sm"
              className="w-full text-xs font-medium text-blue-600 hover:bg-blue-100 hover:text-blue-700"
            >
              ↻ Làm mới
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
