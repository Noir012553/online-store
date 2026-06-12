import { useEffect } from "react";
import { useLanguage } from "../lib/i18n";
import { Clock, RefreshCw, Undo, Truck, CheckCircle, ArrowRight, ArrowLeft, ArrowDown } from "lucide-react";

export const getServerSideProps = async () => {
  return { props: {} };
};

export default function ReturnPolicy() {
  const { t, loadNamespace } = useLanguage();

  useEffect(() => {
    loadNamespace('policies');
  }, [loadNamespace]);

  const returnItems = [
    {
      titleKey: 'return_key_1_title',
      icon: Clock,
      descKey: 'return_key_1_desc'
    },
    {
      titleKey: 'return_key_2_title',
      icon: RefreshCw,
      descKey: 'return_key_2_desc'
    },
    {
      titleKey: 'return_key_3_title',
      icon: Undo,
      descKey: 'return_key_3_desc'
    },
    {
      titleKey: 'return_key_4_title',
      icon: Truck,
      descKey: 'return_key_4_desc'
    }
  ];

  const returnReasons = [
    {
      titleKey: 'return_accepted_title',
      items: ['return_accepted_1', 'return_accepted_2', 'return_accepted_3', 'return_accepted_4']
    },
    {
      titleKey: 'return_rejected_title',
      items: ['return_rejected_1', 'return_rejected_2', 'return_rejected_3', 'return_rejected_4']
    }
  ];

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-linear-to-r from-red-600 to-red-800 py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <h1 className="text-white mb-4 text-4xl font-bold">{t('return_page_title', 'policies')}</h1>
              <p className="text-red-100 text-lg">
                {t('return_hero_subtitle', 'policies')}
              </p>
            </div>
            <div className="hidden md:block">
              <img
                src="https://images.unsplash.com/photo-1555717435-dfd930891917?w=500&h=400&fit=crop"
                alt={t('return_page_title', 'policies')}
                className="rounded-lg shadow-lg w-full object-cover h-64"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Key Points Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {returnItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={index} className="bg-white border rounded-lg p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-semibold mb-2">{t(item.titleKey, 'policies')}</h3>
                <p className="text-gray-600 text-sm">{t(item.descKey, 'policies')}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Return Reasons */}
      <section className="bg-white py-16">
        <div className="container mx-auto px-4 flex justify-center">
          <div className="max-w-4xl w-full">
            <div className="mb-12 bg-white rounded-lg overflow-hidden shadow-md">
              <img
                src="https://images.unsplash.com/photo-1555817143-413c90789bef?w=900&h=400&fit=crop"
                alt={t('return_page_title', 'policies')}
                className="w-full h-64 object-cover"
              />
            </div>
            {returnReasons.map((reason, index) => (
              <div key={index} className="mb-12">
                <h2 className="text-2xl font-bold text-blue-600 mb-6 text-center">{t(reason.titleKey, 'policies')}</h2>
                <ul className="space-y-3">
                  {reason.items.map((itemKey, itemIndex) => (
                    <li key={itemIndex} className="flex items-start gap-3 bg-white rounded-lg p-4">
                      <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-white text-xs">✓</span>
                      </div>
                      <span className="text-gray-700">{t(itemKey, 'policies')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="bg-red-600 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-white text-3xl font-bold mb-4">{t('return_contact_title', 'policies')}</h2>
          <p className="text-red-100 mb-8 text-lg max-w-2xl mx-auto">
            {t('return_contact_subtitle', 'policies')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={`tel:${t('contact_phone_display', 'footer').replace(/\s/g, '')}`}
              className="bg-white text-red-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              {t('return_contact_phone', 'policies')}
            </a>
            <a
              href={`mailto:${t('contact_email_display', 'footer')}`}
              className="bg-transparent border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-red-600 transition-colors"
            >
              {t('return_contact_email', 'policies')}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
