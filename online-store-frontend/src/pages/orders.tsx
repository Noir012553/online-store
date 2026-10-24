import { useEffect } from 'react';
import { useRouter } from 'next/router';

export const getServerSideProps = async () => {
  return {
    redirect: {
      destination: '/admin/orders',
      permanent: true,
    },
  };
};

export default function OrdersRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/orders');
  }, [router]);

  return null;
}
