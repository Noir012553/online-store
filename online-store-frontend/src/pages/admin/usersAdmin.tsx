import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Search, Eye, Pencil, Trash2, RotateCcw, AlertCircle, CheckCircle2, Users, Shield, X, Copy } from "lucide-react";
import { formatDate } from "../../lib/utils";
import { apiCall } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import { Badge } from "../../components/ui/badge";
import { toast } from "sonner";
import { withAdminLayout } from "../../components/admin/withAdminLayout";
import { Pagination } from "../../components/admin/Pagination";
import { PermissionDenied } from "../../components/admin/PermissionDenied";
import { useAuth } from "../../lib/context/AuthContext";
import { useTranslation } from '@/lib/i18n';

interface User {
  _id: string;
  username: string;
  email: string;
  name?: string;
  phone?: string;
  address?: string;
  role: 'user' | 'admin' | 'super-admin';
  isEmailVerified?: boolean;
  createdAt: string;
  updatedAt?: string;
}

function UsersAdminContent() {
  const { user: currentUser } = useAuth();
  const { t, loadNamespace, locale } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);
  const [users, setUsers] = useState<User[]>([]);
  const [deletedUsers, setDeletedUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [deletedCurrentPage, setDeletedCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deletedTotalPages, setDeletedTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null);
  const [hardDeleteConfirmUser, setHardDeleteConfirmUser] = useState<User | null>(null);
  const [viewDeletedTab, setViewDeletedTab] = useState(false);
  const itemsPerPage = 10;

  // Fetch users
  useEffect(() => {
    if (viewDeletedTab) {
      fetchDeletedUsers();
    } else {
      fetchUsers();
    }
  }, [currentPage, deletedCurrentPage, viewDeletedTab, searchQuery, filterRole, locale]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        pageNumber: String(currentPage),
        pageSize: String(itemsPerPage),
        ...(searchQuery && { keyword: searchQuery }),
        lang: locale,
      });

      const response = await apiCall(`/users?${params.toString()}`, {
        method: 'GET',
      });
      
      setUsers(response.users || []);
      setTotalPages(response.pages || 1);
    } catch (error) {
      toast.error(t('error_load_data'));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDeletedUsers = async () => {
    try {
      setIsLoading(true);
      const response = await apiCall(`/users?pageNumber=${deletedCurrentPage}&pageSize=${itemsPerPage}&deleted=true&lang=${locale}`, {
        method: 'GET',
      });
      
      setDeletedUsers(response.users || []);
      setDeletedTotalPages(response.pages || 1);
    } catch (error) {
      toast.error(t('error_load_data'));
    } finally {
      setIsLoading(false);
    }
  };

  const getFilteredUsers = () => {
    const listToFilter = viewDeletedTab ? deletedUsers : users;
    if (filterRole === "all") return listToFilter;
    return listToFilter.filter(u => u.role === filterRole);
  };

  const handleOpenEditDialog = (user: User) => {
    // Navigate to edit page instead of opening modal
    router.push(`/admin/editUser/${user._id}`);
  };


  const handleDeleteUser = async (userToDelete: User) => {
    setDeleteConfirmUser(userToDelete);
  };

  const confirmDeleteUser = async () => {
    if (!deleteConfirmUser) return;

    try {
      await apiCall(`/users/${deleteConfirmUser._id}?lang=${locale}`, {
        method: 'DELETE',
      });

      toast.success(t('user_deleted_success'));
      setDeleteConfirmUser(null);
      
      // Refresh users list
      if (viewDeletedTab) {
        fetchDeletedUsers();
      } else {
        fetchUsers();
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleRestoreUser = async (userToRestore: User) => {
    try {
      await apiCall(`/users/${userToRestore._id}/restore?lang=${locale}`, {
        method: 'PUT',
      });

      toast.success(t('user_restored_success'));
      setDeletedCurrentPage(1);
      fetchDeletedUsers();
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleHardDeleteUser = async (userToHardDelete: User) => {
    try {
      await apiCall(`/users/${userToHardDelete._id}/hard?lang=${locale}`, {
        method: 'DELETE',
      });

      toast.success(t('user_deleted_permanently'));
      setDeletedCurrentPage(1);
      fetchDeletedUsers();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'super-admin':
        return 'bg-red-100 text-red-800';
      case 'admin':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'super-admin':
        return t('role_super_admin');
      case 'admin':
        return t('role_admin');
      default:
        return t('role_user');
    }
  };

  const filteredUsers = getFilteredUsers();
  const displayedUsers = filteredUsers.slice(0, itemsPerPage);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">{t('users')}</h1>
        <div className="flex gap-2 items-center">
          {!viewDeletedTab && <Badge className="bg-blue-600 text-white">{users.length} {t('users_count')}</Badge>}
          {!viewDeletedTab && (
            <Button
              onClick={() => router.push('/admin/createUser')}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {t('add_user')}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => {
            setViewDeletedTab(false);
            setCurrentPage(1);
            setFilterRole("all");
            setSearchQuery("");
          }}
          className={`px-4 py-2 font-medium ${!viewDeletedTab ? 'border-b-2 border-red-600 text-red-600' : 'text-gray-600'}`}
        >
          {t('active_users')} ({users.length})
        </button>
        <button
          onClick={() => {
            setViewDeletedTab(true);
            setDeletedCurrentPage(1);
          }}
          className={`px-4 py-2 font-medium ${viewDeletedTab ? 'border-b-2 border-red-600 text-red-600' : 'text-gray-600'}`}
        >
          {t('deleted_users')} ({deletedUsers.length})
        </button>
      </div>

      {/* Search & Filter */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
          <Input
            placeholder={t('search_user')}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10"
          />
        </div>

        {!viewDeletedTab && (
          <select value={filterRole} onChange={(event) => {
            setFilterRole(event.target.value);
            setCurrentPage(1);
          }} className="border-input flex h-9 w-full rounded-md border bg-input-background px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50">
            <option value="all">{t('all_roles')}</option>
            <option value="user">{t('role_user')}</option>
            <option value="admin">{t('role_admin')}</option>
            <option value="super-admin">{t('role_super_admin')}</option>
          </select>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {isLoading ? (
        <div className="p-8 text-center text-gray-500">{t('loading')}</div>
      ) : displayedUsers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {t('no_users_found')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t('email_label')}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t('username')}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t('role')}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t('verified')}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t('joined_date')}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayedUsers.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="flex items-center gap-2">
                        <span>{user.email}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(user.email);
                            toast.success(t('copied_to_clipboard'));
                          }}
                          className="text-gray-400 hover:text-gray-600"
                          title={t('copy_email')}
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{user.username}</td>
                    <td className="px-6 py-4 text-sm">
                      <Badge className={getRoleBadgeColor(user.role)}>
                        {getRoleLabel(user.role)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {user.isEmailVerified ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="w-4 h-4" />
                          {t('verified')}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-orange-600">
                          <AlertCircle className="w-4 h-4" />
                          {t('unverified')}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(user.createdAt, locale)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        {!viewDeletedTab ? (
                          <>
                            <button
                              onClick={() => handleOpenEditDialog(user)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                              title={t('edit')}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded"
                              title={t('delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleRestoreUser(user)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded"
                              title={t('restore')}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setHardDeleteConfirmUser(user)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded"
                              title={t('delete_permanently')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {displayedUsers.length > 0 && (
        <Pagination
          currentPage={viewDeletedTab ? deletedCurrentPage : currentPage}
          totalPages={viewDeletedTab ? deletedTotalPages : totalPages}
          onPageChange={(page) => {
            if (viewDeletedTab) {
              setDeletedCurrentPage(page);
            } else {
              setCurrentPage(page);
            }
          }}
        />
      )}

      {/* Soft Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmUser} onOpenChange={() => setDeleteConfirmUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              {t('confirm_delete_title')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-gray-700">
              {t('confirm_delete_user_message')}
              <strong>{deleteConfirmUser?.email}</strong>?
            </p>
            <p className="text-sm text-gray-600">
              {t('delete_user_warning')}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmUser(null)}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={confirmDeleteUser}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hard Delete Confirmation Dialog */}
      <Dialog open={!!hardDeleteConfirmUser} onOpenChange={() => setHardDeleteConfirmUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              {t('confirm_delete_permanently')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-gray-700">
              {t('confirm_hard_delete_message')}
              <strong>{hardDeleteConfirmUser?.email}</strong>?
            </p>
            <p className="text-sm text-red-600 font-medium">
              ⚠️ {t('hard_delete_warning')}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHardDeleteConfirmUser(null)}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={() => {
                if (hardDeleteConfirmUser) {
                  handleHardDeleteUser(hardDeleteConfirmUser);
                  setHardDeleteConfirmUser(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('delete_permanently')}
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

export default withAdminLayout(UsersAdminContent, {
  permission: 'manage:users',
  featureName: 'User Management',
});
