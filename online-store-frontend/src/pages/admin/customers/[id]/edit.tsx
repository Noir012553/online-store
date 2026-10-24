import { useRouter } from 'next/router';
import { useTranslation } from '../../../../lib/i18n';
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
  const { t } = useTranslation();

  if (!id || typeof id !== 'string') {
    return <div>{t('loading', 'admin')}</div>;
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
