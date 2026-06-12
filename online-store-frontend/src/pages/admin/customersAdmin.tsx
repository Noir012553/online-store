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
  DialogDescription,
} from "../../components/ui/dialog";
import { toast } from "sonner";
import { customerAPI } from "../../lib/api";
import AdminLayout from "../../components/admin/_AdminLayout";
import { Pagination } from "../../components/admin/Pagination";
import { joinAdminRoom, leaveAdminRoom, onCustomerCreated, onCustomerUpdated, onCustomerDeleted, onCustomerRestored, offEvent } from "../../lib/socket";
import { useAuth } from "../../lib/context/AuthContext";
import { useTranslation } from '@/lib/i18n';

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
  const { user } = useAuth();
  const { t, loadNamespace } = useTranslation();

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

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

    // Listen for new customer created events
    const handleCustomerCreated = (data: any) => {
      // Auto-refresh customers when new customer is created
      fetchCustomers();
      toast.success(t('toast_new_customer', 'customers'));
    };

    // Listen for customer updated events
    const handleCustomerUpdated = (data: any) => {
      // Auto-refresh customers when customer is updated
      fetchCustomers();
      toast.info(t('toast_customer_updated', 'customers'));
    };

    // Listen for customer deleted events
    const handleCustomerDeleted = (data: any) => {
      // Auto-refresh customers when customer is deleted
      if (viewDeletedTab) {
        fetchDeletedCustomers();
      } else {
        fetchCustomers();
      }
      toast.info(t('toast_customer_deleted', 'customers'));
    };

    // Listen for customer restored events
    const handleCustomerRestored = (data: any) => {
      // Auto-refresh customers when customer is restored
      fetchCustomers();
      toast.success(t('toast_customer_restored', 'customers'));
    };

    onCustomerCreated(handleCustomerCreated);
    onCustomerUpdated(handleCustomerUpdated);
    onCustomerDeleted(handleCustomerDeleted);
    onCustomerRestored(handleCustomerRestored);

    // Cleanup on unmount or user change
    return () => {
      leaveAdminRoom();
      offEvent('customer-created');
      offEvent('customer-updated');
      offEvent('customer-deleted');
      offEvent('customer-restored');
    };
  }, [user, viewDeletedTab, t]);

  const fetchCustomers = async () => {
    try {
      setIsLoading(true);
      const response = await customerAPI.getCustomers();
      const customersList = response.customers || response;
      setCustomers(Array.isArray(customersList) ? customersList : []);
    } catch (error) {
      setCustomers([]);
      toast.error(t('error_load_data'));
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
      toast.error(t('error_load_data'));
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
        toast.error(t('error_fill_required'));
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
        toast.success(t('toast_customer_updated', 'customers'));
      } else {
        // Create new
        await customerAPI.createCustomer({
          name: editingCustomer.name,
          email: editingCustomer.email,
          phone: editingCustomer.phone,
          address: editingCustomer.address,
        });
        toast.success(t('toast_customer_created', 'customers'));
      }
      setIsFormOpen(false);
      setEditingCustomer(null);
      await fetchCustomers();
    } catch (error) {
      toast.error(t('error_save_data'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    try {
      setIsSubmitting(true);
      await customerAPI.deleteCustomer(customerId);
      toast.success(t('toast_customer_deleted', 'customers'));
      setDeleteConfirmCustomer(null);
      setSelectedCustomer(null);
      if (viewDeletedTab) {
        await fetchDeletedCustomers();
      } else {
        await fetchCustomers();
      }
    } catch (error) {
      toast.error(t('error_delete_data'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestoreCustomer = async (customerId: string) => {
    try {
      setIsSubmitting(true);
      await customerAPI.restoreCustomer(customerId);
      toast.success(t('toast_customer_restored', 'customers'));
      setSelectedCustomer(null);
      await fetchDeletedCustomers();
    } catch (error) {
      toast.error(t('error_save_data'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHardDeleteCustomer = async (customerId: string) => {
    try {
      setIsSubmitting(true);
      await customerAPI.hardDeleteCustomer(customerId);
      await fetchDeletedCustomers();
      toast.success(t('toast_customer_deleted', 'customers'));
      setDeleteConfirmCustomer(null);
      setSelectedCustomer(null);
    } catch (error) {
      toast.error(t('error_delete_data'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCustomerName = (customer: Customer) => {
    if (customer.name) return customer.name;
    const firstName = customer.firstName || "";
    const lastName = customer.lastName || "";
    return (firstName + " " + lastName).trim() || t('customer_fallback', 'admin');
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
        <p>{t('loading', 'admin-common')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1>{t('permission_manage_customers', 'customers')}</h1>
        {!viewDeletedTab && (
          <Button onClick={handleCreate} className="bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4 mr-2" />
            {t('admin_add_customer', 'customers')}
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
              {t('admin_active_customers', 'customers')}
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
              {t('admin_deleted_customers', 'customers')}
            </button>
          </div>
        </div>

        <div className="p-6 border-b">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              id="customer-search"
              name="customer-search"
              placeholder={t('admin_search_customers_placeholder', 'customers')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              autoComplete="off"
            />
          </div>
        </div>

        {((viewDeletedTab && deletedCustomers.length === 0) || (!viewDeletedTab && customers.length === 0)) ? (
          <div className="p-12 text-center text-gray-500">
            <p>{viewDeletedTab ? t('admin_deleted_customers', 'customers') : t('no_customers_yet', 'customers')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_customer', 'customers')}</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">{t('contact', 'customers')}</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_customer_address', 'customers')}</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_join_date', 'customers')}</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_status', 'customers')}</th>
                    <th className="px-6 py-3 text-right text-xs uppercase">{t('admin_actions', 'customers')}</th>
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
                        <p className="text-sm max-w-xs">{customer.address || t('not_updated', 'customers')}</p>
                      </td>
                      <td className="px-6 py-4">
                        {customer.createdAt ? formatDate(new Date(customer.createdAt)) : t('not_updated', 'customers')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          viewDeletedTab ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {viewDeletedTab ? t('admin_deleted_status', 'customers') : t('profile_active', 'customers')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {viewDeletedTab ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRestoreCustomer(customer._id)}
                                disabled={isSubmitting}
                                title={t('admin_restore', 'customers')}
                              >
                                <RotateCcw className="w-4 h-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirmCustomer(customer)}
                                title={t('admin_hard_delete', 'customers')}
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
                                title={t('profile_edit', 'customers')}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirmCustomer(customer)}
                                title={t('remove', 'customers')}
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
                {t('customer_info', 'customers')}
              </DialogTitle>
            </div>
            <DialogDescription>
              {t('customer_info', 'customers')}
            </DialogDescription>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-linear-to-br from-blue-50 to-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 font-medium mb-2">{t('admin_customer_name', 'customers')}</p>
                  <p className="font-semibold text-gray-900">{getCustomerName(selectedCustomer)}</p>
                </div>
                <div className="bg-linear-to-br from-green-50 to-green-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 font-medium mb-2">{t('admin_join_date', 'customers')}</p>
                  <p className="font-semibold text-gray-900">
                    {selectedCustomer.createdAt ? formatDate(new Date(selectedCustomer.createdAt)) : t('not_updated', 'admin')}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {selectedCustomer.email && (
                  <div className="bg-linear-to-br from-blue-50 to-blue-50 p-4 rounded-lg flex items-start gap-3">
                    <Mail className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-600 font-medium mb-1">{t('email_label')}</p>
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
                      <p className="text-xs text-gray-600 font-medium mb-1">{t('admin_customer_phone', 'customers')}</p>
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
                  <p className="text-xs text-gray-600 font-medium mb-2">{t('admin_customer_address', 'customers')}</p>
                  <p className="text-gray-800 text-sm">{selectedCustomer.address}</p>
                </div>
              )}

              <div className="flex items-center gap-2 p-4 bg-green-50 rounded-lg">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                <p className="font-semibold text-gray-900 text-sm">{t('admin_status', 'customers')}: <span className="text-green-600">{t('profile_active', 'customers')}</span></p>
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
                {editingCustomer?._id ? t('edit_customer_title', 'customers') : t('add_customer_title', 'customers')}
              </DialogTitle>
            </div>
            <DialogDescription>
              {editingCustomer?._id ? t('edit_customer_title', 'customers') : t('add_customer_title', 'customers')}
            </DialogDescription>
          </DialogHeader>
          {editingCustomer && (
            <div className="space-y-4 py-4">
              <div className="bg-linear-to-br from-blue-50 to-blue-50 p-4 rounded-lg space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="customer-name" className="text-sm font-medium">{t('admin_customer_name', 'customers')} <span className="text-red-500">*</span></Label>
                  <Input
                    id="customer-name"
                    name="name"
                    value={editingCustomer.name || ""}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, name: e.target.value })
                    }
                    placeholder={t('name_placeholder', 'customers')}
                    className="transition-colors focus:ring-2 focus:ring-blue-500"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-email" className="text-sm font-medium">{t('email_label')} <span className="text-red-500">*</span></Label>
                  <Input
                    id="customer-email"
                    name="email"
                    type="email"
                    value={editingCustomer.email || ""}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, email: e.target.value })
                    }
                    placeholder={t('email_placeholder', 'customers')}
                    className="transition-colors focus:ring-2 focus:ring-blue-500"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-phone" className="text-sm font-medium">{t('admin_customer_phone', 'customers')} <span className="text-red-500">*</span></Label>
                  <Input
                    id="customer-phone"
                    name="phone"
                    value={editingCustomer.phone || ""}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, phone: e.target.value })
                    }
                    placeholder={t('phone_placeholder', 'customers')}
                    className="transition-colors focus:ring-2 focus:ring-blue-500"
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-address" className="text-sm font-medium">{t('admin_customer_address', 'customers')}</Label>
                  <Input
                    id="customer-address"
                    name="address"
                    value={editingCustomer.address || ""}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, address: e.target.value })
                    }
                    placeholder={t('address_placeholder', 'customers')}
                    className="transition-colors focus:ring-2 focus:ring-blue-500"
                    autoComplete="street-address"
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
              {isSubmitting ? t('processing') : t('profile_save', 'customers')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsFormOpen(false)}
              className="flex-1"
            >
              {t('cancel', 'admin-common')}
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
                {viewDeletedTab ? t('admin_hard_delete', 'customers') : t('delete_confirmation_title', 'customers')}
              </DialogTitle>
            </div>
            <DialogDescription>
              {viewDeletedTab ? t('admin_hard_delete_warning_description', 'customers') : t('admin_confirm_delete_description', 'customers')}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-white rounded-lg p-4 my-2">
            <p className="text-sm text-gray-600 leading-relaxed">
              {viewDeletedTab ?
                t('delete_confirmation_message_hard', 'customers') :
                t('delete_confirmation_message_soft', 'customers')
              }
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
              {isSubmitting ? t('processing') : viewDeletedTab ? t('admin_hard_delete', 'customers') : t('confirm_delete_button', 'customers')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmCustomer(null)}
              className="flex-1"
            >
              {t('cancel', 'admin-common')}
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

export default function CustomersAdmin() {
  return (
    <AdminLayout>
      <CustomersAdminContent />
    </AdminLayout>
  );
}
