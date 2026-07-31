import Link from 'next/link';
import { Button } from '../ui/button';
import { Shield, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../../lib/i18n';

interface PermissionDeniedProps {
  feature?: string;
  message?: string;
}

export const PermissionDenied: React.FC<PermissionDeniedProps> = ({
  feature,
  message,
}) => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6 flex justify-center">
          <div className="bg-red-100 p-4 rounded-full">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {t('access_denied', 'admin')}
        </h1>

        <p className="text-gray-600 mb-6">
          {message || t('permission_denied_message', 'admin')}
        </p>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
          <p className="text-sm text-red-700">
            {t('contact_admin_message', 'admin')}
          </p>
        </div>

        <Link href="/admin/dashboard">
          <Button className="w-full bg-red-600 hover:bg-red-700 flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t('back_to_dashboard', 'admin')}
          </Button>
        </Link>
      </div>
    </div>
  );
};
