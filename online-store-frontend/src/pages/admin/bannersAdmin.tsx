import AdminLayout from '../../components/admin/_AdminLayout';
import { BannerManagementPage } from '../../components/admin/BannerManagementPage';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default function BannersAdmin() {
  return (
    <AdminLayout>
      <BannerManagementPage />
    </AdminLayout>
  );
}
