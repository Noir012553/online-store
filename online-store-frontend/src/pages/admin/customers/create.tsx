import { useRouter } from 'next/router';
import { withAdminLayout } from '../../../components/admin/withAdminLayout';
import { CustomerForm } from '../../../components/admin/customers/CustomerForm';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

function CreateCustomerPage() {
  const router = useRouter();

  return (
    <CustomerForm
      mode="create"
      onSuccess={() => router.push('/admin/customers')}
      onCancel={() => router.push('/admin/customers')}
    />
  );
}

export default withAdminLayout(CreateCustomerPage, {
  permission: "manage:customers",
  featureName: "Create Customer"
});
