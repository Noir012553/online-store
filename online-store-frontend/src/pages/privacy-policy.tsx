import { useEffect } from "react";
import { useLanguage } from "../lib/i18n";
import { Shield, Lock, Eye } from "lucide-react";

export const getServerSideProps = async () => {
  return { props: {} };
};

export default function PrivacyPolicy() {
  const { t, loadNamespace } = useLanguage();

  useEffect(() => {
    loadNamespace('policies');
  }, [loadNamespace]);

  const sections = [
    {
      titleKey: 'privacy_section_1_title',
      icon: Eye,
      contentKeys: ['privacy_section_1_content']
    },
    {
      titleKey: 'privacy_section_2_title',
      icon: Lock,
      contentKeys: ['privacy_section_2_content_1', 'privacy_section_2_content_2']
    },
    {
      titleKey: 'privacy_section_3_title',
      icon: Shield,
      contentKeys: ['privacy_section_3_content_1', 'privacy_section_3_content_2', 'privacy_section_3_content_3']
    },
    {
      titleKey: 'privacy_section_4_title',
      icon: Lock,
      contentKeys: ['privacy_section_4_content']
    },
    {
      titleKey: 'privacy_section_5_title',
      icon: Eye,
      contentKeys: ['privacy_section_5_content']
    }
  ];

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4 mb-4">
            <Shield className="w-10 h-10 text-white" />
            <h1 className="text-white text-4xl font-bold">{t('privacy_page_title', 'policies')}</h1>
          </div>
          <p className="text-blue-100 text-lg">
            {t('privacy_hero_subtitle', 'policies')}
          </p>
        </div>
      </section>

      {/* Content Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-8 rounded">
            <p className="text-gray-700">
              {t('privacy_last_updated', 'policies')}
            </p>
          </div>

          {sections.map((section, index) => {
            const Icon = section.icon;
            return (
              <div key={index} className="mb-12">
                <div className="flex items-start gap-4 mb-6">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
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
            );
          })}

          {/* Rights Section */}
          <div className="mt-16 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-600" />
              {t('privacy_rights_title', 'policies')}
            </h3>
            <p className="text-gray-700 mb-4">
              {t('privacy_rights_content', 'policies')}
            </p>
          </div>

          {/* Contact Section */}
          <div className="mt-8 bg-gray-50 rounded-lg p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {t('privacy_contact_title', 'policies')}
            </h3>
            <p className="text-gray-700 mb-4">
              {t('privacy_contact_content', 'policies')}
            </p>
            <div className="space-y-2 text-gray-700">
              <p><strong>{t('privacy_email', 'policies')}:</strong> {t('contact_email_display', 'footer')}</p>
              <p><strong>{t('privacy_phone', 'policies')}:</strong> {t('contact_phone_display', 'footer')}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
