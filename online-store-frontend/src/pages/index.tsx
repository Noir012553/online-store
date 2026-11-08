import dynamicImport from "next/dynamic";
import type { GetStaticProps, InferGetStaticPropsType } from "next";
import { BACKEND_URL } from "../config";
import type { BannerRecord } from "../lib/api";
import HomeContent from "../components/HomeContent";

type HomePageProps = {
  initialHeroBanners: BannerRecord[];
};

export default function Home({ initialHeroBanners }: InferGetStaticPropsType<typeof getStaticProps>) {
  return <HomeContent initialHeroBanners={initialHeroBanners} />;
}

export const getStaticProps: GetStaticProps<HomePageProps> = async () => {
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

  return { props: { initialHeroBanners }, revalidate: 60 };
};
