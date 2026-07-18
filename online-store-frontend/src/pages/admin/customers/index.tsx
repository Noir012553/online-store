import { withAdminLayout } from '../../../components/admin/withAdminLayout';
import { CustomersList } from '../../../components/admin/customers/CustomersList';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

function CustomersPage() {
  return (
    <CustomersList />
  );
}

export default withAdminLayout(CustomersPage, {
  permission: "manage:customers",
  featureName: "Customers Management"
});
