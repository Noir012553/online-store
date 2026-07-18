import { useRouter } from 'next/router';
import { withAdminLayout } from "../../../components/admin/withAdminLayout";
import { ProductForm } from "../../../components/admin/products/ProductForm";

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

function CreateProductPage() {
  const router = useRouter();

  return (
    <ProductForm
      mode="create"
      onSuccess={() => router.push('/admin/products')}
      onCancel={() => router.push('/admin/products')}
    />
  );
}

export default withAdminLayout(CreateProductPage, {
  permission: "manage:products",
  featureName: "Create Product"
});
