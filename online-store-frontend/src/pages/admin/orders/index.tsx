import { withAdminLayout } from '../../../components/admin/withAdminLayout';
import { OrdersList } from '../../../components/admin/orders/OrdersList';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

function OrdersPage() {
  return (
    <OrdersList />
  );
}

export default withAdminLayout(OrdersPage, {
  permission: "manage:orders",
  featureName: "Orders Management"
});
