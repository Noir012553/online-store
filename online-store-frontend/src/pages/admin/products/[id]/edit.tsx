import { useRouter } from 'next/router';
import { withAdminLayout } from "../../../../components/admin/withAdminLayout";
import { ProductForm } from "../../../../components/admin/products/ProductForm";

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

function EditProductPageContent() {
  const router = useRouter();
  const { id } = router.query;

  return (
    <ProductForm
      mode="edit"
      productId={id}
      onSuccess={() => router.push('/admin/products')}
      onCancel={() => router.push('/admin/products')}
    />
  );
}

export default withAdminLayout(EditProductPageContent, {
  permission: 'manage:products',
  featureName: 'Edit Product',
});
