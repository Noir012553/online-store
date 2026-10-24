import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { apiCall } from "../lib/api";
import { useLanguage } from "../lib/i18n";

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default function ForgotPassword() {
  const router = useRouter();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error(t('forgot_password_email_required', 'login'));
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(t('forgot_password_invalid_email', 'login'));
      return;
    }

    const requestBody = { email };
    const jsonBody = JSON.stringify(requestBody);

    setIsLoading(true);
    try {
      const response = await apiCall<{ message: string }>("/users/forgot-password", {
        method: "POST",
        body: jsonBody,
      });

      setIsSubmitted(true);
      toast.success(t('forgot_password_success', 'login'));
    } catch (error) {
      toast.error(t('forgot_password_error', 'login'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg border p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-red-600 text-white px-4 py-3 rounded">
              <span className="text-2xl font-bold">{t('logo_text', 'login')}</span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center mb-2">{t('forgot_password_title', 'login')}</h1>
          <p className="text-center text-gray-600 text-sm mb-6">
            {t('forgot_password_desc', 'login')}
          </p>

          {isSubmitted ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-green-800 font-medium mb-4">
                {t('forgot_password_check_email', 'login')}
              </p>
              <p className="text-green-700 text-sm mb-6">
                {t('forgot_password_link_sent', 'login')}
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  {t('forgot_password_back', 'login')}
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('forgot_password_email_label', 'login')}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t('forgot_password_email_placeholder', 'login')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={isLoading}
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700"
                disabled={isLoading}
              >
                {isLoading ? t('processing', 'common') : t('forgot_password_button', 'login')}
              </Button>

              <div className="text-center text-sm">
                <Link href="/login">{t('forgot_password_back', 'login')}</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
