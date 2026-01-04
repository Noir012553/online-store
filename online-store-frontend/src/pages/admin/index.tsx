import { useEffect } from 'react';
import { useRouter } from 'next/router';
import AdminLayout from './adminLayout';

const AdminIndexPage = () => {
  const router = useRouter();

  useEffect(() => {
    // Chuyển hướng đến trang admin dashboard khi truy cập /admin
    router.push('/admin/dashboard');
  }, [router]);

  return (
    <AdminLayout>
      <div>
        <p>Đang chuyển hướng đến trang dashboard...</p>
      </div>
    </AdminLayout>
  );
};

export default AdminIndexPage;
