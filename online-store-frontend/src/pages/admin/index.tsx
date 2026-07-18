import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useLanguage } from '../../lib/i18n';
import { withAdminLayout } from '../../components/admin/withAdminLayout';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

const AdminIndexPageContent = () => {
  const router = useRouter();
  const { t } = useLanguage();

  useEffect(() => {
    router.push('/admin/dashboard');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-full">
      <p>{t('loading_message')}</p>
    </div>
  );
};

export default withAdminLayout(AdminIndexPageContent, {
  permission: 'admin',
  featureName: 'Admin',
});
