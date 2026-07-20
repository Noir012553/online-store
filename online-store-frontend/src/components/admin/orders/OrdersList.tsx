import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { Search, Eye, Trash2, RotateCcw, AlertCircle, Plus } from "lucide-react";
import { formatDate } from "../../../lib/utils";
import { orderAPI } from "../../../lib/api";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { joinAdminRoom, leaveAdminRoom, onPaymentSuccess, onOrderUpdated, onOrderCreated, onOrderDeleted, onOrderRestored, offEvent } from "../../../lib/socket";
import { useAuth } from "../../../lib/context/AuthContext";
import { useTranslation, useLanguage } from "../../../lib/i18n";
import { useCurrencyConversion } from "../../../hooks/useCurrencyConversion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../ui/dialog";
import { toast } from "sonner";
import { Pagination } from "../Pagination";

interface OrderItem {
  product: any;
  qty: number;
  price: number;
}

interface Order {
  _id: string;
  user?: {
    _id: string;
    username?: string;
    email?: string;
    name?: string;
  };
  customer?: {
    _id: string;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  orderItems: OrderItem[];
  totalPrice: number;
  currencyCode: string;
  isPaid: boolean;
  isDelivered: boolean;
  paymentMethod?: string;
  paidAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
}

export function OrdersList() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, loadNamespace } = useTranslation();
  const { locale } = useLanguage();
  const { formatConvertedPrice } = useCurrencyConversion();
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [deletedOrders, setDeletedOrders] = useState<Order[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [deletedTotalPages, setDeletedTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [deletedCurrentPage, setDeletedCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState<Order | null>(null);
  const [viewDeletedTab, setViewDeletedTab] = useState(false);

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  const fetchOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await orderAPI.getAllOrders(currentPage, locale);
      const ordersList = response.orders || [];
      const totalPagesFromBackend = response.pages || 1;

      setOrders(Array.isArray(ordersList) ? ordersList : []);
      setTotalPages(totalPagesFromBackend);
    } catch (error) {
      setOrders([]);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, locale]);

  const fetchDeletedOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await orderAPI.getDeletedOrders(deletedCurrentPage, locale);
      const ordersList = response.orders || [];
      const totalPagesFromBackend = response.pages || 1;

      setDeletedOrders(Array.isArray(ordersList) ? ordersList : []);
      setDeletedTotalPages(totalPagesFromBackend);
    } catch (error) {
      setDeletedOrders([]);
      setDeletedTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [deletedCurrentPage, locale]);

  useEffect(() => {
    if (viewDeletedTab) {
      fetchDeletedOrders();
    } else {
      fetchOrders();
    }
  }, [viewDeletedTab, fetchOrders, fetchDeletedOrders]);

  useEffect(() => {
    const handleOrderCreated = (data: any) => {
      fetchOrders();
      toast.success(t('toast_new_order', 'admin'));
    };

    const handlePaymentSuccess = (data: any) => {
      fetchOrders();
      toast.success(t('toast_order_paid', 'admin'));
    };

    const handleOrderUpdated = (data: any) => {
      fetchOrders();
      toast.info(t('toast_order_updated', 'admin'));
    };

    const handleOrderDeleted = (data: any) => {
      if (viewDeletedTab) {
        fetchDeletedOrders();
      } else {
        fetchOrders();
      }
      toast.info(t('toast_order_deleted', 'admin'));
    };

    const handleOrderRestored = (data: any) => {
      fetchOrders();
      toast.success(t('toast_order_restored', 'admin'));
    };

    onOrderCreated(handleOrderCreated);
    onPaymentSuccess(handlePaymentSuccess);
    onOrderUpdated(handleOrderUpdated);
    onOrderDeleted(handleOrderDeleted);
    onOrderRestored(handleOrderRestored);

    return () => {
      leaveAdminRoom();
      offEvent('order-created');
      offEvent('payment-success');
      offEvent('order-updated');
      offEvent('order-deleted');
      offEvent('order-restored');
    };
  }, [locale, t, viewDeletedTab, fetchOrders, fetchDeletedOrders]);

  useEffect(() => {
    if (user) {
      joinAdminRoom({
        userId: user.id || user.email,
        role: user.role,
      });
    } else {
      joinAdminRoom();
    }
  }, [user, locale]);

  const handleDeleteOrder = async (orderId: string) => {
    try {
      setIsUpdating(true);
      // Delete order via API (soft delete)
      await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      if (viewDeletedTab) {
        await fetchDeletedOrders();
      } else {
        await fetchOrders();
      }
      toast.success(t('toast_delete_success'));
      setDeleteConfirmOrder(null);
    } catch (error) {
      toast.error(t('error_delete_data'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRestoreOrder = async (orderId: string) => {
    try {
      setIsUpdating(true);
      await orderAPI.restoreOrder(orderId);
      toast.success(t('toast_restore_success'));
      await fetchDeletedOrders();
    } catch (error) {
      toast.error(t('error_save_data'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleHardDeleteOrder = async (orderId: string) => {
    try {
      setIsUpdating(true);
      // Hard delete order via API
      await fetch(`/api/orders/${orderId}?hardDelete=true`, { method: 'DELETE' });
      await fetchDeletedOrders();
      toast.success(t('toast_delete_success'));
      setDeleteConfirmOrder(null);
    } catch (error) {
      toast.error(t('error_delete_data'));
    } finally {
      setIsUpdating(false);
    }
  };

  const getOrderStatus = (order: Order) => {
    if (order.isDelivered) return t('order_status_delivered', 'admin');
    if (order.isPaid) return t('order_status_paid', 'admin');
    return t('order_status_pending', 'admin');
  };

  const getFilteredOrders = () => {
    const listToFilter = viewDeletedTab ? deletedOrders : orders;
    return listToFilter.filter((order) => {
      const searchStr = searchQuery.toLowerCase();
      const matchesSearch =
        String(order._id || '').toLowerCase().includes(searchStr) ||
        String(order.customer?.name || '').toLowerCase().includes(searchStr) ||
        String(order.customer?.email || '').toLowerCase().includes(searchStr) ||
        String(order.user?.username || '').toLowerCase().includes(searchStr) ||
        String(order.user?.email || '').toLowerCase().includes(searchStr);

      if (viewDeletedTab) return matchesSearch;

      const status = getOrderStatus(order);
      const matchesStatus = filterStatus === "all" || status === filterStatus;

      const paymentMethod = (order.paymentMethod || "cod").toLowerCase();
      const normalizedFilter = filterPaymentMethod.toLowerCase();
      const matchesPaymentMethod = normalizedFilter === "all" || paymentMethod === normalizedFilter;

      return matchesSearch && matchesStatus && matchesPaymentMethod;
    });
  };

  const filteredOrders = getFilteredOrders();
  const currentPageVar = viewDeletedTab ? deletedCurrentPage : currentPage;
  const totalPagesToShow = viewDeletedTab ? deletedTotalPages : totalPages;

  const getStatusBadge = (order: Order) => {
    if (order.isDelivered) {
      return <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">{t('order_status_delivered', 'admin')}</span>;
    }
    if (order.isPaid) {
      return <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">{t('order_status_paid', 'admin')}</span>;
    }
    return <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-800">{t('order_status_pending', 'admin')}</span>;
  };

  const getPaymentMethodBadge = (paymentMethod?: string) => {
    const method = (paymentMethod || "cod").toLowerCase();
    const getBadgeColor = (method: string) => {
      switch (method) {
        case "vnpay": return "bg-purple-100 text-purple-800";
        case "cod": return "bg-orange-100 text-orange-800";
        case "card": return "bg-indigo-100 text-indigo-800";
        case "bank_transfer": return "bg-cyan-100 text-cyan-800";
        default: return "bg-gray-100 text-gray-800";
      }
    };
    const getLabel = (method: string) => {
      switch (method) {
        case "vnpay": return t('payment_method_vnpay', 'admin');
        case "cod": return t('payment_method_cod', 'admin');
        case "card": return t('payment_method_card', 'admin');
        case "bank_transfer": return t('payment_method_bank_transfer', 'admin');
        default: return t(`payment_method_${method}`, 'admin') || method;
      }
    };
    return <span className={`px-2 py-1 text-xs rounded ${getBadgeColor(method)}`}>{getLabel(method)}</span>;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <p>{t('loading', 'common')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1>{t('permission_manage_orders', 'admin')}</h1>
        {!viewDeletedTab && (
          <Button
            onClick={() => router.push('/admin/orders/create')}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('admin_add_order', 'admin')}
          </Button>
        )}
      </div>

      <div className="bg-white rounded-lg border mb-6">
        <div className="border-b">
          <div className="flex gap-0">
            <button
              onClick={() => {
                setViewDeletedTab(false);
                setCurrentPage(1);
                setSearchQuery("");
              }}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                !viewDeletedTab
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {t('admin_active_orders', 'admin')}
            </button>
            <button
              onClick={() => {
                setViewDeletedTab(true);
                setDeletedCurrentPage(1);
                setSearchQuery("");
              }}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                viewDeletedTab
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {t('admin_deleted_orders', 'admin')}
            </button>
          </div>
        </div>

        <div className="p-6 border-b">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
            <div className="w-full sm:flex-1 sm:min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="order-search"
                  name="order-search"
                  placeholder={t('admin_search_orders_placeholder', 'admin')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  autoComplete="off"
                />
              </div>
            </div>
            {!viewDeletedTab && (
              <>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder={t('admin_status', 'admin')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('view_all', 'common')}</SelectItem>
                    <SelectItem value="pending">{t('order_status_pending', 'admin')}</SelectItem>
                    <SelectItem value="paid">{t('order_status_paid', 'admin')}</SelectItem>
                    <SelectItem value="delivered">{t('order_status_delivered', 'admin')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder={t('admin_payment_method', 'admin')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('view_all', 'common')}</SelectItem>
                    <SelectItem value="cod">{t('payment_method_cod', 'admin')}</SelectItem>
                    <SelectItem value="vnpay">{t('payment_method_vnpay', 'admin')}</SelectItem>
                    <SelectItem value="card">{t('payment_method_card', 'admin')}</SelectItem>
                    <SelectItem value="bank_transfer">{t('payment_method_bank_transfer', 'admin')}</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </div>

        {((viewDeletedTab && deletedOrders.length === 0) || (!viewDeletedTab && orders.length === 0)) ? (
          <div className="p-12 text-center text-gray-500">
            <p>{t('no_orders_yet', 'admin')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_order_id', 'admin')}</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_customer', 'admin')}</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_order_date', 'admin')}</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_total_price', 'admin')}</th>
                    {!viewDeletedTab && <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_status', 'admin')}</th>}
                    {!viewDeletedTab && <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_payment_method', 'admin')}</th>}
                    <th className="px-6 py-3 text-right text-xs uppercase">{t('admin_actions', 'admin')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredOrders.map((order) => (
                    <tr key={order._id}>
                      <td className="px-6 py-4 font-mono text-sm">{order._id.slice(-8).toUpperCase()}</td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium">{order.customer?.name || order.user?.username || t('not_updated')}</p>
                          <p className="text-sm text-gray-600">{order.customer?.email || order.user?.email || t('not_updated')}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">{formatDate(new Date(order.createdAt), locale)}</td>
                      <td className="px-6 py-4 font-medium">{formatConvertedPrice(order.totalPrice, order.currencyCode, order.currencyCode)}</td>
                      {!viewDeletedTab && <td className="px-6 py-4">{getStatusBadge(order)}</td>}
                      {!viewDeletedTab && <td className="px-6 py-4">{getPaymentMethodBadge(order.paymentMethod)}</td>}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/admin/orders/${order._id}`)}
                            title={t('view_details', 'common')}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {viewDeletedTab ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRestoreOrder(order._id)}
                                disabled={isUpdating}
                                title={t('admin_restore', 'admin')}
                              >
                                <RotateCcw className="w-4 h-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirmOrder(order)}
                                title={t('admin_hard_delete', 'admin')}
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirmOrder(order)}
                              title={t('admin_delete_order', 'admin')}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPagesToShow > 1 && (
              <Pagination
                currentPage={currentPageVar}
                totalPages={totalPagesToShow}
                onPageChange={viewDeletedTab ? setDeletedCurrentPage : setCurrentPage}
              />
            )}
          </>
        )}
      </div>

      <Dialog open={!!deleteConfirmOrder} onOpenChange={() => setDeleteConfirmOrder(null)}>
        <DialogContent className="sm:max-w-100 animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-full ${viewDeletedTab ? 'bg-red-100' : 'bg-orange-100'}`}>
                <AlertCircle className={`h-6 w-6 ${viewDeletedTab ? 'text-red-600' : 'text-orange-600'}`} />
              </div>
              <DialogTitle className="text-lg font-semibold">
                {viewDeletedTab ? t('admin_hard_delete', 'admin') : t('confirm_delete_title', 'common')}
              </DialogTitle>
            </div>
            <DialogDescription>
              {viewDeletedTab ? t('confirm_hard_delete_description', 'common') : t('confirm_delete_description', 'common')}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-white rounded-lg p-4 my-2">
            <p className="text-sm text-gray-600 leading-relaxed">
              {t('admin_order_id', 'admin')}: <span className="font-semibold text-gray-900">#{deleteConfirmOrder?._id.slice(-8).toUpperCase()}</span>
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 flex flex-row-reverse">
            <Button
              onClick={() =>
                deleteConfirmOrder &&
                (viewDeletedTab
                  ? handleHardDeleteOrder(deleteConfirmOrder._id)
                  : handleDeleteOrder(deleteConfirmOrder._id))
              }
              disabled={isUpdating}
              className="bg-red-600 hover:bg-red-700 text-white flex-1"
            >
              {isUpdating ? t('loading', 'common') : viewDeletedTab ? t('admin_hard_delete', 'admin') : t('remove', 'common')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOrder(null)}
              className="flex-1"
            >
              {t('cancel', 'common')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
