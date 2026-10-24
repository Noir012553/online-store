export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/admin/translationsStatic',
      permanent: false,
    },
  };
}

export default function LegacyTranslationsAdminTier1() {
  return null;
}
