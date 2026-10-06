import { useRouter } from 'next/router';
import { useTranslation } from '../../../../lib/i18n';
import { withAdminLayout } from '../../../../components/admin/withAdminLayout';
import { CustomerDetail } from '../../../../components/admin/customers/CustomerDetail';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

const CustomerDetailPageContent = () => {
  const router = useRouter();
  const { id } = router.query;
  const { t } = useTranslation();

  if (!id || typeof id !== 'string') {
    return <div>{t('loading', 'admin')}</div>;
  }

  return <CustomerDetail customerId={id} />;
};

export default withAdminLayout(CustomerDetailPageContent, {
  permission: 'manage:customers',
  featureName: 'Customer Details'
});
