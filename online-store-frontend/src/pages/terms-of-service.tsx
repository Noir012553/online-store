import { useEffect } from "react";
import { useLanguage } from "../lib/i18n";
import { FileText, CheckCircle, AlertCircle } from "lucide-react";

export const getServerSideProps = async () => {
  return { props: {} };
};

export default function TermsOfService() {
  const { t, loadNamespace } = useLanguage();

  useEffect(() => {
    loadNamespace('policies');
  }, [loadNamespace]);

  const sections = [
    {
      titleKey: 'terms_section_1_title',
      contentKeys: ['terms_section_1_content']
    },
    {
      titleKey: 'terms_section_2_title',
      contentKeys: ['terms_section_2_content_1', 'terms_section_2_content_2', 'terms_section_2_content_3']
    },
    {
      titleKey: 'terms_section_3_title',
      contentKeys: ['terms_section_3_content']
    },
    {
      titleKey: 'terms_section_4_title',
      contentKeys: ['terms_section_4_content_1', 'terms_section_4_content_2']
    },
    {
      titleKey: 'terms_section_5_title',
      contentKeys: ['terms_section_5_content']
    }
  ];

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-red-600 to-red-800 py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4 mb-4">
            <FileText className="w-10 h-10 text-white" />
            <h1 className="text-white text-4xl font-bold">{t('terms_page_title', 'policies')}</h1>
          </div>
          <p className="text-red-100 text-lg">
            {t('terms_hero_subtitle', 'policies')}
          </p>
        </div>
      </section>

      {/* Content Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-8 rounded">
            <p className="text-gray-700">
              {t('terms_last_updated', 'policies')}
            </p>
          </div>

          {sections.map((section, index) => (
            <div key={index} className="mb-12">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex-shrink-0 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center font-bold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    {t(section.titleKey, 'policies')}
                  </h2>
                  <div className="space-y-4">
                    {section.contentKeys.map((contentKey, idx) => (
                      <p key={idx} className="text-gray-700 leading-relaxed">
                        {t(contentKey, 'policies')}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Contact Section */}
          <div className="mt-16 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-red-500" />
              {t('terms_contact_title', 'policies')}
            </h3>
            <p className="text-gray-700 mb-4">
              {t('terms_contact_content', 'policies')}
            </p>
            <div className="space-y-2 text-gray-700">
              <p><strong>{t('terms_email', 'policies')}:</strong> {t('contact_email_display', 'footer')}</p>
              <p><strong>{t('terms_phone', 'policies')}:</strong> {t('contact_phone_display', 'footer')}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
