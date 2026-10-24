import { useLanguage } from '../../../lib/i18n';
import { withAdminLayout } from '../../../components/admin/withAdminLayout';
import { CouponsList } from '../../../components/admin/coupons/CouponsList';

export const getServerSideProps = async () => {
  return { props: {} };
};

function CouponsPage() {
  const { t } = useLanguage();

  return (
    <CouponsList
      title={t('coupon_admin_title')}
      description={t('coupon_admin_description')}
      mode="all"
    />
  );
}

export default withAdminLayout(CouponsPage, {
  permission: "manage:coupons",
  featureName: "Coupons Management"
});
