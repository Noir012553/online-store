import { withAdminLayout } from '../../components/admin/withAdminLayout';
import TranslationsManagementPage from '../../components/admin/TranslationsManagementPage';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

const TranslationsAdminPageContent = () => {
  return <TranslationsManagementPage />;
};

export default withAdminLayout(TranslationsAdminPageContent, {
  permission: 'manage:translations',
  featureName: 'Translations Management',
});
