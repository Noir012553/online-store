import dynamicImport from "next/dynamic";
import { GetServerSideProps } from "next";

const HomeContent = dynamicImport(() => import("../components/HomeContent"), {
  ssr: false,
  loading: () => <div className="w-full h-screen bg-white" />,
});

export default function Home() {
  return <HomeContent />;
}

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    props: {},
  };
};
