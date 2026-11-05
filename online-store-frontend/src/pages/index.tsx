import dynamicImport from "next/dynamic";
import type { GetServerSideProps } from "next";
import HomeContent from "../components/HomeContent";

export default function Home() {
  return <HomeContent />;
}

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    props: {},
  };
};
