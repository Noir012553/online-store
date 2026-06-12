import { useLanguage } from '../../lib/i18n';
import AdminLayout from '../../components/admin/_AdminLayout';
import CouponManagementPage from '../../components/admin/CouponManagementPage';

function CouponsAdminContent() {
  const { t } = useLanguage();

  return (
    <CouponManagementPage
      title={t('coupon_admin_title', 'admin-common')}
      description={t('coupon_admin_description', 'admin-common')}
      mode="all"
    />
  );
}

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default function CouponsAdmin() {
  return (
    <AdminLayout>
      <CouponsAdminContent />
    </AdminLayout>
  );
}
