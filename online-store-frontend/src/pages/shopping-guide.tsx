import { useEffect } from "react";
import { useLanguage } from "../lib/i18n";
import { Search, ShoppingCart, Truck, CreditCard, HelpCircle, ArrowRight } from "lucide-react";
import { UI_EMOJI } from '../lib/uiEmoji';

export const getServerSideProps = async () => {
  return { props: {} };
};

export default function ShoppingGuide() {
  const { t, loadNamespace } = useLanguage();

  useEffect(() => {
    loadNamespace('shopping-guide');
  }, [loadNamespace]);

  const steps = [
    {
      icon: Search,
      number: 1,
      titleKey: 'step_1_title',
      descKey: 'step_1_desc'
    },
    {
      icon: ShoppingCart,
      number: 2,
      titleKey: 'step_2_title',
      descKey: 'step_2_desc'
    },
    {
      icon: CreditCard,
      number: 3,
      titleKey: 'step_3_title',
      descKey: 'step_3_desc'
    },
    {
      icon: Truck,
      number: 4,
      titleKey: 'step_4_title',
      descKey: 'step_4_desc'
    }
  ];

  const tips = [
    {
      categoryKey: 'tips_selection_category',
      items: ['tips_selection_1', 'tips_selection_2', 'tips_selection_3', 'tips_selection_4']
    },
    {
      categoryKey: 'tips_choice_category',
      items: ['tips_choice_1', 'tips_choice_2', 'tips_choice_3', 'tips_choice_4']
    },
    {
      categoryKey: 'tips_buying_category',
      items: ['tips_buying_1', 'tips_buying_2', 'tips_buying_3', 'tips_buying_4']
    },
    {
      categoryKey: 'tips_after_category',
      items: ['tips_after_1', 'tips_after_2', 'tips_after_3', 'tips_after_4']
    }
  ];

  const faqs = [
    {
      questionKey: 'faq_1_question',
      answerKey: 'faq_1_answer'
    },
    {
      questionKey: 'faq_2_question',
      answerKey: 'faq_2_answer'
    },
    {
      questionKey: 'faq_3_question',
      answerKey: 'faq_3_answer'
    },
    {
      questionKey: 'faq_4_question',
      answerKey: 'faq_4_answer'
    },
    {
      questionKey: 'faq_5_question',
      answerKey: 'faq_5_answer'
    },
    {
      questionKey: 'faq_6_question',
      answerKey: 'faq_6_answer'
    }
  ];

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-linear-to-r from-green-600 to-green-800 py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <h1 className="text-white mb-4 text-4xl font-bold">{t('page_title', 'shopping-guide')}</h1>
              <p className="text-green-100 text-lg">
                {t('hero_subtitle', 'shopping-guide')}
              </p>
            </div>
            <div className="hidden md:block">
              <img
                src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=500&h=400&fit=crop"
                alt={t('page_title', 'shopping-guide')}
                className="rounded-lg shadow-lg w-full object-cover h-64"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Steps Section */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">{t('process_title', 'shopping-guide')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="relative">
                <div className="bg-white border rounded-lg p-6 h-full hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                      {step.number}
                    </div>
                    <Icon className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{t(step.titleKey, 'shopping-guide')}</h3>
                  <p className="text-gray-600 text-sm">{t(step.descKey, 'shopping-guide')}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden lg:flex absolute top-1/2 -right-6 transform -translate-y-1/2">
                    <ArrowRight className="w-6 h-6 text-red-600" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Tips Section */}
      <section className="bg-white py-16">
        <div className="container mx-auto px-4 flex justify-center">
          <div className="max-w-4xl w-full">
            <h2 className="text-3xl font-bold text-center mb-12">{t('tips_title', 'shopping-guide')}</h2>
            <div className="mb-12 bg-white rounded-lg overflow-hidden shadow-md">
              <img
                src="https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=900&h=350&fit=crop"
                alt={t('tips_title', 'shopping-guide')}
                className="w-full h-56 object-cover"
              />
            </div>
            {tips.map((tip, index) => (
              <div key={index} className="mb-12">
                <h3 className="text-2xl font-bold text-red-600 mb-6 text-center">{t(tip.categoryKey, 'shopping-guide')}</h3>
                <ul className="space-y-3">
                  {tip.items.map((itemKey, itemIndex) => (
                    <li key={itemIndex} className="flex items-start gap-3 bg-white rounded-lg p-4">
                      <div className="w-5 h-5 bg-green-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-white text-xs">{UI_EMOJI.feature}</span>
                      </div>
                      <span className="text-gray-700">{t(itemKey, 'shopping-guide')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="container mx-auto px-4 py-16 flex justify-center">
        <div className="max-w-4xl w-full">
          <h2 className="text-3xl font-bold text-center mb-12">{t('faqs_title', 'shopping-guide')}</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <details key={index} className="bg-white border rounded-lg p-6 group">
                <summary className="flex items-start gap-3 cursor-pointer font-semibold text-gray-800 hover:text-red-600">
                  <HelpCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <span>{t(faq.questionKey, 'shopping-guide')}</span>
                </summary>
                <p className="text-gray-600 mt-4 ml-8">{t(faq.answerKey, 'shopping-guide')}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="bg-green-600 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-white text-3xl font-bold mb-4">{t('contact_title', 'shopping-guide')}</h2>
          <p className="text-green-100 mb-8 text-lg max-w-2xl mx-auto">
            {t('contact_description', 'shopping-guide')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={`tel:${t('contact_phone_display', 'footer').replace(/\s/g, '')}`}
              className="bg-white text-green-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              {t('contact_phone', 'shopping-guide')}
            </a>
            <a
              href={`mailto:${t('contact_email_display', 'footer')}`}
              className="bg-transparent border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-green-600 transition-colors"
            >
              {t('contact_email', 'shopping-guide')}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
