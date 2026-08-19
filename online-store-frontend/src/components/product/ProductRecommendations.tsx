import type { BackendProduct } from '../../lib/api';
import { ProductCard } from '../ProductCard';

const RECENTLY_VIEWED_LABELS: Record<string, string> = {
  vi: 'Sản phẩm đã xem',
  en: 'Recently Viewed',
  pt: 'Vistos Recentemente',
  fr: 'Vus Récemment',
  de: 'Zuletzt Angesehen',
  it: 'Visti di Recente',
  es: 'Vistos Recientemente',
  nl: 'Onlangs Bekeken',
  sv: 'Nyligen Visade',
};

interface ProductRecommendationsProps {
  relatedProducts: BackendProduct[];
  recentlyViewedProducts: BackendProduct[];
  relatedTitle: string;
  recentlyViewedTitle: string;
  locale: string;
}

export function ProductRecommendations({
  relatedProducts,
  recentlyViewedProducts,
  relatedTitle,
  recentlyViewedTitle,
  locale,
}: ProductRecommendationsProps) {
  const recentlyViewedHeading = recentlyViewedTitle === 'section_recently_viewed_products'
    ? RECENTLY_VIEWED_LABELS[locale] || RECENTLY_VIEWED_LABELS.en
    : recentlyViewedTitle;

  return (
    <>
      {relatedProducts.length > 0 && (
        <section>
          <h2 className="mb-4 sm:mb-6 text-lg sm:text-xl">{relatedTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {relatedProducts.map((product) => (
              <ProductCard key={product._id} laptop={product} />
            ))}
          </div>
        </section>
      )}

      {recentlyViewedProducts.length > 0 && (
        <section className="mt-8 sm:mt-12">
          <h2 className="mb-4 sm:mb-6 text-lg sm:text-xl">{recentlyViewedHeading}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {recentlyViewedProducts.map((product) => (
              <ProductCard key={product._id} laptop={product} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
