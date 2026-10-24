import { useRouter } from 'next/router';
import { withAdminLayout } from '../../../components/admin/withAdminLayout';
import { CouponForm } from '../../../components/admin/coupons/CouponForm';

export const getServerSideProps = async () => {
  return { props: {} };
};

function CreateCouponPage() {
  const router = useRouter();

  return (
    <CouponForm
      mode="create"
      onSuccess={() => router.push('/admin/coupons')}
      onCancel={() => router.push('/admin/coupons')}
    />
  );
}

export default withAdminLayout(CreateCouponPage, {
  permission: "manage:coupons",
  featureName: "Create Coupon"
});
