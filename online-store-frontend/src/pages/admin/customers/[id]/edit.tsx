import { useRouter } from 'next/router';
import { withAdminLayout } from '../../../../components/admin/withAdminLayout';
import { CustomerForm } from '../../../../components/admin/customers/CustomerForm';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

const EditCustomerPageContent = () => {
  const router = useRouter();
  const { id } = router.query;

  if (!id || typeof id !== 'string') {
    return <div>Loading...</div>;
  }

  return (
    <CustomerForm
      mode="edit"
      customerId={id}
      onSuccess={() => router.push(`/admin/customers/${id}`)}
      onCancel={() => router.push(`/admin/customers/${id}`)}
    />
  );
};

export default withAdminLayout(EditCustomerPageContent, {
  permission: 'manage:customers',
  featureName: 'Edit Customer'
});
