import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Search, Eye, Mail, Phone, Plus, Pencil, Trash2, RotateCcw, AlertCircle } from 'lucide-react';
import { formatDate } from '../../../lib/utils';
import { customerAPI } from '../../../lib/api';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { joinAdminRoom, leaveAdminRoom, onCustomerCreated, onCustomerUpdated, onCustomerDeleted, onCustomerRestored, offEvent } from '../../../lib/socket';
import { useAuth } from '../../../lib/context/AuthContext';
import { useTranslation, useLanguage } from '../../../lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../../ui/dialog';
import { toast } from 'sonner';
import { Pagination } from '../Pagination';

interface Customer {
  _id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  totalOrders?: number;
  totalSpent?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export function CustomersList() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, loadNamespace } = useTranslation();
  const { locale } = useLanguage();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deletedCustomers, setDeletedCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletedCurrentPage, setDeletedCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deleteConfirmCustomer, setDeleteConfirmCustomer] = useState<Customer | null>(null);
  const [viewDeletedTab, setViewDeletedTab] = useState(false);
  const itemsPerPage = 10;

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  const fetchCustomers = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await customerAPI.getCustomers(1, 100, undefined, locale);
      const customersList = response.customers || [];
      setCustomers(Array.isArray(customersList) ? customersList : []);
    } catch (error) {
      setCustomers([]);
      toast.error(t('error_load_data', 'common'));
    } finally {
      setIsLoading(false);
    }
  }, [locale, t]);

  const fetchDeletedCustomers = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await customerAPI.getDeletedCustomers(deletedCurrentPage, locale);
      const customersList = response.customers || [];
      setDeletedCustomers(Array.isArray(customersList) ? customersList : []);
    } catch (error) {
      setDeletedCustomers([]);
      toast.error(t('error_load_data', 'common'));
    } finally {
      setIsLoading(false);
    }
  }, [deletedCurrentPage, locale, t]);

  useEffect(() => {
    if (viewDeletedTab) {
      fetchDeletedCustomers();
    } else {
      fetchCustomers();
    }
  }, [viewDeletedTab, fetchCustomers, fetchDeletedCustomers]);

  useEffect(() => {
    if (user) {
      joinAdminRoom({
        userId: user.id || user.email,
        role: user.role,
      });
    } else {
      joinAdminRoom();
    }

    const handleCustomerCreated = () => {
      fetchCustomers();
      toast.success(t('toast_new_customer', 'admin'));
    };

    const handleCustomerUpdated = () => {
      fetchCustomers();
      toast.info(t('toast_customer_updated', 'admin'));
    };

    const handleCustomerDeleted = () => {
      if (viewDeletedTab) {
        fetchDeletedCustomers();
      } else {
        fetchCustomers();
      }
      toast.info(t('toast_customer_deleted', 'admin'));
    };

    const handleCustomerRestored = () => {
      fetchCustomers();
      toast.success(t('toast_customer_restored', 'admin'));
    };

    onCustomerCreated(handleCustomerCreated);
    onCustomerUpdated(handleCustomerUpdated);
    onCustomerDeleted(handleCustomerDeleted);
    onCustomerRestored(handleCustomerRestored);

    return () => {
      leaveAdminRoom();
      offEvent('customer-created');
      offEvent('customer-updated');
      offEvent('customer-deleted');
      offEvent('customer-restored');
    };
  }, [user, viewDeletedTab, t, fetchCustomers, fetchDeletedCustomers]);

  const handleDeleteCustomer = async (customerId: string) => {
    try {
      setIsUpdating(true);
      await customerAPI.deleteCustomer(customerId);
      toast.success(t('toast_customer_deleted', 'admin'));
      setDeleteConfirmCustomer(null);
      if (viewDeletedTab) {
        await fetchDeletedCustomers();
      } else {
        await fetchCustomers();
      }
    } catch (error) {
      toast.error(t('error_delete_data', 'common'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRestoreCustomer = async (customerId: string) => {
    try {
      setIsUpdating(true);
      await customerAPI.restoreCustomer(customerId);
      toast.success(t('toast_customer_restored', 'admin'));
      await fetchDeletedCustomers();
    } catch (error) {
      toast.error(t('error_save_data', 'common'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleHardDeleteCustomer = async (customerId: string) => {
    try {
      setIsUpdating(true);
      await customerAPI.hardDeleteCustomer(customerId);
      await fetchDeletedCustomers();
      toast.success(t('toast_customer_deleted', 'admin'));
      setDeleteConfirmCustomer(null);
    } catch (error) {
      toast.error(t('error_delete_data', 'common'));
    } finally {
      setIsUpdating(false);
    }
  };

  const getCustomerName = (customer: Customer) => {
    if (customer.name) return customer.name;
    const firstName = customer.firstName || '';
    const lastName = customer.lastName || '';
    return (firstName + ' ' + lastName).trim() || t('customer_fallback', 'admin');
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
        <p>{t('loading', 'common')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1>{t('permission_manage_customers', 'admin')}</h1>
        {!viewDeletedTab && (
          <Button
            onClick={() => router.push('/admin/customers/create')}
            className="flex w-full items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            {t('admin_add_customer', 'admin')}
          </Button>
        )}
      </div>

      <div className="bg-white rounded-lg border mb-6">
        <div className="overflow-x-auto border-b">
          <div className="flex min-w-max gap-0">
            <button
              onClick={() => {
                setViewDeletedTab(false);
                setCurrentPage(1);
                setSearchQuery('');
              }}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                !viewDeletedTab
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('admin_active_customers', 'admin')}
            </button>
            <button
              onClick={() => {
                setViewDeletedTab(true);
                setDeletedCurrentPage(1);
                setSearchQuery('');
              }}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                viewDeletedTab
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('admin_deleted_customers', 'admin')}
            </button>
          </div>
        </div>

        <div className="p-6 border-b">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              id="customer-search"
              name="customer-search"
              placeholder={t('admin_search_customers_placeholder', 'admin')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              autoComplete="off"
            />
          </div>
        </div>

        {((viewDeletedTab && deletedCustomers.length === 0) || (!viewDeletedTab && customers.length === 0)) ? (
          <div className="p-12 text-center text-gray-500">
            <p>{viewDeletedTab ? t('admin_deleted_customers', 'admin') : t('no_customers_yet', 'admin')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-white">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_customer', 'admin')}</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">{t('contact', 'common')}</th>
                    <th className="hidden px-6 py-3 text-left text-xs uppercase md:table-cell">{t('admin_customer_address', 'admin')}</th>
                    <th className="hidden px-6 py-3 text-left text-xs uppercase lg:table-cell">{t('admin_join_date', 'admin')}</th>
                    <th className="px-6 py-3 text-right text-xs uppercase">{t('admin_actions', 'admin')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginatedCustomers.map((customer) => (
                    <tr key={customer._id}>
                      <td className="px-6 py-4">
                        <p className="font-medium">{getCustomerName(customer)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {customer.email && (
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="w-4 h-4 text-gray-400" />
                              <a href={`mailto:${customer.email}`} className="hover:text-blue-600">
                                {customer.email}
                              </a>
                            </div>
                          )}
                          {customer.phone && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="w-4 h-4 text-gray-400" />
                              <a href={`tel:${customer.phone}`} className="hover:text-blue-600">
                                {customer.phone}
                              </a>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="hidden px-6 py-4 md:table-cell">
                        <p className="max-w-xs text-sm">{customer.address || t('not_updated', 'common')}</p>
                      </td>
                      <td className="hidden px-6 py-4 lg:table-cell">
                        {customer.createdAt ? formatDate(new Date(customer.createdAt), locale) : t('not_updated', 'common')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {viewDeletedTab ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRestoreCustomer(customer._id)}
                                disabled={isUpdating}
                                title={t('admin_restore', 'admin')}
                              >
                                <RotateCcw className="w-4 h-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirmCustomer(customer)}
                                title={t('admin_hard_delete', 'admin')}
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push(`/admin/customers/${customer._id}`)}
                                title={t('view_details', 'common')}
                              >
                                <Eye className="w-4 h-4 text-blue-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push(`/admin/customers/${customer._id}/edit`)}
                                title={t('profile_edit', 'common')}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirmCustomer(customer)}
                                title={t('remove', 'common')}
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

      <Dialog open={!!deleteConfirmCustomer} onOpenChange={() => setDeleteConfirmCustomer(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md animate-in fade-in zoom-in-95 duration-200">
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
              {t('admin_customer_name', 'admin')}: <span className="font-semibold text-gray-900">{deleteConfirmCustomer ? getCustomerName(deleteConfirmCustomer) : 'N/A'}</span>
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
              disabled={isUpdating}
              className="bg-red-600 hover:bg-red-700 text-white flex-1"
            >
              {isUpdating ? t('loading', 'common') : viewDeletedTab ? t('admin_hard_delete', 'admin') : t('remove', 'common')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmCustomer(null)}
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
