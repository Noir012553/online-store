import React from 'react';
import { useAuth } from '../../lib/context/AuthContext';
import { Shield, Lock, User } from 'lucide-react';

export const RoleBadge: React.FC = () => {
  const { user } = useAuth();

  if (!user) return null;

  const roleConfig = {
    'super-admin': {
      label: 'Super Admin',
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-800',
      borderColor: 'border-purple-300',
      icon: Shield,
      description: 'Full access to all features',
    },
    'admin': {
      label: 'Admin',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-800',
      borderColor: 'border-blue-300',
      icon: Lock,
      description: 'Can manage core features',
    },
    'user': {
      label: 'User',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-800',
      borderColor: 'border-gray-300',
      icon: User,
      description: 'Limited access',
    },
  };

  const config = roleConfig[user.role] || roleConfig.user;
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${config.bgColor} ${config.borderColor}`}
      title={config.description}
    >
      <Icon className={`w-4 h-4 ${config.textColor}`} />
      <span className={`text-xs font-semibold ${config.textColor}`}>
        {config.label}
      </span>
    </div>
  );
};
