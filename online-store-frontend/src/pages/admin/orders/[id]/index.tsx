import { useRouter } from 'next/router';
import { withAdminLayout } from '../../../../components/admin/withAdminLayout';
import { OrderDetail } from '../../../../components/admin/orders/OrderDetail';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

function OrderDetailContent() {
  const router = useRouter();
  const { id } = router.query;

  if (!id || typeof id !== 'string') {
    return <div>Loading...</div>;
  }

  return <OrderDetail orderId={id} />;
}

export default withAdminLayout(OrderDetailContent, {
  permission: 'manage:orders',
  featureName: 'Order Details',
});
