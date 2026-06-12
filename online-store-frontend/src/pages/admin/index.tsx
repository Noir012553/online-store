import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useLanguage } from '../../lib/i18n';
import AdminLayout from '../../components/admin/_AdminLayout';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

const AdminIndexPage = () => {
  const router = useRouter();
  const { t } = useLanguage();

  useEffect(() => {
    // Chuyển hướng đến trang admin dashboard khi truy cập /admin
    router.push('/admin/dashboard');
  }, [router]);

  return (
    <AdminLayout>
      <div className="flex items-center justify-center h-full">
        <p>{t('loading_message', 'admin-common')}</p>
      </div>
    </AdminLayout>
  );
};

export default AdminIndexPage;
