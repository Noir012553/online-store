import { useEffect, useState } from 'react';
import { useLanguage } from '../lib/i18n';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../lib/i18n/types';
import { bannerAPI, getAuthToken, type BannerRecord } from '../lib/api';
import { Shield, RefreshCw, Headphones } from 'lucide-react';

interface WarrantyInfo {
  icon: React.ReactNode;
  text: string;
  translationKey?: string;
}

const DEFAULT_WARRANTY_INFO: WarrantyInfo[] = [
  {
    icon: <Shield className="w-5 h-5 sm:w-6 sm:h-6" />,
    text: '',
    translationKey: 'warranty_official',
  },
  {
    icon: <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6" />,
    text: '',
    translationKey: 'warranty_exchange',
  },
  {
    icon: <Headphones className="w-5 h-5 sm:w-6 sm:h-6" />,
    text: '',
    translationKey: 'warranty_support',
  },
];

interface BannerTranslation {
  _id: string;
  bannerId: string;
  language: string;
  title: string;
  subtitle: string;
  description: string;
  ctaText: string;
}

export function WarrantyInfoBanner() {
  const { locale, isHydrated, t } = useLanguage();
  const [warrantyInfo, setWarrantyInfo] = useState<WarrantyInfo[]>(DEFAULT_WARRANTY_INFO);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isHydrated) return;

    let isMounted = true;

    const fetchWarrantyBanner = async () => {
      try {
        setIsLoading(true);
        const response = await bannerAPI.getBanners('homepage_warranty', true, 1, 1, locale as any);
        const banner = Array.isArray(response.banners) && response.banners[0];

        if (!isMounted) return;

        if (banner) {
          const currentLang = locale || DEFAULT_LOCALE;

          // First try to fetch warranty translations from API
          const warrantyItems: WarrantyInfo[] = [];

          try {
            const token = getAuthToken();
            const translationsResponse = await fetch(
              `/api/banners/${banner._id}/translations?lang=${currentLang}`,
              {
                headers: {
                  ...(token && { 'Authorization': `Bearer ${token}` }),
                },
              }
            );

            if (translationsResponse.ok) {
              const translationsData = await translationsResponse.json();
              if (translationsData.success && Array.isArray(translationsData.data)) {
                const translations = translationsData.data as BannerTranslation[];
                const translation = translations.find((t) => t.language === currentLang);

                if (translation) {
                  if (translation.title)
                    warrantyItems.push({ icon: DEFAULT_WARRANTY_INFO[0].icon, text: translation.title });
                  if (translation.subtitle)
                    warrantyItems.push({ icon: DEFAULT_WARRANTY_INFO[1].icon, text: translation.subtitle });
                  if (translation.description)
                    warrantyItems.push({ icon: DEFAULT_WARRANTY_INFO[2].icon, text: translation.description });

                  if (warrantyItems.length > 0) {
                    setWarrantyInfo(warrantyItems);
                    return;
                  }
                }
              }
            }
          } catch (err) {
            if (process.env.NODE_ENV === 'development') {
              console.log('Translation fetch error, falling back to banner fields');
            }
          }

          // Fallback to banner fields if translations not found
          const getTextByLang = (field: any): string => {
            if (typeof field === 'object') {
              if (field[currentLang]) return String(field[currentLang]).trim();
              const fallbackChain = [currentLang, ...SUPPORTED_LOCALES.filter(l => l !== currentLang)];
              for (const lang of fallbackChain) {
                if (lang !== currentLang && field[lang]) return String(field[lang]).trim();
              }
              const firstLang = Object.keys(field)[0];
              if (firstLang) return String(field[firstLang]).trim();
            }
            return String(field || '').trim();
          };

          const title = getTextByLang(banner.title);
          const subtitle = getTextByLang(banner.subtitle);
          const description = getTextByLang(banner.description);

          if (title) warrantyItems.push({ icon: DEFAULT_WARRANTY_INFO[0].icon, text: title });
          if (subtitle) warrantyItems.push({ icon: DEFAULT_WARRANTY_INFO[1].icon, text: subtitle });
          if (description) warrantyItems.push({ icon: DEFAULT_WARRANTY_INFO[2].icon, text: description });

          if (warrantyItems.length > 0) {
            setWarrantyInfo(warrantyItems);
          } else {
            // Use translation keys for fallback
            setWarrantyInfo([
              {
                icon: DEFAULT_WARRANTY_INFO[0].icon,
                text: t('warranty_official', 'common'),
                translationKey: 'warranty_official',
              },
              {
                icon: DEFAULT_WARRANTY_INFO[1].icon,
                text: t('warranty_exchange', 'common'),
                translationKey: 'warranty_exchange',
              },
              {
                icon: DEFAULT_WARRANTY_INFO[2].icon,
                text: t('warranty_support', 'common'),
                translationKey: 'warranty_support',
              },
            ]);
          }
        } else {
          setWarrantyInfo(DEFAULT_WARRANTY_INFO);
        }
      } catch (error) {
        if (isMounted) {
          setWarrantyInfo(DEFAULT_WARRANTY_INFO);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void fetchWarrantyBanner();

    return () => {
      isMounted = false;
    };
  }, [locale, isHydrated]);

  return (
    <div className="warranty-banner">
      <div className="container mx-auto section-container-px warranty-banner-content">
        <div className="warranty-grid">
          {warrantyInfo.map((item, index) => (
            <div key={index} className="warranty-item">
              <div className="warranty-icon-wrapper">
                <div className="warranty-icon">{item.icon}</div>
              </div>
              <p className="warranty-text">{item.text}</p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .warranty-banner {
          background-color: white;
          border-bottom: 1px solid #e5e7eb;
        }

        .warranty-banner-content {
          padding: 1rem 0;
        }

        @media (min-width: 640px) {
          .warranty-banner-content {
            padding: 1.5rem 0;
          }
        }

        .warranty-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }

        @media (min-width: 640px) {
          .warranty-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 1.5rem;
          }
        }

        .warranty-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          text-align: center;
        }

        @media (min-width: 640px) {
          .warranty-item {
            gap: 1rem;
            text-align: left;
          }
        }

        .warranty-icon-wrapper {
          flex-shrink: 0;
          width: 2.5rem;
          height: 2.5rem;
          background-color: #fef2f2;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        @media (min-width: 640px) {
          .warranty-icon-wrapper {
            width: 3rem;
            height: 3rem;
          }
        }

        .warranty-icon {
          color: #dc2626;
        }

        .warranty-text {
          font-size: 0.875rem;
          font-weight: 500;
          color: #111827;
        }

        @media (min-width: 640px) {
          .warranty-text {
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
}
