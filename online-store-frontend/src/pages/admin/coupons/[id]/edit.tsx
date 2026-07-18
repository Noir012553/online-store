import { useRouter } from 'next/router';
import { withAdminLayout } from '../../../../components/admin/withAdminLayout';
import { CouponForm } from '../../../../components/admin/coupons/CouponForm';

export const getServerSideProps = async () => {
  return { props: {} };
};

function EditCouponContent() {
  const router = useRouter();
  const { id } = router.query;

  if (!id || typeof id !== 'string') {
    return <div>Loading...</div>;
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
