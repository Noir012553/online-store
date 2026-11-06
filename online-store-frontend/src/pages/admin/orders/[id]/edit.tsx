import { useRouter } from 'next/router';
import { useTranslation } from '../../../../lib/i18n';
import { withAdminLayout } from '../../../../components/admin/withAdminLayout';
import { OrderForm } from '../../../../components/admin/orders/OrderForm';

export const getServerSideProps = async () => ({ props: {} });

function EditOrderPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const id = typeof router.query.id === 'string' ? router.query.id : null;

  if (!id) return <div>{t('loading', 'admin')}</div>;

  return (
    <OrderForm
      mode="edit"
      orderId={id}
      onSuccess={() => router.push(`/admin/orders/${id}`)}
      onCancel={() => router.push(`/admin/orders/${id}`)}
    />
  );
}

export default withAdminLayout(EditOrderPage, {
  permission: 'manage:orders',
  featureName: 'Edit Order',
});
