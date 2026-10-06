export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/admin/translationsAdminTier1',
      permanent: false,
    },
  };
}

export default function LegacyTranslationsAdminTier2() {
  return null;
}
