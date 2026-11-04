import { Mail, Phone, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { getCategoryName } from "../lib/data";
import { useCategories } from "../lib/context/CategoryContext";
import { useTranslation } from "../lib/i18n";
import { apiCall } from "../lib/api";

export function Footer() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const { categories, isLoading: loadingCategories } = useCategories();
  const { t, loadNamespace, locale } = useTranslation();
  const thankYouTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    Promise.all([
      loadNamespace('footer'),
      loadNamespace('newsletter'),
      loadNamespace('categories'),
    ]);
  }, [loadNamespace]);

  // Cleanup thank you timer on unmount
  useEffect(() => {
    return () => {
      if (thankYouTimerRef.current) {
        clearTimeout(thankYouTimerRef.current);
      }
    };
  }, []);

  const validateEmail = (value: string) => {
    if (!value) {
      setEmailError("");
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      setEmailError(t('invalidEmail', 'newsletter'));
      return false;
    }
    setEmailError("");
    return true;
  };

  const validatePhone = (value: string) => {
    if (!value) {
      setPhoneError("");
      return false;
    }
    const phoneRegex = /^(\+84|0)[0-9]{8,9}$/;
    if (!phoneRegex.test(value.replace(/\s/g, ""))) {
      setPhoneError(t('invalidPhone', 'newsletter'));
      return false;
    }
    setPhoneError("");
    return true;
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    validateEmail(value);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPhone(value);
    validatePhone(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate both fields
    const emailValid = validateEmail(email);
    const phoneValid = validatePhone(phone);

    if (!emailValid || !phoneValid) {
      return;
    }

    try {
      setIsSubmitting(true);
      await apiCall('/newsletter', {
        method: 'POST',
        body: JSON.stringify({ email, phone }),
      });

      toast.success(t('successMessage', 'newsletter'));
      setShowThankYou(true);
      setEmail("");
      setPhone("");

      // Auto hide thank you message after 5 seconds
      if (thankYouTimerRef.current) {
        clearTimeout(thankYouTimerRef.current);
      }
      thankYouTimerRef.current = setTimeout(() => {
        setShowThankYou(false);
      }, 5000);
    } catch (error) {
      toast.error(t('errorMessage', 'newsletter'));
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <footer className="relative bg-black text-white overflow-hidden">
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-linear-to-br from-black via-gray-900 to-red-950/30" />

      <style>{`
        .laminated-card {
          position: relative;
          width: 45px;
          height: 30px;
          padding: 4px;
          border-radius: 6px;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow:
            0 4px 16px rgba(0, 0, 0, 0.3),
            inset 0 0.5px 0.5px rgba(255, 255, 255, 0.1),
            inset 0 -0.5px 0.5px rgba(0, 0, 0, 0.1);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
          transform: perspective(1000px) rotateX(0deg) rotateY(0deg);
        }

        .laminated-card:hover {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.08) 100%);
          border-color: rgba(255, 255, 255, 0.3);
          box-shadow:
            0 5px 18px rgba(0, 0, 0, 0.4),
            inset 0 0.5px 0.5px rgba(255, 255, 255, 0.15),
            inset 0 -0.5px 0.5px rgba(0, 0, 0, 0.2);
          transform: perspective(1000px) rotateX(5deg) rotateY(-5deg) translateY(-1px);
        }

        .logo-image {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }
      `}</style>

      {/* Content */}
      <div className="relative z-10">
        <div className="container mx-auto section-container-px py-8 sm:py-12">
          <div className="flex flex-col md:flex-row gap-8 sm:gap-12 mb-8 sm:mb-12">
            {/* Left Column: Brand, Inputs, Social Icons (3/10) */}
            <div className="md:flex-3">
              <Link href="/" className="mb-4 inline-flex">
                <Image
                  src="/assets/branding/logo-cropped.png"
                  alt={t('brand_name', 'footer')}
                  width={260}
                  height={146}
                  className="logo-image h-20 w-auto max-w-full object-contain object-left sm:h-24"
                />
              </Link>
              <p className="text-sm sm:text-base text-gray-400 mb-4 sm:mb-6 leading-relaxed">
                {t('description', 'footer')}</p>

              {/* Newsletter */}
              <div className="mb-4 sm:mb-6">
                {showThankYou ? (
                  <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3 sm:p-4">
                    <h3 className="text-green-300 font-semibold mb-1 sm:mb-2 text-sm">
                      {t('thankYouTitle', 'newsletter')}
                    </h3>
                    <p className="text-xs sm:text-sm text-green-200">
                      {t('thankYouMessage', 'newsletter')}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                    <div>
                      <Label htmlFor="newsletter-email" className="text-xs sm:text-sm mb-2 block text-white font-medium">
                        {t('emailLabel', 'newsletter')}
                      </Label>
                      <Input
                        id="newsletter-email"
                        name="newsletter-email"
                        type="email"
                        placeholder={t('emailPlaceholder', 'newsletter')}
                        value={email}
                        onChange={handleEmailChange}
                        autoComplete="email"
                        disabled={isSubmitting}
                        className="bg-white/10 border-white/20 text-white placeholder:text-gray-400 disabled:opacity-50 text-sm"
                      />
                      {emailError && <p className="text-red-400 text-xs mt-1">{emailError}</p>}
                    </div>

                    <div>
                      <Label htmlFor="newsletter-phone" className="text-xs sm:text-sm mb-2 block text-white font-medium">
                        {t('phoneLabel', 'newsletter')}
                      </Label>
                      <Input
                        id="newsletter-phone"
                        name="newsletter-phone"
                        type="tel"
                        placeholder={t('phonePlaceholder', 'newsletter')}
                        value={phone}
                        onChange={handlePhoneChange}
                        autoComplete="tel"
                        disabled={isSubmitting}
                        className="bg-white/10 border-white/20 text-white placeholder:text-gray-400 disabled:opacity-50 text-sm"
                      />
                      {phoneError && <p className="text-red-400 text-xs mt-1">{phoneError}</p>}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm py-1.5 sm:py-2"
                      >
                        {isSubmitting ? t('sending', 'newsletter') : t('subscribe', 'newsletter')}
                      </Button>
                    </div>
                  </form>
                )}
              </div>

            </div>

            {/* Right Column: 6 Menu Items (7/10) */}
            <div className="md:flex-7">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                {/* Row 1: Products, Support, Contact */}

                {/* Products Column */}
                <div>
                  <h3 className="mb-3 sm:mb-4 relative inline-block font-bold text-sm sm:text-base">
                    {t('products', 'footer')}
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600" />
                  </h3>
                  {loadingCategories ? (
                    <ul className="space-y-2 sm:space-y-3 text-gray-400">
                      <li className="text-xs">{t('loading', 'footer')}</li>
                    </ul>
                  ) : Array.isArray(categories) && categories.length > 0 ? (
                    <ul className="space-y-2 sm:space-y-3 text-gray-400">
                      {categories.map((category) => {
                        const slug = category.slug || category._id;
                        const displayName = getCategoryName(category, locale);
                        return (
                          <li key={category._id}>
                            <Link
                              href={`/products/${slug}`}
                              className="hover:text-red-500 hover:translate-x-1 inline-block transition-all duration-300 text-xs sm:text-sm"
                            >
                              {displayName}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <ul className="space-y-2 sm:space-y-3 text-gray-400">
                      <li className="text-xs">{t('noCategories', 'footer')}</li>
                    </ul>
                  )}
                </div>

                {/* Support Column */}
                <div>
                  <h3 className="mb-3 sm:mb-4 relative inline-block font-bold text-sm sm:text-base">
                    {t('support', 'footer')}
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600" />
                  </h3>
                  <ul className="space-y-2 sm:space-y-3 text-gray-400">
                    <li>
                      <Link
                        href="/about"
                        className="hover:text-red-500 hover:translate-x-1 inline-block transition-all duration-300 text-xs sm:text-sm"
                      >
                        {t('aboutUs', 'footer')}
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/contact"
                        className="hover:text-red-500 hover:translate-x-1 inline-block transition-all duration-300 text-xs sm:text-sm"
                      >
                        {t('contactUs', 'footer')}
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/warranty-policy"
                        className="hover:text-red-500 hover:translate-x-1 inline-block transition-all duration-300 text-xs sm:text-sm"
                      >
                        {t('warrantyPolicy', 'footer')}
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/return-policy"
                        className="hover:text-red-500 hover:translate-x-1 inline-block transition-all duration-300 text-xs sm:text-sm"
                      >
                        {t('returnPolicy', 'footer')}
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/shopping-guide"
                        className="hover:text-red-500 hover:translate-x-1 inline-block transition-all duration-300 text-xs sm:text-sm"
                      >
                        {t('shoppingGuide', 'footer')}
                      </Link>
                    </li>
                  </ul>
                </div>

                {/* Contact Column */}
                <div>
                  <h3 className="mb-3 sm:mb-4 relative inline-block font-bold text-sm sm:text-base">
                    {t('contactTitle', 'footer')}
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600" />
                  </h3>
                  <ul className="space-y-2.5 sm:space-y-3 text-gray-400">
                    <li className="flex items-center gap-2 sm:gap-3 group">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-white/10 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-red-600 transition-colors">
                        <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <span className="text-xs sm:text-sm">{t('address', 'footer')}</span>
                    </li>
                    <li className="flex items-center gap-2 sm:gap-3 group">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-white/10 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-red-600 transition-colors">
                        <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <a href={`tel:${t('contact_phone_display', 'footer').replace(/\s/g, '')}`} className="hover:text-red-500 transition-colors text-xs sm:text-sm">
                        {t('contact_phone_display', 'footer')}
                      </a>
                    </li>
                    <li className="flex items-center gap-2 sm:gap-3 group">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-white/10 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-red-600 transition-colors">
                        <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <a href={`mailto:${t('contact_email_display', 'footer')}`} className="hover:text-red-500 transition-colors text-xs sm:text-sm break-all">
                        {t('contact_email_display', 'footer')}
                      </a>
                    </li>
                  </ul>
                </div>

                {/* Shipping Units Column */}
                <div className="text-center">
                  <h3 className="mb-3 sm:mb-4 relative inline-block font-bold text-sm sm:text-base">
                    {t('shippingPartners', 'footer')}
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600" />
                  </h3>
                  <div className="laminated-card mx-auto">
                    <img
                      src="/assets/ghnLogo.webp"
                      alt={t('ghn_icon_alt', 'footer')}
                      width="183"
                      height="41"
                      loading="lazy"
                      decoding="async"
                      className="logo-image"
                    />
                  </div>
                </div>

                {/* Payment Methods Column */}
                <div className="text-center">
                  <h3 className="mb-3 sm:mb-4 relative inline-block font-bold text-sm sm:text-base">
                    {t('paymentMethods', 'footer')}
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600" />
                  </h3>
                  <div className="laminated-card mx-auto">
                    <img
                      src="/assets/vnpay.webp"
                      alt={t('vnpay_logo_alt', 'footer')}
                      width="183"
                      height="56"
                      loading="lazy"
                      decoding="async"
                      className="logo-image"
                    />
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-white/10 pt-6 sm:pt-8 flex flex-col md:flex-row justify-center items-center gap-4 text-xs sm:text-sm">
            <div className="text-gray-400 text-center">
              <p>{t('copyright', 'footer')}</p>
              <p>{t('madeWith', 'footer')}</p>
            </div>

            <div className="flex items-center gap-3 sm:gap-4 text-gray-400 flex-wrap justify-center">
              <Link href="/terms-of-service" className="hover:text-red-500 transition-colors">{t('termsOfService', 'footer')}</Link>
              <span className="divider-separator">{t('separator', 'footer')}</span>
              <Link href="/privacy-policy" className="hover:text-red-500 transition-colors">{t('privacyPolicy', 'footer')}</Link>
              <span className="divider-separator">{t('separator', 'footer')}</span>
              <Link href="/sitemap" className="hover:text-red-500 transition-colors">{t('sitemap', 'footer')}</Link>
            </div>
          </div>
        </div>
      </div>

    </footer>
  );
}
