import dynamicImport from "next/dynamic";
import { GetServerSideProps } from "next";
import { HamsterLoader } from '../components/HamsterLoader';

const HomeContent = dynamicImport(() => import("../components/HomeContent"), {
  ssr: false,
  loading: () => <div className="flex h-screen w-full items-center justify-center bg-white"><HamsterLoader /></div>,
});

export default function Home() {
  return <HomeContent />;
}

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    props: {},
  };
};
