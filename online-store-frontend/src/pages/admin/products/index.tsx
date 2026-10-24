import { withAdminLayout } from "../../../components/admin/withAdminLayout";
import { ProductsList } from "../../../components/admin/products/ProductsList";

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

function ProductsPage() {
  return (
    <ProductsList />
  );
}

export default withAdminLayout(ProductsPage, {
  permission: "manage:products",
  featureName: "Products Management"
});
