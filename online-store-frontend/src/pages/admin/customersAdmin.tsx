import { useState, useEffect } from "react";
import { Search, Eye, Mail, Phone, Plus, Pencil, Trash2, RotateCcw, AlertCircle, CheckCircle2, Users } from "lucide-react";
import { formatCurrency, formatDate } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import { toast } from "sonner";
import { customerAPI } from "../../lib/api";
import AdminLayout from "./adminLayout";
import { Pagination } from "../../components/admin/Pagination";

interface Customer {
  _id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  totalOrders?: number;
  totalSpent?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

function CustomersAdminContent() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deletedCustomers, setDeletedCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [deletedCurrentPage, setDeletedCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmCustomer, setDeleteConfirmCustomer] = useState<Customer | null>(null);
  const [viewDeletedTab, setViewDeletedTab] = useState(false);
  const itemsPerPage = 10;

  useEffect(() => {
    if (viewDeletedTab) {
      fetchDeletedCustomers();
    } else {
      fetchCustomers();
    }
  }, [currentPage, deletedCurrentPage, viewDeletedTab]);

  const fetchCustomers = async () => {
    try {
      setIsLoading(true);
      const response = await customerAPI.getCustomers();
      const customersList = response.customers || response;
      setCustomers(Array.isArray(customersList) ? customersList : []);
    } catch (error) {
      setCustomers([]);
      toast.error("Không thể tải danh sách khách hàng từ server");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDeletedCustomers = async () => {
    try {
      setIsLoading(true);
      const response = await customerAPI.getDeletedCustomers(deletedCurrentPage);
      const customersList = response.customers || [];
      setDeletedCustomers(Array.isArray(customersList) ? customersList : []);
    } catch (error) {
      setDeletedCustomers([]);
      toast.error("Không thể tải danh sách khách hàng đã xóa từ server");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingCustomer({
      name: "",
      email: "",
      phone: "",
      address: "",
    });
    setIsFormOpen(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer({ ...customer });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    try {
      if (!editingCustomer.name || !editingCustomer.email || !editingCustomer.phone) {
        toast.error("Vui lòng điền đầy đủ thông tin (Tên, Email, Điện thoại)");
        return;
      }

      setIsSubmitting(true);
      if (editingCustomer._id) {
        // Update existing
        await customerAPI.updateCustomer(editingCustomer._id, {
          name: editingCustomer.name,
          email: editingCustomer.email,
          phone: editingCustomer.phone,
          address: editingCustomer.address,
        });
        toast.success("Cập nhật khách hàng thành công!");
      } else {
        // Create new
        await customerAPI.createCustomer({
          name: editingCustomer.name,
          email: editingCustomer.email,
          phone: editingCustomer.phone,
          address: editingCustomer.address,
        });
        toast.success("Tạo khách hàng thành công!");
      }
      setIsFormOpen(false);
      setEditingCustomer(null);
      await fetchCustomers();
    } catch (error) {
      toast.error("Không thể lưu khách hàng");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    try {
      setIsSubmitting(true);
      await customerAPI.deleteCustomer(customerId);
      toast.success("Xóa khách hàng thành công!");
      setDeleteConfirmCustomer(null);
      setSelectedCustomer(null);
      if (viewDeletedTab) {
        await fetchDeletedCustomers();
      } else {
        await fetchCustomers();
      }
    } catch (error) {
      toast.error("Không thể xóa khách hàng");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestoreCustomer = async (customerId: string) => {
    try {
      setIsSubmitting(true);
      await customerAPI.restoreCustomer(customerId);
      toast.success("Khôi phục khách hàng thành công!");
      setSelectedCustomer(null);
      await fetchDeletedCustomers();
    } catch (error) {
      toast.error("Không thể khôi phục khách hàng");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHardDeleteCustomer = async (customerId: string) => {
    try {
      setIsSubmitting(true);
      await fetch(`/api/customers/${customerId}/hard`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') || '{}').token : ''}`
        }
      });
      await fetchDeletedCustomers();
      toast.success("Xóa vĩnh viễn khách hàng thành công!");
      setDeleteConfirmCustomer(null);
      setSelectedCustomer(null);
    } catch (error) {
      toast.error("Không thể xóa vĩnh viễn khách hàng");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCustomerName = (customer: Customer) => {
    if (customer.name) return customer.name;
    const firstName = customer.firstName || "";
    const lastName = customer.lastName || "";
    return (firstName + " " + lastName).trim() || "Khách hàng";
  };

  const getFilteredCustomers = () => {
    const listToFilter = viewDeletedTab ? deletedCustomers : customers;
    return listToFilter.filter((customer) => {
      const name = getCustomerName(customer);
      return (
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.phone?.includes(searchQuery) ||
        false
      );
    });
  };

  const filteredCustomers = getFilteredCustomers();
  const currentPageVar = viewDeletedTab ? deletedCurrentPage : currentPage;
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const paginatedCustomers = filteredCustomers.slice(
    (currentPageVar - 1) * itemsPerPage,
    currentPageVar * itemsPerPage
  );

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
        <h1>Quản lý khách hàng</h1>
        {!viewDeletedTab && (
          <Button onClick={handleCreate} className="bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4 mr-2" />
            Thêm khách hàng
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
              Khách hàng hoạt động
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
              Khách hàng đã xóa
            </button>
          </div>
        </div>

        <div className="p-6 border-b">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Tìm kiếm khách hàng..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {((viewDeletedTab && deletedCustomers.length === 0) || (!viewDeletedTab && customers.length === 0)) ? (
          <div className="p-12 text-center text-gray-500">
            <p>{viewDeletedTab ? "Chưa có khách hàng đã xóa" : "Chưa có khách hàng nào trong hệ thống"}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs uppercase">Khách hàng</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">Liên hệ</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">Địa chỉ</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">Ngày tham gia</th>
                    <th className="px-6 py-3 text-right text-xs uppercase">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginatedCustomers.map((customer) => (
                    <tr key={customer._id}>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium">{getCustomerName(customer)}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {customer.email && (
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="w-4 h-4 text-gray-400" />
                              <a href={`mailto:${customer.email}`} className="hover:text-red-600">
                                {customer.email}
                              </a>
                            </div>
                          )}
                          {customer.phone && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="w-4 h-4 text-gray-400" />
                              <a href={`tel:${customer.phone}`} className="hover:text-red-600">
                                {customer.phone}
                              </a>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm max-w-xs">{customer.address || "—"}</p>
                      </td>
                      <td className="px-6 py-4">
                        {customer.createdAt ? formatDate(new Date(customer.createdAt)) : "—"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCustomer(customer)}
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {viewDeletedTab ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRestoreCustomer(customer._id)}
                                disabled={isSubmitting}
                                title="Khôi phục"
                              >
                                <RotateCcw className="w-4 h-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirmCustomer(customer)}
                                title="Xóa vĩnh viễn"
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(customer)}
                                title="Chỉnh sửa"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirmCustomer(customer)}
                                title="Xóa"
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            </>
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

      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="max-w-2xl animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-blue-100">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <DialogTitle className="text-xl font-semibold">
                Thông tin khách hàng
              </DialogTitle>
            </div>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-linear-to-br from-blue-50 to-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 font-medium mb-2">Họ tên</p>
                  <p className="font-semibold text-gray-900">{getCustomerName(selectedCustomer)}</p>
                </div>
                <div className="bg-linear-to-br from-green-50 to-green-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 font-medium mb-2">Ngày tham gia</p>
                  <p className="font-semibold text-gray-900">
                    {selectedCustomer.createdAt ? formatDate(new Date(selectedCustomer.createdAt)) : "—"}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {selectedCustomer.email && (
                  <div className="bg-linear-to-br from-blue-50 to-blue-50 p-4 rounded-lg flex items-start gap-3">
                    <Mail className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-600 font-medium mb-1">Email</p>
                      <a
                        href={`mailto:${selectedCustomer.email}`}
                        className="text-blue-600 hover:text-blue-700 font-medium break-all text-sm"
                      >
                        {selectedCustomer.email}
                      </a>
                    </div>
                  </div>
                )}
                {selectedCustomer.phone && (
                  <div className="bg-linear-to-br from-blue-50 to-blue-50 p-4 rounded-lg flex items-start gap-3">
                    <Phone className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-600 font-medium mb-1">Điện thoại</p>
                      <a
                        href={`tel:${selectedCustomer.phone}`}
                        className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                      >
                        {selectedCustomer.phone}
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {selectedCustomer.address && (
                <div className="bg-linear-to-br from-orange-50 to-orange-50 p-4 rounded-lg border-l-4 border-orange-500">
                  <p className="text-xs text-gray-600 font-medium mb-2">Địa chỉ giao hàng</p>
                  <p className="text-gray-800 text-sm">{selectedCustomer.address}</p>
                </div>
              )}

              <div className="flex items-center gap-2 p-4 bg-green-50 rounded-lg">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                <p className="font-semibold text-gray-900 text-sm">Trạng thái: <span className="text-green-600">Hoạt động</span></p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-md animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-blue-100">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <DialogTitle className="text-xl font-semibold">
                {editingCustomer?._id ? "Chỉnh sửa khách hàng" : "Thêm khách hàng mới"}
              </DialogTitle>
            </div>
          </DialogHeader>
          {editingCustomer && (
            <div className="space-y-4 py-4">
              <div className="bg-linear-to-br from-blue-50 to-blue-50 p-4 rounded-lg space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Họ tên <span className="text-red-500">*</span></Label>
                  <Input
                    value={editingCustomer.name || ""}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, name: e.target.value })
                    }
                    placeholder="Nhập tên khách hàng"
                    className="transition-colors focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Email <span className="text-red-500">*</span></Label>
                  <Input
                    type="email"
                    value={editingCustomer.email || ""}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, email: e.target.value })
                    }
                    placeholder="example@gmail.com"
                    className="transition-colors focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Số điện thoại <span className="text-red-500">*</span></Label>
                  <Input
                    value={editingCustomer.phone || ""}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, phone: e.target.value })
                    }
                    placeholder="0912345678"
                    className="transition-colors focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Địa chỉ</Label>
                  <Input
                    value={editingCustomer.address || ""}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, address: e.target.value })
                    }
                    placeholder="Nhập địa chỉ giao hàng"
                    className="transition-colors focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 flex flex-row-reverse pt-6 border-t">
            <Button
              onClick={handleSave}
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white flex-1 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? "Đang lưu..." : "Lưu"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsFormOpen(false)}
              className="flex-1"
            >
              Hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmCustomer} onOpenChange={() => setDeleteConfirmCustomer(null)}>
        <DialogContent className="sm:max-w-100 animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-full ${viewDeletedTab ? 'bg-red-100' : 'bg-orange-100'}`}>
                <AlertCircle className={`h-6 w-6 ${viewDeletedTab ? 'text-red-600' : 'text-orange-600'}`} />
              </div>
              <DialogTitle className="text-lg font-semibold">
                {viewDeletedTab ? "Xóa vĩnh viễn khách hàng" : "Xác nhận xóa khách hàng"}
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="bg-gray-50 rounded-lg p-4 my-2">
            <p className="text-sm text-gray-600 leading-relaxed">
              {viewDeletedTab ? (
                <>Bạn có chắc chắn muốn xóa vĩnh viễn khách hàng <span className="font-semibold text-gray-900">{deleteConfirmCustomer && getCustomerName(deleteConfirmCustomer)}</span>? <span className="text-red-600 font-medium">Hành động này không thể hoàn tác</span> và sẽ xóa hoàn toàn khỏi hệ thống.</>
              ) : (
                <>Bạn có chắc chắn muốn xóa khách hàng <span className="font-semibold text-gray-900">{deleteConfirmCustomer && getCustomerName(deleteConfirmCustomer)}</span>? Bạn có thể khôi phục sau này.</>
              )}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 flex flex-row-reverse">
            <Button
              onClick={() =>
                deleteConfirmCustomer &&
                (viewDeletedTab
                  ? handleHardDeleteCustomer(deleteConfirmCustomer._id)
                  : handleDeleteCustomer(deleteConfirmCustomer._id))
              }
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700 text-white flex-1"
            >
              {isSubmitting ? "Đang xóa..." : viewDeletedTab ? "Xóa vĩnh viễn" : "Xóa"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmCustomer(null)}
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

export default function CustomersAdmin() {
  return (
    <AdminLayout>
      <CustomersAdminContent />
    </AdminLayout>
  );
}
