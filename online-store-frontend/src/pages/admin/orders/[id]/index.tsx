import { useRouter } from 'next/router';
import { useTranslation } from '../../../../lib/i18n';
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
  const { t } = useTranslation();

  if (!id || typeof id !== 'string') {
    return <div>{t('loading', 'admin')}</div>;
  }

  return <OrderDetail orderId={id} />;
}

export default withAdminLayout(OrderDetailContent, {
  permission: 'manage:orders',
  featureName: 'Order Details',
});
