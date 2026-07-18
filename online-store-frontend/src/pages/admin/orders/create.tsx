import { useRouter } from 'next/router';
import { withAdminLayout } from '../../../components/admin/withAdminLayout';
import { OrderForm } from '../../../components/admin/orders/OrderForm';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

function CreateOrderPage() {
  const router = useRouter();

  return (
    <OrderForm
      mode="create"
      onSuccess={() => router.push('/admin/orders')}
      onCancel={() => router.push('/admin/orders')}
    />
  );
}

export default withAdminLayout(CreateOrderPage, {
  permission: "manage:orders",
  featureName: "Create Order"
});
