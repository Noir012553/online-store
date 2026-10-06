import { useRouter } from 'next/router';
import { useTranslation } from '../../../../lib/i18n';
import { withAdminLayout } from '../../../../components/admin/withAdminLayout';
import { CouponForm } from '../../../../components/admin/coupons/CouponForm';

export const getServerSideProps = async () => {
  return { props: {} };
};

function EditCouponContent() {
  const router = useRouter();
  const { id } = router.query;
  const { t } = useTranslation();

  if (!id || typeof id !== 'string') {
    return <div>{t('loading', 'admin')}</div>;
  }

  return (
    <CouponForm
      mode="edit"
      couponId={id}
      onSuccess={() => router.push('/admin/coupons')}
      onCancel={() => router.push('/admin/coupons')}
    />
  );
}

export default withAdminLayout(EditCouponContent, {
  permission: 'manage:coupons',
  featureName: 'Edit Coupon',
});
