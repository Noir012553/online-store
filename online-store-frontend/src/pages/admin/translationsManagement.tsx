import AdminLayout from '../../components/admin/_AdminLayout';
import TranslationsManagementPage from '../../components/admin/TranslationsManagementPage';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

const TranslationsAdminPage = () => {
  return (
    <AdminLayout>
      <TranslationsManagementPage />
    </AdminLayout>
  );
};

export default TranslationsAdminPage;
