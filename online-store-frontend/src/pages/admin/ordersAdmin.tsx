import { useState, useEffect } from "react";
import { Search, Eye, Trash2, CheckCircle2, Truck, RotateCcw, AlertCircle, Package, MapPin, Calendar, DollarSign } from "lucide-react";
import { formatCurrency, formatDate } from "../../lib/utils";
import { orderAPI } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { joinAdminRoom, leaveAdminRoom, onPaymentSuccess, onOrderUpdated, offEvent } from "../../lib/socket";
import { useAuth } from "../../lib/context/AuthContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import { toast } from "sonner";
import AdminLayout from "./adminLayout";
import { Pagination } from "../../components/admin/Pagination";

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
  isPaid: boolean;
  isDelivered: boolean;
  paidAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
}

function OrdersAdminContent() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [deletedOrders, setDeletedOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [deletedCurrentPage, setDeletedCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState<Order | null>(null);
  const [viewDeletedTab, setViewDeletedTab] = useState(false);
  const itemsPerPage = 10;

  useEffect(() => {
    if (viewDeletedTab) {
      fetchDeletedOrders();
    } else {
      fetchOrders();
    }
  }, [currentPage, deletedCurrentPage, viewDeletedTab]);

  // Socket.io real-time updates for admin
  useEffect(() => {
    // Join admin room with user info for tracking
    if (user) {
      joinAdminRoom({
        userId: user.id || user.email,
        role: user.role,
      });
    } else {
      joinAdminRoom(); // Fallback nếu user chưa load
    }

    // Listen for payment success events
    const handlePaymentSuccess = (data: any) => {
      // Auto-refresh orders when payment succeeds
      fetchOrders();
      toast.success(`Đơn hàng ${data.data.orderId} vừa được thanh toán!`);
    };

    // Listen for order update events
    const handleOrderUpdated = (data: any) => {
      // Auto-refresh orders when order is updated
      fetchOrders();
    };

    onPaymentSuccess(handlePaymentSuccess);
    onOrderUpdated(handleOrderUpdated);

    // Cleanup on unmount or user change
    return () => {
      leaveAdminRoom();
      offEvent('payment-success');
      offEvent('order-updated');
    };
  }, [user]);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const response = await orderAPI.getAllOrders(currentPage);
      const ordersList = response.orders || [];
      setOrders(Array.isArray(ordersList) ? ordersList : []);
    } catch (error) {
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDeletedOrders = async () => {
    try {
      setIsLoading(true);
      const response = await orderAPI.getDeletedOrders(deletedCurrentPage);
      const ordersList = response.orders || [];
      setDeletedOrders(Array.isArray(ordersList) ? ordersList : []);
    } catch (error) {
      setDeletedOrders([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsDelivered = async (orderId: string) => {
    try {
      setIsUpdating(true);
      await fetch(`/api/orders/${orderId}/deliver`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') || '{}').token : ''}`
        }
      });
      await fetchOrders();
      toast.success("Cập nhật giao hàng thành công!");
      setSelectedOrder(null);
    } catch (error) {
      toast.error("Cập nhật giao hàng thất bại");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      setIsUpdating(true);
      await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') || '{}').token : ''}`
        }
      });
      if (viewDeletedTab) {
        await fetchDeletedOrders();
      } else {
        await fetchOrders();
      }
      toast.success("Xóa đơn hàng thành công!");
      setDeleteConfirmOrder(null);
      setSelectedOrder(null);
    } catch (error) {
      toast.error("Xóa đơn hàng thất bại");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRestoreOrder = async (orderId: string) => {
    try {
      setIsUpdating(true);
      await orderAPI.restoreOrder(orderId);
      toast.success("Khôi phục đơn hàng thành công!");
      setSelectedOrder(null);
      await fetchDeletedOrders();
    } catch (error) {
      toast.error("Khôi phục đơn hàng thất bại");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleHardDeleteOrder = async (orderId: string) => {
    try {
      setIsUpdating(true);
      await fetch(`/api/orders/${orderId}/hard`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') || '{}').token : ''}`
        }
      });
      await fetchDeletedOrders();
      toast.success("Xóa vĩnh viễn đơn hàng thành công!");
      setDeleteConfirmOrder(null);
      setSelectedOrder(null);
    } catch (error) {
      toast.error("Xóa vĩnh viễn đơn hàng thất bại");
    } finally {
      setIsUpdating(false);
    }
  };

  const getOrderStatus = (order: Order) => {
    if (order.isDelivered) return "delivered";
    if (order.isPaid) return "paid";
    return "pending";
  };

  const getFilteredOrders = () => {
    const listToFilter = viewDeletedTab ? deletedOrders : orders;
    return listToFilter.filter((order) => {
      const searchStr = searchQuery.toLowerCase();
      const matchesSearch =
        order._id.toLowerCase().includes(searchStr) ||
        order.customer?.name?.toLowerCase().includes(searchStr) ||
        order.customer?.email?.toLowerCase().includes(searchStr) ||
        order.user?.username?.toLowerCase().includes(searchStr) ||
        order.user?.email?.toLowerCase().includes(searchStr);

      if (viewDeletedTab) return matchesSearch;

      const status = getOrderStatus(order);
      const matchesStatus = filterStatus === "all" || status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  };

  const filteredOrders = getFilteredOrders();
  const currentPageVar = viewDeletedTab ? deletedCurrentPage : currentPage;
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPageVar - 1) * itemsPerPage,
    currentPageVar * itemsPerPage
  );

  const getStatusBadge = (order: Order) => {
    if (order.isDelivered) {
      return <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">Đã giao</span>;
    }
    if (order.isPaid) {
      return <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">Đã thanh toán</span>;
    }
    return <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-800">Chờ thanh toán</span>;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <p>Đang tải dữ liệu...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1>Quản lý đơn hàng</h1>
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
              Đơn hàng hoạt động
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
              Đơn hàng đã xóa
            </button>
          </div>
        </div>

        <div className="p-6 border-b">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Tìm kiếm đơn hàng..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            {!viewDeletedTab && (
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="pending">Chờ thanh toán</SelectItem>
                  <SelectItem value="paid">Đã thanh toán</SelectItem>
                  <SelectItem value="delivered">Đã giao</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {((viewDeletedTab && deletedOrders.length === 0) || (!viewDeletedTab && orders.length === 0)) ? (
          <div className="p-12 text-center text-gray-500">
            <p>{viewDeletedTab ? "Chưa có đơn hàng đã xóa" : "Chưa có đơn hàng nào"}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs uppercase">Mã đơn</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">Khách hàng</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">Ngày đặt</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">Tổng tiền</th>
                    {!viewDeletedTab && <th className="px-6 py-3 text-left text-xs uppercase">Trạng thái</th>}
                    <th className="px-6 py-3 text-right text-xs uppercase">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginatedOrders.map((order) => (
                    <tr key={order._id}>
                      <td className="px-6 py-4 font-mono text-sm">{order._id.slice(-8).toUpperCase()}</td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium">{order.customer?.name || order.user?.username || "null"}</p>
                          <p className="text-sm text-gray-600">{order.customer?.email || order.user?.email || "null"}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">{formatDate(new Date(order.createdAt))}</td>
                      <td className="px-6 py-4 font-medium">{formatCurrency(order.totalPrice)}</td>
                      {!viewDeletedTab && <td className="px-6 py-4">{getStatusBadge(order)}</td>}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedOrder(order)}
                            title={viewDeletedTab ? "Xem chi tiết" : "Xem chi tiết"}
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
                                title="Khôi phục"
                              >
                                <RotateCcw className="w-4 h-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirmOrder(order)}
                                title="Xóa vĩnh viễn"
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirmOrder(order)}
                              title="Xóa đơn hàng"
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

            {totalPages > 1 && (
              <Pagination
                currentPage={currentPageVar}
                totalPages={totalPages}
                onPageChange={viewDeletedTab ? setDeletedCurrentPage : setCurrentPage}
              />
            )}
          </>
        )}
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-blue-100">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
              <DialogTitle className="text-xl font-semibold">
                Chi tiết đơn hàng #{selectedOrder?._id.slice(-8).toUpperCase()}
              </DialogTitle>
            </div>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  Thông tin khách hàng
                </h3>
                <div className="bg-linear-to-br from-blue-50 to-blue-50 p-4 rounded-lg space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Họ tên:</span>
                    <span className="font-medium">{selectedOrder.customer?.name || selectedOrder.user?.username || "—"}</span>
                  </div>
                  {(selectedOrder.customer?.email || selectedOrder.user?.email) && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Email:</span>
                      <a href={`mailto:${selectedOrder.customer?.email || selectedOrder.user?.email}`} className="font-medium text-blue-600 hover:underline">
                        {selectedOrder.customer?.email || selectedOrder.user?.email}
                      </a>
                    </div>
                  )}
                  {selectedOrder.customer?.phone && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Điện thoại:</span>
                      <a href={`tel:${selectedOrder.customer.phone}`} className="font-medium text-blue-600 hover:underline">
                        {selectedOrder.customer.phone}
                      </a>
                    </div>
                  )}
                  {selectedOrder.customer?.address && (
                    <div className="pt-2 border-t border-blue-200">
                      <p className="text-sm text-gray-600 mb-1">Địa chỉ giao hàng:</p>
                      <p className="text-sm font-medium text-gray-800">{selectedOrder.customer.address}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600" />
                  Danh sách sản phẩm
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Sản phẩm</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">SL</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Giá</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Tổng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedOrder.orderItems.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium">
                            {item.product?.name || "Sản phẩm"}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-medium">{item.qty}</td>
                          <td className="px-4 py-3 text-right text-sm">
                            {formatCurrency(item.price)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-red-600">
                            {formatCurrency(item.price * item.qty)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t font-semibold">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-right text-sm">
                          Tổng cộng:
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-red-600">
                          {formatCurrency(selectedOrder.totalPrice)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className={`p-4 rounded-lg text-center transition-colors ${selectedOrder.isPaid ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                  <div className="flex items-center justify-center mb-2">
                    <CheckCircle2 className={`w-5 h-5 ${selectedOrder.isPaid ? 'text-green-600' : 'text-yellow-600'}`} />
                  </div>
                  <p className="text-xs text-gray-600 mb-1">Thanh toán</p>
                  <p className={`text-xs font-semibold ${selectedOrder.isPaid ? 'text-green-600' : 'text-yellow-600'}`}>
                    {selectedOrder.isPaid ? "✓ Đã TT" : "✗ Chưa TT"}
                  </p>
                </div>
                <div className={`p-4 rounded-lg text-center transition-colors ${selectedOrder.isDelivered ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                  <div className="flex items-center justify-center mb-2">
                    <Truck className={`w-5 h-5 ${selectedOrder.isDelivered ? 'text-green-600' : 'text-yellow-600'}`} />
                  </div>
                  <p className="text-xs text-gray-600 mb-1">Giao hàng</p>
                  <p className={`text-xs font-semibold ${selectedOrder.isDelivered ? 'text-green-600' : 'text-yellow-600'}`}>
                    {selectedOrder.isDelivered ? "✓ Đã giao" : "✗ Chưa"}
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                  </div>
                  <p className="text-xs text-gray-600 mb-1">Ngày đặt</p>
                  <p className="text-xs font-semibold text-blue-600">{formatDate(new Date(selectedOrder.createdAt))}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t">
                {!selectedOrder.isDelivered && (
                  <Button
                    onClick={() => handleMarkAsDelivered(selectedOrder._id)}
                    disabled={isUpdating}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                  >
                    <Truck className="w-4 h-4" />
                    Xác nhận đã giao
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmOrder} onOpenChange={() => setDeleteConfirmOrder(null)}>
        <DialogContent className="sm:max-w-100 animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-full ${viewDeletedTab ? 'bg-red-100' : 'bg-orange-100'}`}>
                <AlertCircle className={`h-6 w-6 ${viewDeletedTab ? 'text-red-600' : 'text-orange-600'}`} />
              </div>
              <DialogTitle className="text-lg font-semibold">
                {viewDeletedTab ? "Xóa vĩnh viễn đơn hàng" : "Xác nhận xóa đơn hàng"}
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="bg-gray-50 rounded-lg p-4 my-2">
            <p className="text-sm text-gray-600 leading-relaxed">
              {viewDeletedTab ? (
                <>Bạn có chắc chắn muốn xóa vĩnh viễn đơn hàng <span className="font-semibold text-gray-900">#{deleteConfirmOrder?._id.slice(-8).toUpperCase()}</span>? <span className="text-red-600 font-medium">Hành động này không thể hoàn tác</span> và sẽ xóa hoàn toàn khỏi hệ thống.</>
              ) : (
                <>Bạn có chắc chắn muốn xóa đơn hàng <span className="font-semibold text-gray-900">#{deleteConfirmOrder?._id.slice(-8).toUpperCase()}</span>? Bạn có thể khôi phục sau này.</>
              )}
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
              {isUpdating ? "Đang xóa..." : viewDeletedTab ? "Xóa vĩnh viễn" : "Xóa"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOrder(null)}
              className="flex-1"
            >
              Hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OrdersAdmin() {
  return (
    <AdminLayout>
      <OrdersAdminContent />
    </AdminLayout>
  );
}
