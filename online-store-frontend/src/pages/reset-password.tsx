import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { apiCall } from "../lib/api";
import { useLanguage } from "../lib/i18n";

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default function ResetPassword() {
  const router = useRouter();
  const { token } = router.query;
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup redirect timer on unmount
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  // Validate token exists
  useEffect(() => {
    if (router.isReady && !token) {
      toast.error(t('reset_password_invalid_token', 'login'));
      router.push("/login");
    }
  }, [router.isReady, token, router, t]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.password) {
      newErrors.password = t('reset_password_password_required', 'login');
    } else if (formData.password.length < 6) {
      newErrors.password = t('reset_password_password_min', 'login');
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = t('reset_password_confirm_required', 'login');
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t('reset_password_passwords_not_match', 'login');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (!token) {
      toast.error(t('reset_password_invalid_token', 'login'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiCall<{ message: string }>("/users/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: token,
          newPassword: formData.password,
        }),
      });

      setIsSuccess(true);
      toast.success(t('reset_password_success_toast', 'login'));

      // Redirect to login after 2 seconds
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
      redirectTimerRef.current = setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (error: any) {
      const errorMessage = error?.message || t('reset_password_error', 'login');
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (!router.isReady) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg border p-8 text-center">
            <p className="text-gray-600">{t('reset_password_loading', 'login')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg border p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-red-600 text-white px-4 py-3 rounded">
              <span className="text-2xl font-bold">{t('logo_text', 'login')}</span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center mb-2">{t('reset_password_title', 'login')}</h1>
          <p className="text-center text-gray-600 text-sm mb-6">
            {t('reset_password_desc', 'login')}
          </p>

          {isSuccess ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-green-800 font-medium mb-2">
                {t('reset_password_success_title', 'login')}
              </p>
              <p className="text-green-700 text-sm mb-6">
                {t('reset_password_success_msg', 'login')}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t('reset_password_new_password_label', 'login')}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder={t('reset_password_new_password_placeholder', 'login')}
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  autoComplete="new-password"
                  disabled={isLoading}
                />
                {errors.password && (
                  <p className="text-red-600 text-sm">{errors.password}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('reset_password_confirm_label', 'login')}</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder={t('reset_password_confirm_placeholder', 'login')}
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({ ...formData, confirmPassword: e.target.value })
                  }
                  autoComplete="new-password"
                  disabled={isLoading}
                />
                {errors.confirmPassword && (
                  <p className="text-red-600 text-sm">{errors.confirmPassword}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700"
                disabled={isLoading || !token}
              >
                {isLoading ? t('processing', 'common') : t('reset_password_button', 'login')}
              </Button>

              <div className="text-center text-sm">
                <Link href="/login">{t('reset_password_back', 'login')}</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
