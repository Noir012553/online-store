import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { BannerManagementPage } from '../../components/admin/BannerManagementPage';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

function BannersAdminContent() {
  return <BannerManagementPage />;
}

export default withAdminLayout(BannersAdminContent, {
  permission: 'manage:banners',
  featureName: 'Banners Management',
});
