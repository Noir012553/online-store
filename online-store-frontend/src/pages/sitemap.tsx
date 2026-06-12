import { useEffect } from "react";
import { useLanguage } from "../lib/i18n";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowRight, FileText, Home, Info, LifeBuoy, LogIn, Package, ShoppingCart, ShieldCheck, User } from "lucide-react";

export const getServerSideProps = async () => {
  return { props: {} };
};

export default function SitemapPage() {
  const { t, loadNamespace } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    loadNamespace('pages');
  }, [loadNamespace]);

  const sections = [
    {
      titleKey: 'sitemap_main_section',
      items: [
        { href: '/', labelKey: 'sitemap_home', icon: Home },
        { href: '/products', labelKey: 'sitemap_products', icon: Package },
        { href: '/about', labelKey: 'sitemap_about', icon: Info },
        { href: '/contact', labelKey: 'sitemap_contact', icon: LifeBuoy },
      ],
    },
    {
      titleKey: 'sitemap_support_section',
      items: [
        { href: '/shopping-guide', labelKey: 'sitemap_shopping_guide', icon: FileText },
        { href: '/return-policy', labelKey: 'sitemap_return_policy', icon: ShieldCheck },
        { href: '/warranty-policy', labelKey: 'sitemap_warranty_policy', icon: ShieldCheck },
      ],
    },
    {
      titleKey: 'sitemap_account_section',
      items: [
        { href: '/cart', labelKey: 'sitemap_cart', icon: ShoppingCart },
        { href: '/profile', labelKey: 'sitemap_profile', icon: User },
        { href: '/my-orders', labelKey: 'sitemap_orders', icon: Package },
      ],
    },
  ];

  return (
    <div className="bg-white">
      <section className="bg-linear-to-r from-red-600 to-red-800 py-16">
        <div className="container mx-auto px-4 text-white">
          <h1 className="text-white mb-4">{t('sitemap_page_title', 'pages')}</h1>
          <p className="max-w-2xl text-lg text-red-100">
            {t('sitemap_description', 'pages')}
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="grid gap-8 lg:grid-cols-3">
          {sections.map((section) => (
            <div key={section.titleKey} className="rounded-lg border bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-black">{t(section.titleKey, 'pages')}</h2>
              <div className="space-y-2">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <span className="flex items-center gap-3 text-gray-700 group-hover:text-red-600">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{t(item.labelKey, 'pages')}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-red-600" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="rounded-lg border bg-white p-6 shadow-sm lg:col-span-3">
            <h2 className="mb-4 text-xl font-semibold text-black">{t('sitemap_policies_section', 'pages')}</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <Link href="/return-policy" className="rounded-md border px-4 py-3 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600">
                {t('sitemap_return_policy', 'pages')}
              </Link>
              <Link href="/warranty-policy" className="rounded-md border px-4 py-3 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600">
                {t('sitemap_warranty_policy', 'pages')}
              </Link>
              <Link href="/shopping-guide" className="rounded-md border px-4 py-3 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600">
                {t('sitemap_shopping_guide', 'pages')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
