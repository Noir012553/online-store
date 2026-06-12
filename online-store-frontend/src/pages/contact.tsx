import { useState, useEffect } from "react";
import { MapPin, Phone, Mail, Clock, MessageSquare } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { faqKeys } from "../lib/data";
import { toast } from "sonner";
import { useTranslation } from "../lib/i18n";
import { getMessage } from "../lib/i18n/messages";

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default function Contact() {
  const { t, loadNamespace } = useTranslation();

  useEffect(() => {
    loadNamespace('contact');
  }, [loadNamespace]);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success(t('form_success_message', 'contact'));
    setFormData({
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: "",
    });
  };

  const branches = [
    {
      id: "hanoi",
      nameKey: "store_info_hanoi_branch",
      addressKey: "store_info_hanoi_address",
      phoneKey: "store_info_hanoi_phone",
      hoursKey: "store_info_business_hours",
    },
    {
      id: "hcm",
      nameKey: "store_info_hcm_branch",
      addressKey: "store_info_hcm_address",
      phoneKey: "store_info_hcm_phone",
      hoursKey: "store_info_business_hours",
    },
    {
      id: "danang",
      nameKey: "store_info_danang_branch",
      addressKey: "store_info_danang_address",
      phoneKey: "store_info_danang_phone",
      hoursKey: "store_info_business_hours",
    },
  ];

  const contactMethods = [
    {
      icon: Phone,
      titleKey: "contact_methods_hotline_title",
      value: t('contact_hotline_number', 'contact'),
      descKey: "contact_methods_hotline_desc",
    },
    {
      icon: Mail,
      titleKey: "contact_methods_email_title",
      value: t('contact_email', 'contact'),
      descKey: "contact_methods_email_desc",
    },
    {
      icon: MessageSquare,
      titleKey: "contact_methods_chat_title",
      valueKey: "contact_methods_chat_value",
      descKey: "contact_methods_chat_desc",
    },
  ];

  return (
    <div>
      <section className="bg-gradient-to-r from-red-600 to-red-800 py-20">
        <div className="container mx-auto px-4 text-center text-white">
          <h1 className="text-white mb-4">{t('page_title', 'contact')}</h1>
          <p className="text-xl max-w-2xl mx-auto">
            {t('page_subtitle', 'contact')}
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {contactMethods.map((method, index) => {
            const Icon = method.icon;
            return (
              <div key={index} className="bg-white border rounded-lg p-6 text-center hover:shadow-lg transition-shadow">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="mb-2">{t(method.titleKey, 'contact')}</h3>
                <p className="text-red-600 mb-1">{method.valueKey ? t(method.valueKey, 'contact') : method.value}</p>
                <p className="text-sm text-gray-600">{t(method.descKey, 'contact')}</p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div>
            <h2 className="mb-6">{t('form_section_title', 'contact')}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="contact-name">{t('form_full_name_label', 'contact')}</Label>
                <Input
                  id="contact-name"
                  name="name"
                  placeholder={t('form_name_placeholder', 'contact')}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  autoComplete="name"
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-email">{t('form_email_label', 'contact')}</Label>
                  <Input
                    id="contact-email"
                    name="email"
                    type="email"
                    placeholder={t('form_email_placeholder', 'contact')}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-phone">{t('form_phone_label', 'contact')}</Label>
                  <Input
                    id="contact-phone"
                    name="phone"
                    type="tel"
                    placeholder={t('form_phone_placeholder', 'contact')}
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    autoComplete="tel"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-subject">{t('form_subject_label', 'contact')}</Label>
                <Input
                  id="contact-subject"
                  name="subject"
                  placeholder={t('form_subject_placeholder', 'contact')}
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-message">{t('form_message_label', 'contact')}</Label>
                <Textarea
                  id="contact-message"
                  name="message"
                  placeholder={t('form_message_placeholder', 'contact')}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  rows={6}
                  autoComplete="off"
                  required
                />
              </div>
              <Button type="submit" className="w-full bg-red-600 hover:bg-red-700">
                {t('form_send_button', 'contact')}
              </Button>
            </form>
          </div>

          <div>
            <h2 className="mb-6">{t('store_info_section_title', 'contact')}</h2>
            <div className="space-y-6">
              {branches.map((branch) => (
                <div key={branch.id} className="bg-white border rounded-lg p-6">
                  <h3 className="mb-4">{t(branch.nameKey, 'contact')}</h3>
                  <div className="space-y-3 text-gray-700">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <span>{t(branch.addressKey, 'contact')}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-red-600" />
                      <a href={`tel:${t(branch.phoneKey, 'contact')}`} className="hover:text-red-600">
                        {t(branch.phoneKey, 'contact')}
                      </a>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-red-600" />
                      <span>{t(branch.hoursKey, 'contact')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-center mb-4 text-3xl font-bold">{t('map_section_heading', 'contact')}</h2>
          <p className="text-center text-gray-600 mb-8 text-xl font-bold">{t('map_section_branch_location', 'contact')}</p>
          <div className="max-w-4xl mx-auto">
            <div className="aspect-video bg-gray-200 rounded-lg flex items-center justify-center">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3919.3193500004893!2d106.69729731480123!3d10.787845992312522!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31752f4b3330bcc9%3A0xc86bd58b6c8499d1!2zTmd1eeG7hW4gSHXhu4csIFF14bqtbiAxLCBI4buTIENow60gTWluaCwgVmnhu4d0IE5hbQ!5e0!3m2!1svi!2s!4v1635000000000!5m2!1svi!2s"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                className="rounded-lg"
              ></iframe>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <h2 className="text-center mb-4 text-3xl font-bold">{t('faq_section_heading', 'contact')}</h2>
        <p className="text-center text-gray-600 mb-8 max-w-2xl mx-auto text-xl font-bold">
          {t('faq_section_subtitle', 'contact')}
        </p>
        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible>
            {faqKeys.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger>{t(faq.questionKey, 'shopping-guide')}</AccordionTrigger>
                <AccordionContent>{t(faq.answerKey, 'shopping-guide')}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="bg-gradient-to-r from-red-600 to-red-800 py-12">
        <div className="container mx-auto px-4 text-center text-white">
          <h2 className="text-white mb-4">{t('cta_section_heading', 'contact')}</h2>
          <p className="text-xl mb-6">
            {t('cta_section_subtitle', 'contact')}
          </p>
          <a href={`tel:${getMessage('VI', 'contact.hotline').replace(/\s/g, '')}`} className="inline-block">
            <Button size="lg" variant="secondary" className="bg-white text-red-600 hover:bg-gray-100">
              <Phone className="w-5 h-5 mr-2" />
              {getMessage('VI', 'contact.hotline')}
            </Button>
          </a>
        </div>
      </section>
    </div>
  );
}
