export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/admin/translationsDynamic',
      permanent: false,
    },
  };
}

export default function LegacyProductsTranslationsAdmin() {
  return null;
}
