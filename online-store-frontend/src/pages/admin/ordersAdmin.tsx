import { useState, useEffect } from "react";
import { Search, Eye, Trash2, CheckCircle2, Truck, RotateCcw, AlertCircle, Package, MapPin, Calendar, DollarSign, Plus, X } from "lucide-react";
import { formatCurrency, formatDate } from "../../lib/utils";
import { apiCall, orderAPI, productAPI } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { joinAdminRoom, leaveAdminRoom, onPaymentSuccess, onOrderUpdated, onOrderCreated, onOrderDeleted, onOrderRestored, offEvent } from "../../lib/socket";
import { useAuth } from "../../lib/context/AuthContext";
import { useTranslation } from "../../lib/i18n";
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
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/_AdminLayout";
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
  paymentMethod?: string; // 'cod', 'vnpay', 'card', 'bank_transfer'
  paidAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
}

function OrdersAdminContent() {
  const { user } = useAuth();
  const { t, loadNamespace } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [deletedOrders, setDeletedOrders] = useState<Order[]>([]);
  const [totalPages, setTotalPages] = useState(1);  // Total pages from backend
  const [deletedTotalPages, setDeletedTotalPages] = useState(1);  // Total pages for deleted orders
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [deletedCurrentPage, setDeletedCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState<Order | null>(null);
  const [viewDeletedTab, setViewDeletedTab] = useState(false);
  const itemsPerPage = 10;  // Same as backend pageSize

  // Create order form states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [createForm, setCreateForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerAddress: "",
    paymentMethod: "cod",
    shippingFee: 0,
  });
  const [orderItems, setOrderItems] = useState<Array<{ product: string; name: string; image: string; qty: number; price: number }>>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedProductQty, setSelectedProductQty] = useState<number | string>(1);

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  useEffect(() => {
    if (viewDeletedTab) {
      fetchDeletedOrders();
    } else {
      fetchOrders();
    }
  }, [currentPage, deletedCurrentPage, viewDeletedTab]);

  // Socket.io real-time updates for admin - Setup listeners once on mount
  useEffect(() => {
    // Define listeners
    const handleOrderCreated = (data: any) => {
      // Auto-refresh orders when new order is created
      fetchOrders();
      toast.success(t('toast_new_order', 'admin'));
    };

    // Listen for payment success events
    const handlePaymentSuccess = (data: any) => {
      // Auto-refresh orders when payment succeeds
      fetchOrders();
      toast.success(t('toast_order_paid', 'admin'));
    };

    // Listen for order update events
    const handleOrderUpdated = (data: any) => {
      // Auto-refresh orders when order is updated
      fetchOrders();
      toast.info(t('toast_order_updated', 'admin'));
    };

    // Listen for order deleted events
    const handleOrderDeleted = (data: any) => {
      // Auto-refresh orders when order is deleted
      if (viewDeletedTab) {
        fetchDeletedOrders();
      } else {
        fetchOrders();
      }
      toast.info(t('toast_order_deleted', 'admin'));
    };

    // Listen for order restored events
    const handleOrderRestored = (data: any) => {
      // Auto-refresh orders when order is restored
      fetchOrders();
      toast.success(t('toast_order_restored', 'admin'));
    };

    // Register all listeners
    onOrderCreated(handleOrderCreated);
    onPaymentSuccess(handlePaymentSuccess);
    onOrderUpdated(handleOrderUpdated);
    onOrderDeleted(handleOrderDeleted);
    onOrderRestored(handleOrderRestored);

    // Cleanup on unmount
    return () => {
      leaveAdminRoom();
      offEvent('order-created');
      offEvent('payment-success');
      offEvent('order-updated');
      offEvent('order-deleted');
      offEvent('order-restored');
    };
  }, []); // Empty dependency array - setup listeners ONCE on mount only

  // Join admin room when user changes
  useEffect(() => {
    if (user) {
      joinAdminRoom({
        userId: user.id || user.email,
        role: user.role,
      });
    } else {
      joinAdminRoom(); // Fallback nếu user chưa load
    }
  }, [user]);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const response = await orderAPI.getAllOrders(currentPage);
      const ordersList = response.orders || [];
      const totalPagesFromBackend = response.pages || 1;

      setOrders(Array.isArray(ordersList) ? ordersList : []);
      setTotalPages(totalPagesFromBackend);  // Save total pages from backend!
    } catch (error) {
      setOrders([]);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDeletedOrders = async () => {
    try {
      setIsLoading(true);
      const response = await orderAPI.getDeletedOrders(deletedCurrentPage);
      const ordersList = response.orders || [];
      const totalPagesFromBackend = response.pages || 1;

      setDeletedOrders(Array.isArray(ordersList) ? ordersList : []);
      setDeletedTotalPages(totalPagesFromBackend);  // Save total pages for deleted orders
    } catch (error) {
      setDeletedOrders([]);
      setDeletedTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      setIsLoadingProducts(true);
      const response = await productAPI.getProducts(1, "", "", "", 100);
      const productsList = response.products || [];
      setProducts(Array.isArray(productsList) ? productsList : []);
    } catch (error) {
      toast.error(t('error_load_products', 'admin'));
      setProducts([]);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const handleAddProductToOrder = () => {
    const qty = typeof selectedProductQty === 'string' ? parseInt(selectedProductQty, 10) : selectedProductQty;

    if (!selectedProductId || qty < 1 || isNaN(qty)) {
      toast.error(t('error_select_product_qty', 'admin'));
      return;
    }

    const product = products.find((p) => p._id === selectedProductId);
    if (!product) {
      toast.error(t('error_product_not_found', 'admin'));
      return;
    }

    if (product.countInStock < qty) {
      toast.error(`${t('error_insufficient_stock', 'admin')}. ${t('in_stock', 'admin')}: ${product.countInStock}`);
      return;
    }

    // Check if product already in order items
    const existingIndex = orderItems.findIndex((item) => item.product === selectedProductId);
    if (existingIndex >= 0) {
      const newQty = orderItems[existingIndex].qty + qty;
      if (product.countInStock < newQty) {
        toast.error(`${t('error_insufficient_stock', 'admin')}. ${t('in_stock', 'admin')}: ${product.countInStock}`);
        return;
      }
      const newItems = [...orderItems];
      newItems[existingIndex].qty = newQty;
      setOrderItems(newItems);
    } else {
      setOrderItems([
        ...orderItems,
        {
          product: selectedProductId,
          name: product.name,
          image: product.image,
          qty: qty,
          price: product.price,
        },
      ]);
    }

    setSelectedProductId("");
    setSelectedProductQty(1);
      toast.success(t('toast_product_added', 'admin'));
  };

  const handleRemoveProductFromOrder = (productId: string) => {
    setOrderItems(orderItems.filter((item) => item.product !== productId));
  };

  const calculateTotals = () => {
    const itemsPrice = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const shippingFee = parseFloat(createForm.shippingFee.toString()) || 0;
    const taxPrice = 0; // No tax added - matches COD/VNPay payment system
    const totalPrice = itemsPrice + shippingFee; // No tax in calculation

    return { itemsPrice, taxPrice, shippingFee, totalPrice };
  };

  const handleCreateOrder = async () => {
    if (!createForm.customerName || !createForm.customerPhone) {
      toast.error(t('error_validate_name_phone', 'admin'));
      return;
    }

    // Validate phone number format (10-11 digits)
    const phoneRegex = /^[0-9]{10,11}$/;
    if (!phoneRegex.test(createForm.customerPhone)) {
        toast.error(t('invalid_phone', 'admin'));
      return;
    }

    // Validate email format if provided
    if (createForm.customerEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(createForm.customerEmail)) {
        toast.error(t('invalid_email', 'admin'));
        return;
      }
    }

    if (orderItems.length === 0) {
      toast.error(t('error_cart_empty', 'admin'));
      return;
    }

    try {
      setIsCreatingOrder(true);

      // ==================== SECURITY FIX ====================
      // Only send cartItems (productId + quantity), backend recalculates prices
      await apiCall("/orders", {
        method: "POST",
        body: JSON.stringify({
          cartItems: orderItems.map((item) => ({
            productId: item.product,
            quantity: item.qty,
          })),
          shippingFee: createForm.shippingFee || 0,
          couponCode: null,
          customerName: createForm.customerName,
          customerEmail: createForm.customerEmail || undefined,
          customerPhone: createForm.customerPhone,
          shippingAddress: createForm.customerAddress ? {
            name: createForm.customerName,
            phone: createForm.customerPhone,
            address: createForm.customerAddress,
          } : undefined,
          paymentMethod: createForm.paymentMethod,
        }),
      });

      toast.success(t('toast_order_created', 'admin'));
      setIsCreateDialogOpen(false);

      // Reset form
      setCreateForm({
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        customerAddress: "",
        paymentMethod: "cod",
        shippingFee: 0,
      });
      setOrderItems([]);

      // Refresh orders
      await fetchOrders();
    } catch (error: any) {
      toast.error(error.message || t('error_create_order', 'admin'));
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handleMarkAsDelivered = async (orderId: string) => {
    try {
      setIsUpdating(true);
      await apiCall(`/orders/${orderId}/deliver`, {
        method: 'PUT',
      });
      await fetchOrders();
      toast.success(t('toast_update_success', 'admin'));
      setSelectedOrder(null);
    } catch (error) {
      toast.error(t('error_save_data', 'admin'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      setIsUpdating(true);
      await apiCall(`/orders/${orderId}`, {
        method: 'DELETE',
      });
      if (viewDeletedTab) {
        await fetchDeletedOrders();
      } else {
        await fetchOrders();
      }
      toast.success(t('toast_delete_success', 'admin'));
      setDeleteConfirmOrder(null);
      setSelectedOrder(null);
    } catch (error) {
      toast.error(t('error_delete_data', 'admin'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRestoreOrder = async (orderId: string) => {
    try {
      setIsUpdating(true);
      await orderAPI.restoreOrder(orderId);
      toast.success(t('toast_restore_success', 'admin'));
      setSelectedOrder(null);
      await fetchDeletedOrders();
    } catch (error) {
      toast.error(t('error_save_data', 'admin'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleHardDeleteOrder = async (orderId: string) => {
    try {
      setIsUpdating(true);
      await apiCall(`/orders/${orderId}/hard`, {
        method: 'DELETE',
      });
      await fetchDeletedOrders();
      toast.success(t('toast_delete_success', 'admin'));
      setDeleteConfirmOrder(null);
      setSelectedOrder(null);
    } catch (error) {
      toast.error(t('error_delete_data', 'admin'));
    } finally {
      setIsUpdating(false);
    }
  };

  const getOrderStatus = (order: Order) => {
    if (order.isDelivered) return "delivered";
    if (order.isPaid) return "paid";
    return "pending";
  };

  // For client-side filtering (search, status, payment method filters)
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

      // Normalize payment method to lowercase for comparison
      const paymentMethod = (order.paymentMethod || "cod").toLowerCase();
      const normalizedFilter = filterPaymentMethod.toLowerCase();
      const matchesPaymentMethod = normalizedFilter === "all" || paymentMethod === normalizedFilter;

      return matchesSearch && matchesStatus && matchesPaymentMethod;
    });
  };

  // Get filtered orders (for display on current page)
  const filteredOrders = getFilteredOrders();

  // Use totalPages from backend (server-side pagination)
  // Don't calculate from filteredOrders.length!
  const currentPageVar = viewDeletedTab ? deletedCurrentPage : currentPage;
  const totalPagesToShow = viewDeletedTab ? deletedTotalPages : totalPages;
  const paginatedOrders = filteredOrders;

  const getStatusBadge = (order: Order) => {
    if (order.isDelivered) {
      return <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">{t('status_delivered')}</span>;
    }
    if (order.isPaid) {
      return <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">{t('paid_status')}</span>;
    }
    return <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-800">{t('pending_payment')}</span>;
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
        default: return method.toUpperCase();
      }
    };
    return <span className={`px-2 py-1 text-xs rounded ${getBadgeColor(method)}`}>{getLabel(method)}</span>;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <p>{t('loading')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1>{t('permission_manage_orders', 'admin')}</h1>
        {!viewDeletedTab && (
          <Button
            onClick={() => {
              fetchProducts();
              setIsCreateDialogOpen(true);
            }}
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
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-64">
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
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder={t('admin_status', 'admin')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('view_all', 'admin')}</SelectItem>
                    <SelectItem value="pending">{t('pending_payment')}</SelectItem>
                    <SelectItem value="paid">{t('paid_status')}</SelectItem>
                    <SelectItem value="delivered">{t('status_delivered')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder={t('admin_payment_method', 'admin')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('view_all', 'admin')}</SelectItem>
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
                  {paginatedOrders.map((order) => (
                    <tr key={order._id}>
                      <td className="px-6 py-4 font-mono text-sm">{order._id.slice(-8).toUpperCase()}</td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium">{order.customer?.name || order.user?.username || t('not_updated', 'admin')}</p>
                          <p className="text-sm text-gray-600">{order.customer?.email || order.user?.email || t('not_updated', 'admin')}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">{formatDate(new Date(order.createdAt))}</td>
                      <td className="px-6 py-4 font-medium">{formatCurrency(order.totalPrice)}</td>
                      {!viewDeletedTab && <td className="px-6 py-4">{getStatusBadge(order)}</td>}
                      {!viewDeletedTab && <td className="px-6 py-4">{getPaymentMethodBadge(order.paymentMethod)}</td>}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedOrder(order)}
                            title={t('view_details', 'admin')}
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

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-blue-100">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
              <DialogTitle className="text-xl font-semibold">
                {t('admin_order_details', 'admin')} #{(selectedOrder?._id ?? '').slice(-8).toUpperCase()}
              </DialogTitle>
            </div>
            <DialogDescription>
              {t('admin_order_details', 'admin')}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  {t('customer_info', 'admin')}
                </h3>
                <div className="bg-linear-to-br from-blue-50 to-blue-50 p-4 rounded-lg space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">{t('name_label', 'admin')}:</span>
                    <span className="font-medium">{selectedOrder.customer?.name || selectedOrder.user?.username || t('not_updated', 'admin')}</span>
                  </div>
                  {(selectedOrder.customer?.email || selectedOrder.user?.email) && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">{t('email_label', 'admin')}:</span>
                      <a href={`mailto:${selectedOrder.customer?.email || selectedOrder.user?.email}`} className="font-medium text-blue-600 hover:underline">
                        {selectedOrder.customer?.email || selectedOrder.user?.email}
                      </a>
                    </div>
                  )}
                  {selectedOrder.customer?.phone && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">{t('phone_placeholder', 'admin')}:</span>
                      <a href={`tel:${selectedOrder.customer.phone}`} className="font-medium text-blue-600 hover:underline">
                        {selectedOrder.customer.phone}
                      </a>
                    </div>
                  )}
                  {selectedOrder.customer?.address && (
                    <div className="pt-2 border-t border-blue-200">
                      <p className="text-sm text-gray-600 mb-1">{t('shipping_address', 'admin')}:</p>
                      <p className="text-sm font-medium text-gray-800">{selectedOrder.customer.address}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600" />
                  {t('product_list', 'admin')}
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-white">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">{t('product', 'admin')}</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">{t('quantity_label', 'admin')}</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">{t('admin_price', 'admin')}</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">{t('total', 'admin')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedOrder.orderItems.map((item, index) => (
                        <tr key={index} className="hover:bg-white">
                          <td className="px-4 py-3 text-sm font-medium">
                            {item.product?.name || t('product_fallback', 'admin')}
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
                    <tfoot className="bg-white border-t font-semibold">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-right text-sm">
                          {t('total', 'admin')}:
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-red-600">
                          {formatCurrency(selectedOrder.totalPrice)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className={`p-4 rounded-lg text-center transition-colors ${selectedOrder.isPaid ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                  <div className="flex items-center justify-center mb-2">
                    <CheckCircle2 className={`w-5 h-5 ${selectedOrder.isPaid ? 'text-green-600' : 'text-yellow-600'}`} />
                  </div>
                  <p className="text-xs text-gray-600 mb-1">{t('payment_info', 'admin')}</p>
                  <p className={`text-xs font-semibold ${selectedOrder.isPaid ? 'text-green-600' : 'text-yellow-600'}`}>
                    {selectedOrder.isPaid ? t('paid_status') : t('pending_payment')}
                  </p>
                </div>
                <div className={`p-4 rounded-lg text-center transition-colors ${selectedOrder.isDelivered ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                  <div className="flex items-center justify-center mb-2">
                    <Truck className={`w-5 h-5 ${selectedOrder.isDelivered ? 'text-green-600' : 'text-yellow-600'}`} />
                  </div>
                  <p className="text-xs text-gray-600 mb-1">{t('admin_status', 'admin')}</p>
                  <p className={`text-xs font-semibold ${selectedOrder.isDelivered ? 'text-green-600' : 'text-yellow-600'}`}>
                    {selectedOrder.isDelivered ? t('status_delivered') : t('pending_payment')}
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                  </div>
                  <p className="text-xs text-gray-600 mb-1">{t('admin_order_date', 'admin')}</p>
                  <p className="text-xs font-semibold text-blue-600">{formatDate(new Date(selectedOrder.createdAt))}</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg text-center">
                  <div className="flex items-center justify-center mb-2">
                    <DollarSign className="w-5 h-5 text-purple-600" />
                  </div>
                  <p className="text-xs text-gray-600 mb-1">{t('admin_payment_method', 'admin')}</p>
                  <p className="text-xs font-semibold text-purple-600">
                    {selectedOrder.paymentMethod === "vnpay" && t('payment_method_vnpay', 'admin')}
                    {selectedOrder.paymentMethod === "cod" && t('payment_method_cod', 'admin')}
                    {selectedOrder.paymentMethod === "card" && t('payment_method_card', 'admin')}
                    {selectedOrder.paymentMethod === "bank_transfer" && t('payment_method_bank_transfer', 'admin')}
                    {!selectedOrder.paymentMethod && t('payment_method_cod', 'admin')}
                  </p>
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
                    {t('mark_as_delivered', 'admin')}
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
                {viewDeletedTab ? t('admin_hard_delete', 'admin') : t('confirm_delete_title', 'admin')}
              </DialogTitle>
            </div>
            <DialogDescription>
              {viewDeletedTab ? t('confirm_hard_delete_description', 'admin') : t('confirm_delete_description', 'admin')}
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
              {isUpdating ? t('loading') : viewDeletedTab ? t('admin_hard_delete', 'admin') : t('remove', 'admin')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOrder(null)}
              className="flex-1"
            >
              {t('cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Order Dialog */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) {
            setCreateForm({
              customerName: "",
              customerEmail: "",
              customerPhone: "",
              customerAddress: "",
              paymentMethod: "cod",
              shippingFee: 0,
            });
            setOrderItems([]);
            setSelectedProductId("");
            setSelectedProductQty(1);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-blue-100">
                <Plus className="h-6 w-6 text-blue-600" />
              </div>
              <DialogTitle className="text-xl font-semibold">{t('create_order_title', 'admin')}</DialogTitle>
            </div>
            <DialogDescription>
              {t('create_order_title', 'admin')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Customer Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                {t('customer_info', 'admin')}
              </h3>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="create-customer-name" className="text-xs font-medium text-gray-600">{t('customer_name', 'admin')} *</Label>
                  <Input
                    id="create-customer-name"
                    name="customerName"
                    value={createForm.customerName}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, customerName: e.target.value })
                    }
                    placeholder={t('name_label')}
                    className="mt-1"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <Label htmlFor="create-customer-phone" className="text-xs font-medium text-gray-600">{t('customer_phone', 'admin')} *</Label>
                  <Input
                    id="create-customer-phone"
                    name="customerPhone"
                    value={createForm.customerPhone}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, customerPhone: e.target.value })
                    }
                    placeholder={t('phone_placeholder')}
                    className="mt-1"
                    autoComplete="tel"
                  />
                </div>
                <div>
                  <Label htmlFor="create-customer-email" className="text-xs font-medium text-gray-600">{t('customer_email', 'admin')}</Label>
                  <Input
                    id="create-customer-email"
                    name="customerEmail"
                    type="email"
                    value={createForm.customerEmail}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, customerEmail: e.target.value })
                    }
                    placeholder={t('email_label')}
                    className="mt-1"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <Label htmlFor="create-customer-address" className="text-xs font-medium text-gray-600">{t('customer_address', 'admin')}</Label>
                  <Input
                    id="create-customer-address"
                    name="customerAddress"
                    value={createForm.customerAddress}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, customerAddress: e.target.value })
                    }
                    placeholder={t('shipping_address', 'admin-common')}
                    className="mt-1"
                    autoComplete="street-address"
                  />
                </div>
              </div>
            </div>

            {/* Product Selection */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                {t('add_product', 'admin')}
              </h3>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="select-product" className="text-xs font-medium text-gray-600">{t('product', 'admin')}</Label>
                    <select
                      id="select-product"
                      name="productId"
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                      disabled={isLoadingProducts}
                    >
                      <option value="">
                        {isLoadingProducts ? t('loading') : t('product_list', 'admin')}
                      </option>
                      {products.map((product) => (
                        <option key={product._id} value={product._id}>
                          {product.name} - {formatCurrency(product.price)} ({t('in_stock', 'admin')}: {product.countInStock})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="product-qty" className="text-xs font-medium text-gray-600">{t('quantity_label', 'admin')}</Label>
                    <Input
                      id="product-qty"
                      name="qty"
                      type="number"
                      min="1"
                      value={selectedProductQty || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setSelectedProductQty('');
                        } else {
                          const num = parseInt(val, 10);
                          if (!isNaN(num) && num >= 1) {
                            setSelectedProductQty(num);
                          }
                        }
                      }}
                      className="mt-1"
                      autoComplete="off"
                      onBlur={(e) => {
                        const val = e.target.value === '' ? 1 : parseInt(e.target.value, 10);
                        setSelectedProductQty(isNaN(val) || val < 1 ? 1 : val);
                      }}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleAddProductToOrder}
                  disabled={!selectedProductId || isLoadingProducts}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t('add_product', 'admin')}
                </Button>
              </div>

              {/* Order Items List */}
              {orderItems.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-white">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">
                          {t('product', 'admin')}
                        </th>
                        <th className="px-4 py-2 text-center font-semibold text-gray-700">{t('quantity_label', 'admin')}</th>
                        <th className="px-4 py-2 text-right font-semibold text-gray-700">{t('admin_price', 'admin')}</th>
                        <th className="px-4 py-2 text-right font-semibold text-gray-700">
                          {t('total', 'admin')}
                        </th>
                        <th className="px-4 py-2 text-center font-semibold text-gray-700">
                          {t('admin_actions', 'admin')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {orderItems.map((item) => {
                        const product = products.find((p) => p._id === item.product);
                        return (
                          <tr key={item.product}>
                            <td className="px-4 py-2">{product?.name || t('product_fallback', 'admin')}</td>
                            <td className="px-4 py-2 text-center">{item.qty}</td>
                            <td className="px-4 py-2 text-right">
                              {formatCurrency(item.price)}
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-red-600">
                              {formatCurrency(item.price * item.qty)}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveProductFromOrder(item.product)}
                              >
                                <X className="w-4 h-4 text-red-600" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Shipping & Payment */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" />
                {`${t('shipping_fee', 'admin')} & ${t('payment_info', 'admin')}`}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="shipping-fee" className="text-xs font-medium text-gray-600">{t('shipping_fee', 'admin')}</Label>
                  <Input
                    id="shipping-fee"
                    name="shippingFee"
                    type="number"
                    min="0"
                    step="1000"
                    value={createForm.shippingFee || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setCreateForm({ ...createForm, shippingFee: 0 });
                      } else {
                        const num = parseFloat(val);
                        if (!isNaN(num) && num >= 0) {
                          setCreateForm({ ...createForm, shippingFee: num });
                        }
                      }
                    }}
                    onBlur={(e) => {
                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      setCreateForm({
                        ...createForm,
                        shippingFee: isNaN(val) || val < 0 ? 0 : val,
                      });
                    }}
                    placeholder={t('admin_shipping_fee_placeholder', 'admin')}
                    className="mt-1"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <Label htmlFor="payment-method" className="text-xs font-medium text-gray-600">{t('admin_payment_method', 'admin')}</Label>
                  <select
                    id="payment-method"
                    name="paymentMethod"
                    value={createForm.paymentMethod}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, paymentMethod: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="cod">{t('payment_method_cod', 'admin')}</option>
                    <option value="vnpay">{t('payment_method_vnpay', 'admin')}</option>
                    <option value="bank_transfer">{t('payment_method_bank_transfer', 'admin')}</option>
                    <option value="card">{t('payment_method_card', 'admin')}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Order Summary */}
            {orderItems.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                  {t('order_info', 'admin')}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('subtotal', 'admin')}</span>
                    <span className="font-medium">
                      {formatCurrency(
                        calculateTotals().itemsPrice
                      )}
                    </span>
                  </div>
                  {calculateTotals().shippingFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t('shipping_fee', 'admin')}</span>
                      <span className="font-medium">
                        {formatCurrency(calculateTotals().shippingFee)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-blue-200">
                    <span className="text-gray-700 font-semibold">{t('total', 'admin')}</span>
                    <span className="font-bold text-red-600 text-lg">
                      {formatCurrency(calculateTotals().totalPrice)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 flex flex-row-reverse">
            <Button
              onClick={handleCreateOrder}
              disabled={isCreatingOrder || orderItems.length === 0}
              className="bg-green-600 hover:bg-green-700 text-white flex-1"
            >
              {isCreatingOrder ? t('loading') : t('create_order_button', 'admin')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
              className="flex-1"
            >
              {t('cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default function OrdersAdmin() {
  return (
    <AdminLayout>
      <OrdersAdminContent />
    </AdminLayout>
  );
}
