import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { apiCall } from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../../components/ui/dialog";
import { toast } from "sonner";
import AdminLayout from "../../../components/admin/_AdminLayout";
import { useTranslation } from '@/lib/i18n';

interface FormData {
  email: string;
  username: string;
  role: 'user' | 'admin' | 'super-admin';
}

function EditUserContent() {
  const router = useRouter();
  const { id } = router.query;
  const { t, loadNamespace } = useTranslation();

  useEffect(() => {
    loadNamespace('users');
  }, [loadNamespace]);

  const [formData, setFormData] = useState<FormData>({
    email: '',
    username: '',
    role: 'user',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [successDialog, setSuccessDialog] = useState(false);
  const [updatedUserInfo, setUpdatedUserInfo] = useState<{ email: string; username: string } | null>(null);

  // Fetch user data on mount
  useEffect(() => {
    if (!id) return;

    const fetchUser = async () => {
      try {
        setIsLoading(true);
        const response = await apiCall(`/users/${id}`, {
          method: 'GET',
        });

        if (response.user) {
          setFormData({
            email: response.user.email,
            username: response.user.username,
            role: response.user.role,
          });
        }
      } catch (error: any) {
        toast.error(error.message || t('error_load_data'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, [id, t]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.username || formData.username.length < 3) {
      newErrors.username = t('username_min_length', 'users');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !id) {
      return;
    }

    setIsSubmitting(true);
    try {
      const updateData = {
        username: formData.username,
        role: formData.role,
      };

      const response = await apiCall(`/users/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      setUpdatedUserInfo({
        email: response.user?.email || formData.email,
        username: response.user?.username || formData.username,
      });
      setSuccessDialog(true);
    } catch (error: any) {
      toast.error(error.message || t('error_update_user', 'admin'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData({ ...formData, [field]: value });
    if (errors[field]) {
      const newErrors = { ...errors };
      delete newErrors[field];
      setErrors(newErrors);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>{t('loading', 'admin-common')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
          title={t('back', 'admin-common')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-3xl font-bold text-gray-900">
          {t('admin_edit_user', 'admin')}
        </h1>
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-lg border p-8 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email */}
          <div>
            <Label htmlFor="email" className="text-gray-700 font-medium">
              {t('email_label', 'users')} <span className="text-red-600">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              disabled
              className="mt-2 bg-gray-50"
            />
            <p className="mt-1 text-xs text-gray-500">
              {t('email_cannot_change', 'users')}
            </p>
          </div>

          {/* Username */}
          <div>
            <Label htmlFor="username" className="text-gray-700 font-medium">
              {t('username_label', 'users')} <span className="text-red-600">*</span>
            </Label>
            <Input
              id="username"
              type="text"
              placeholder={t('username_placeholder', 'users')}
              value={formData.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              className={`mt-2 ${errors.username ? 'border-red-500' : ''}`}
            />
            {errors.username && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.username}
              </p>
            )}
          </div>

          {/* Role */}
          <div>
            <Label htmlFor="role" className="text-gray-700 font-medium">
              {t('role_label', 'users')} <span className="text-red-600">*</span>
            </Label>
            <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value as any })}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">{t('user_role', 'users')}</SelectItem>
                <SelectItem value="admin">{t('admin_role', 'users')}</SelectItem>
                <SelectItem value="super-admin">{t('super_admin_role', 'users')}</SelectItem>
              </SelectContent>
            </Select>
            {formData.role !== 'user' && (
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-sm text-blue-800">
                  ⚠️ {t('admin_role_access_warning', 'users')}
                </p>
              </div>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              {t('cancel', 'admin-common')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isSubmitting ? t('saving', 'admin-common') : t('save_changes_button', 'admin')}
            </Button>
          </div>
        </form>
      </div>

      {/* Success Dialog */}
      <Dialog open={successDialog} onOpenChange={setSuccessDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('user_updated_success', 'admin')}</DialogTitle>
            <DialogDescription>
              {t('user_update_success_message', 'users')}
            </DialogDescription>
          </DialogHeader>

          {updatedUserInfo && (
            <div className="space-y-3 bg-gray-50 p-4 rounded">
              <div>
                <p className="text-sm text-gray-600">{t('email_label', 'users')}</p>
                <p className="font-medium text-gray-900">{updatedUserInfo.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">{t('username_label', 'users')}</p>
                <p className="font-medium text-gray-900">{updatedUserInfo.username}</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => {
                setSuccessDialog(false);
                router.push('/admin/usersAdmin');
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {t('admin_back_to_users_list', 'admin')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditUserPage() {
  return (
    <AdminLayout>
      <EditUserContent />
    </AdminLayout>
  );
}

// Disable static generation for this page since it requires user ID from params
export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default EditUserPage;
