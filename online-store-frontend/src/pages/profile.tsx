import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Mail, Phone, MapPin, Lock, Edit2, Check, X, ArrowLeft, Camera } from 'lucide-react';
import { authAPI, getAuthToken } from '../lib/api';
import { getImageUrl } from '../lib/utils';
import { useTranslation } from '../lib/i18n';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};


// Simple API wrapper for avatar upload
const uploadAvatar = async (file: File) => {
  const formData = new FormData();
  formData.append('avatar', file);

  const token = getAuthToken();
  const response = await fetch('/api/users/avatar', {
    method: 'PUT',
    body: formData,
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'profile_upload_error');
  }

  return response.json();
};

export default function Profile() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { t, loadNamespace } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });
  const [changePasswordData, setChangePasswordData] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [changePasswordErrors, setChangePasswordErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadNamespace('profile');
  }, [loadNamespace]);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || '',
      });
      if (user.profileImage) {
        // getImageUrl returns either:
        // - /uploads/... (proxied through Next.js)
        // - https://... (external image)
        // - undefined (invalid)
        const imageUrl = getImageUrl(user.profileImage);
        setAvatarPreview(imageUrl || '');
      }
    }
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-md">
          <div className="mb-8">
            <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto bg-gray-200 rounded-full flex items-center justify-center mb-6">
              <Lock className="w-10 h-10 sm:w-12 sm:h-12 text-gray-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">{t('profile_login_required', 'profile')}</h1>
            <p className="text-gray-600 text-sm sm:text-base mb-8">
              {t('profile_login_desc', 'profile')}
            </p>
          </div>
          <Button
            onClick={() => router.push(`/login?from=${encodeURIComponent(router.asPath)}`)}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded-lg transition-colors"
          >
            {t('profile_go_to_login', 'profile')}
          </Button>
        </div>
      </div>
    );
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('max_file_size_error', 'profile'));
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error(t('invalid_image_error', 'profile'));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    setIsUploadingAvatar(true);
    try {
      const uploadResponse = await uploadAvatar(file);

      // Update user context with new profile image
      if (uploadResponse.profileImage) {
        // Backend returns relative path (e.g., /uploads/...)
        // Store it directly - getImageUrl will handle it when needed
        const imageUrl = getImageUrl(uploadResponse.profileImage);
        const updatedUser = {
          ...user,
          profileImage: imageUrl,
        };
        // Update localStorage
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }

      toast.success(t('profile_avatar_success', 'profile'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('profile_avatar_error', 'profile'));
      setAvatarPreview(user?.profileImage || '');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await authAPI.updateProfile({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
      });
      toast.success(t('profile_update_success', 'profile'));
      setIsEditing(false);
    } catch (error) {
      toast.error(t('profile_update_error', 'profile'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    const errors: Record<string, string> = {};

    if (!changePasswordData.newPassword) {
      errors.newPassword = t('profile_password_required', 'profile');
    } else if (changePasswordData.newPassword.length < 6) {
      errors.newPassword = t('profile_password_min_length', 'profile');
    }

    if (!changePasswordData.confirmPassword) {
      errors.confirmPassword = t('profile_confirm_password_required', 'profile');
    } else if (changePasswordData.newPassword !== changePasswordData.confirmPassword) {
      errors.confirmPassword = t('profile_passwords_not_match', 'profile');
    }

    if (Object.keys(errors).length > 0) {
      setChangePasswordErrors(errors);
      return;
    }

    setIsChangingPassword(true);
    try {
      await authAPI.changePassword(changePasswordData.newPassword);
      toast.success(t('profile_password_success', 'profile'));
      setShowChangePasswordModal(false);
      setChangePasswordData({ newPassword: '', confirmPassword: '' });
      setChangePasswordErrors({});
      setTimeout(() => {
        router.push("/login");
      }, 1000);
    } catch (error) {
      toast.error(t('profile_password_error', 'profile'));
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-white py-6 sm:py-8 md:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          {isAdmin && (
            <button
              onClick={() => router.push('/admin/dashboard')}
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{t('profile_back_to_dashboard', 'profile')}</span>
              <span className="sm:hidden">{t('back', 'profile')}</span>
            </button>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className={`bg-gradient-to-r ${isAdmin ? 'from-red-600 to-red-700' : 'from-gray-900 to-gray-800'} px-4 sm:px-6 md:px-8 py-8 sm:py-10 md:py-12`}>
              <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 sm:gap-6">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
                  <div className="relative group">
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt={user.name}
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover shadow-lg border-4 border-white"
                      />
                    ) : (
                      <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center shadow-lg border-4 border-white ${isAdmin ? 'bg-white' : 'bg-red-600'}`}>
                        <span className={`text-3xl sm:text-4xl font-bold ${isAdmin ? 'text-red-600' : 'text-white'}`}>{user.name[0]?.toUpperCase()}</span>
                      </div>
                    )}

                    <label htmlFor="avatar-upload" className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                      <Camera className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                    </label>
                    <input
                      id="avatar-upload"
                      name="avatar"
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      disabled={isUploadingAvatar}
                      className="hidden"
                    />
                  </div>
                  <div className="text-white text-center sm:text-left flex-grow">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-1 sm:mb-2">{user.name}</h1>
                    <p className={`${isAdmin ? 'text-red-100' : 'text-gray-300'} text-sm sm:text-base font-medium`}>
                      {isAdmin ? t('profile_admin_role', 'profile') : t('profile_customer_role', 'profile')}
                    </p>
                  </div>
                </div>

                {!isEditing && (
                  <Button
                    onClick={() => setIsEditing(true)}
                    className="bg-white text-gray-900 hover:bg-gray-100 font-medium px-4 sm:px-6 w-full sm:w-auto flex items-center justify-center gap-2 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('profile_edit', 'profile')}</span>
                    <span className="sm:hidden">{t('profile_edit', 'profile')}</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6 md:p-8">
              {isEditing ? (
                <div>
                  <h2 className="text-lg sm:text-2xl font-semibold text-gray-900 mb-6 pb-3 border-b-2 border-red-600">
                    {t('profile_edit', 'profile')}
                  </h2>

                  <div className="space-y-4 sm:space-y-5 mb-8">
                    <div>
                      <Label htmlFor="name" className="text-gray-700 font-medium text-sm">{t('profile_name', 'profile')}</Label>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        autoComplete="name"
                        className="mt-2 border-gray-300 focus:border-red-500 focus:ring-red-500"
                        placeholder={t('name_placeholder', 'profile')}
                      />
                    </div>

                    <div>
                      <Label htmlFor="email" className="text-gray-700 font-medium text-sm flex items-center gap-2">
                        <Mail className="w-4 h-4 text-red-600" />
                        {t('profile_email', 'profile')}
                      </Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        autoComplete="email"
                        className="mt-2 border-gray-300 focus:border-red-500 focus:ring-red-500"
                        placeholder={t('profile_email_placeholder', 'profile')}
                      />
                    </div>

                    <div>
                      <Label htmlFor="phone" className="text-gray-700 font-medium text-sm flex items-center gap-2">
                        <Phone className="w-4 h-4 text-red-600" />
                        {t('profile_phone', 'profile')}
                      </Label>
                      <Input
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        autoComplete="tel"
                        className="mt-2 border-gray-300 focus:border-red-500 focus:ring-red-500"
                        placeholder={t('profile_phone_placeholder', 'profile')}
                      />
                    </div>

                    {!isAdmin && (
                      <div>
                        <Label htmlFor="address" className="text-gray-700 font-medium text-sm flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-red-600" />
                          {t('profile_address', 'profile')}
                        </Label>
                        <Input
                          id="address"
                          name="address"
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          autoComplete="street-address"
                          className="mt-2 border-gray-300 focus:border-red-500 focus:ring-red-500"
                          placeholder={t('full_address_placeholder', 'profile')}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      {isSaving ? t('profile_saving', 'profile') : t('profile_save', 'profile')}
                    </Button>
                    <Button
                      onClick={() => setIsEditing(false)}
                      variant="outline"
                      className="flex-1 text-gray-700 border-gray-300 hover:bg-white font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      {t('profile_cancel', 'profile')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                  <div className="lg:col-span-2">
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-6 pb-3 border-b-2 border-red-600">
                      {t('profile_title', 'profile')}
                    </h2>

                    <div className="space-y-4 sm:space-y-5">
                      <div>
                        <span className="text-gray-700 font-medium text-sm block mb-2">{t('profile_name', 'profile')}</span>
                        <div className="flex items-center gap-3 mt-2 p-3 sm:p-4 bg-white rounded-lg border border-gray-200">
                          <span className="text-gray-900 font-medium">{formData.name || t('not_updated', 'profile')}</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-gray-700 font-medium text-sm flex items-center gap-2 mb-2">
                          <Mail className="w-4 h-4 text-red-600" />
                          {t('profile_email', 'profile')}
                        </span>
                        <div className="flex items-center gap-3 mt-2 p-3 sm:p-4 bg-white rounded-lg border border-gray-200">
                          <span className="text-gray-900 font-medium break-all">{formData.email || t('not_updated', 'profile')}</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-gray-700 font-medium text-sm flex items-center gap-2 mb-2">
                          <Phone className="w-4 h-4 text-red-600" />
                          {t('profile_phone', 'profile')}
                        </span>
                        <div className="flex items-center gap-3 mt-2 p-3 sm:p-4 bg-white rounded-lg border border-gray-200">
                          <span className="text-gray-900 font-medium">{formData.phone || t('not_updated', 'profile')}</span>
                        </div>
                      </div>

                      {!isAdmin && (
                        <div>
                          <span className="text-gray-700 font-medium text-sm flex items-center gap-2 mb-2">
                            <MapPin className="w-4 h-4 text-red-600" />
                            {t('profile_address', 'profile')}
                          </span>
                          <div className="flex items-center gap-3 mt-2 p-3 sm:p-4 bg-white rounded-lg border border-gray-200">
                            <span className="text-gray-900 font-medium">{formData.address || t('not_updated', 'profile')}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-6 pb-3 border-b-2 border-red-600">
                      {isAdmin ? t('profile_permissions', 'profile') : t('profile_account', 'profile')}
                    </h2>

                    {isAdmin ? (
                      <div className="space-y-3">
                        {[
                          { key: 'permission_manage_products' },
                          { key: 'permission_manage_orders' },
                          { key: 'permission_manage_customers' },
                          { key: 'permission_view_dashboard' },
                        ].map((permission) => (
                          <div key={permission.key} className="flex items-center gap-3 p-3 sm:p-4 bg-green-50 border border-green-200 rounded-lg hover:shadow-md transition-shadow">
                            <span className="text-green-600 font-bold">✓</span>
                            <p className="text-green-800 font-medium text-sm sm:text-base">{t(permission.key, 'profile')}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-blue-900 font-semibold text-sm sm:text-base">
                            {t('profile_status', 'profile')}: <span className="text-green-600">{t('profile_active', 'profile')}</span>
                          </p>
                        </div>
                        <div className="p-4 bg-white border border-gray-200 rounded-lg">
                          <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">{t('profile_joined_since', 'profile')}</p>
                          <p className="text-gray-900 font-semibold text-sm sm:text-base">15 {t('spec_value_month', 'profile')} 6 {t('admin_time_year', 'profile')} 2023</p>
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={() => setShowChangePasswordModal(true)}
                      variant="outline"
                      className="w-full flex items-center justify-center gap-2 mt-6 text-red-600 border-red-200 hover:bg-red-50 font-medium transition-colors"
                    >
                      <Lock className="w-4 h-4" />
                      <span className="hidden sm:inline">{t('profile_change_password', 'profile')}</span>
                      <span className="sm:hidden">{t('profile_change_password', 'profile')}</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 sm:px-8 py-6 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <Lock className="w-6 h-6 text-white" />
                <h2 className="text-xl sm:text-2xl font-bold text-white">{t('profile_change_password', 'profile')}</h2>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              <div className="space-y-5">
                <div>
                  <Label htmlFor="new-password-modal" className="text-gray-700 font-medium text-sm">{t('profile_new_password', 'profile')}</Label>
                  <Input
                    id="new-password-modal"
                    name="newPassword"
                    type="password"
                    placeholder={t('profile_password_min_length', 'profile')}
                    value={changePasswordData.newPassword}
                    onChange={(e) => {
                      setChangePasswordData({ ...changePasswordData, newPassword: e.target.value });
                      if (changePasswordErrors.newPassword) {
                        setChangePasswordErrors({ ...changePasswordErrors, newPassword: '' });
                      }
                    }}
                    autoComplete="new-password"
                    className={`mt-2 border-gray-300 focus:border-red-500 focus:ring-red-500 ${
                      changePasswordErrors.newPassword ? 'border-red-500 focus:border-red-600' : ''
                    }`}
                  />
                  {changePasswordErrors.newPassword && (
                    <p className="text-red-500 text-xs sm:text-sm mt-2 font-medium">
                      {changePasswordErrors.newPassword}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="confirm-password-modal" className="text-gray-700 font-medium text-sm">{t('profile_confirm_password', 'profile')}</Label>
                  <Input
                    id="confirm-password-modal"
                    name="confirmPassword"
                    type="password"
                    placeholder={t('confirm_password_placeholder', 'profile')}
                    value={changePasswordData.confirmPassword}
                    onChange={(e) => {
                      setChangePasswordData({ ...changePasswordData, confirmPassword: e.target.value });
                      if (changePasswordErrors.confirmPassword) {
                        setChangePasswordErrors({ ...changePasswordErrors, confirmPassword: '' });
                      }
                    }}
                    autoComplete="new-password"
                    className={`mt-2 border-gray-300 focus:border-red-500 focus:ring-red-500 ${
                      changePasswordErrors.confirmPassword ? 'border-red-500 focus:border-red-600' : ''
                    }`}
                  />
                  {changePasswordErrors.confirmPassword && (
                    <p className="text-red-500 text-xs sm:text-sm mt-2 font-medium">
                      {changePasswordErrors.confirmPassword}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 mt-8">
                <Button
                  onClick={() => {
                    setShowChangePasswordModal(false);
                    setChangePasswordData({ newPassword: '', confirmPassword: '' });
                    setChangePasswordErrors({});
                  }}
                  variant="outline"
                  className="flex-1 text-gray-700 border-gray-300 hover:bg-white font-medium transition-colors"
                >
                  {t('profile_cancel', 'profile')}
                </Button>
                <Button
                  onClick={handleChangePassword}
                  disabled={isChangingPassword}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isChangingPassword ? t('processing', 'profile') : t('profile_change_password', 'profile')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
