import React from 'react';
import { useAuth } from '../../lib/context/AuthContext';
import { useTranslation } from '../../lib/i18n';
import { Shield, Lock, User } from 'lucide-react';

export const RoleBadge: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();

  if (!user) return null;

  const roleConfig = {
    'super-admin': {
      labelKey: 'role_super_admin',
      descriptionKey: 'role_super_admin_desc',
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-800',
      borderColor: 'border-purple-300',
      icon: Shield,
    },
    'admin': {
      labelKey: 'role_admin',
      descriptionKey: 'role_admin_desc',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-800',
      borderColor: 'border-blue-300',
      icon: Lock,
    },
    'user': {
      labelKey: 'role_user',
      descriptionKey: 'role_user_desc',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-800',
      borderColor: 'border-gray-300',
      icon: User,
    },
  };

  const config = roleConfig[user.role] || roleConfig.user;
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${config.bgColor} ${config.borderColor}`}
      title={t(config.descriptionKey, 'admin-users')}
    >
      <Icon className={`w-4 h-4 ${config.textColor}`} />
      <span className={`text-xs font-semibold ${config.textColor}`}>
        {t(config.labelKey, 'admin-users')}
      </span>
    </div>
  );
};
