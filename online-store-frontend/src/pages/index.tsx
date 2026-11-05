import dynamicImport from "next/dynamic";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { BACKEND_URL } from "../config";
import type { BannerRecord } from "../lib/api";
import HomeContent from "../components/HomeContent";

type HomePageProps = {
  initialHeroBanners: BannerRecord[];
};

export default function Home({ initialHeroBanners }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <HomeContent initialHeroBanners={initialHeroBanners} />;
}

export const getServerSideProps: GetServerSideProps<HomePageProps> = async ({ res }) => {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  let initialHeroBanners: BannerRecord[] = [];

  try {
    const response = await fetch(`${BACKEND_URL}/api/banners?pageNumber=1&pageSize=10&activeOnly=true&slot=homepage_hero`, {
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) {
      const data = await response.json();
      initialHeroBanners = Array.isArray(data.banners) ? data.banners : [];
    }
  } catch {
    initialHeroBanners = [];
  }

  return { props: { initialHeroBanners } };
};
