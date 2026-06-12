import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/context/AuthContext";
import { getSafeReturnPath } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import styles from "../styles/login.module.css";
import { useTranslation } from "../lib/i18n";

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default function Login() {
  const router = useRouter();
  const { login, register, googleLogin } = useAuth();
  const { t, loadNamespace } = useTranslation();
  const [activeTab, setActiveTab] = useState("login");

  useEffect(() => {
    loadNamespace('login');
  }, [loadNamespace]);

  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  const [registerData, setRegisterData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({});

  const from = getSafeReturnPath(router.query.from);

  useEffect(() => {
    const { token } = router.query;
    if (token && typeof token === 'string') {
      const handleToken = async () => {
        const success = await googleLogin(token);
        if (success) {
          toast.success(t('login_successful', 'login'));
          router.replace(from);
        } else {
          toast.error(t('login_failed', 'login'));
        }
      };
      handleToken();
    }
  }, [router.query, googleLogin, router, from]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(loginData.email, loginData.password);
    if (success) {
      toast.success(t('login_successful', 'login'));
      router.replace(from);
    } else {
      toast.error(t('login_failed', 'login'));
    }
  };

  const validateRegisterForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!registerData.name.trim()) {
      errors.name = t('name_required', 'login');
    }

    if (!registerData.email.trim()) {
      errors.email = t('email_required', 'login');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerData.email)) {
      errors.email = t('invalid_email_format', 'login');
    }

    if (!registerData.password) {
      errors.password = t('password_required', 'login');
    } else if (registerData.password.length < 6) {
      errors.password = t('password_min_length', 'login');
    }

    if (!registerData.confirmPassword) {
      errors.confirmPassword = t('confirm_password_required', 'login');
    } else if (registerData.password !== registerData.confirmPassword) {
      errors.confirmPassword = t('passwords_not_match', 'login');
    }

    setRegisterErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateRegisterForm()) {
      return;
    }

    const success = await register(
      registerData.email,
      registerData.password,
      registerData.name
    );

    if (success) {
      toast.success(t('registration_successful', 'login'));
      setRegisterErrors({});
      setRegisterData({ name: "", email: "", password: "", confirmPassword: "" });
      router.replace(from);
    } else {
      toast.error(t('registration_failed', 'login'));
    }
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg border p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-red-600 text-white px-4 py-3 rounded">
              <span className="text-2xl">{t('logo_text', 'login')}</span>
            </div>
            <span className="text-2xl ml-2">{t('brand_name', 'login')}</span>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={styles.toggleSwitch}>
              <TabsTrigger value="login" className={styles.toggleTrigger}>{t('login_tab', 'login')}</TabsTrigger>
              <TabsTrigger value="register" className={styles.toggleTrigger}>{t('signup_tab', 'login')}</TabsTrigger>
            </TabsList>

            <div className={styles.flipContainer}>
              <div
                className={`${styles.flipCard} ${
                  activeTab === "login" ? styles.active : ""
                }`}
              >
                <TabsContent value="login" className={styles.tabContent}>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="login-email">{t('email_label', 'login')}</Label>
                      <Input
                        id="login-email"
                        name="email"
                        type="email"
                        placeholder={t('email_placeholder', 'login')}
                        value={loginData.email}
                        onChange={(e) =>
                          setLoginData({ ...loginData, email: e.target.value })
                        }
                        autoComplete="email"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="login-password">{t('password_label', 'login')}</Label>
                      <Input
                        id="login-password"
                        name="password"
                        type="password"
                        placeholder={t('password_placeholder', 'login')}
                        value={loginData.password}
                        onChange={(e) =>
                          setLoginData({ ...loginData, password: e.target.value })
                        }
                        autoComplete="current-password"
                        required
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="remember-me" className="flex items-center gap-2 cursor-pointer">
                        <input
                          id="remember-me"
                          name="remember-me"
                          type="checkbox"
                          autoComplete="off"
                        />
                        <span>{t('remember_me', 'login')}</span>
                      </label>
                      <Link href="/forgot-password" className="text-red-600 hover:underline">
                        {t('forgot_password', 'login')}
                      </Link>
                    </div>
                    <Button type="submit" className="w-full bg-red-600 hover:bg-red-700">
                      {t('login_button', 'login')}
                    </Button>

                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-2 text-gray-500">
                          {t('or_continue_with', 'login')}
                        </span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full flex items-center justify-center gap-2"
                      onClick={() => {
                        window.location.href = '/api/users/auth/google';
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      {t('google_login', 'login')}
                    </Button>

                    {process.env.NODE_ENV === 'development' && (
                      <div className="text-center text-xs text-gray-600 mt-4">
                        <p>{t('demo_credentials', 'login')}</p>
                        <p>{t('demo_admin', 'login')}</p>
                        <p>{t('demo_user', 'login')}</p>
                      </div>
                    )}
                  </form>
                </TabsContent>
              </div>

              <div
                className={`${styles.flipCard} ${
                  activeTab === "register" ? styles.active : ""
                }`}
              >
                <TabsContent value="register" className={styles.tabContent}>
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="register-name">{t('fullname_label', 'login')}</Label>
                      <Input
                        id="register-name"
                        name="name"
                        placeholder={t('fullname_placeholder', 'login')}
                        value={registerData.name}
                        onChange={(e) => {
                          setRegisterData({ ...registerData, name: e.target.value });
                          if (registerErrors.name) {
                            setRegisterErrors({ ...registerErrors, name: "" });
                          }
                        }}
                        autoComplete="name"
                        className={registerErrors.name ? "border-red-500" : ""}
                        required
                      />
                      {registerErrors.name && (
                        <p className="text-red-500 text-sm mt-1">{registerErrors.name}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="register-email">{t('email_label', 'login')}</Label>
                      <Input
                        id="register-email"
                        name="email"
                        type="email"
                        placeholder={t('email_placeholder', 'login')}
                        value={registerData.email}
                        onChange={(e) => {
                          setRegisterData({ ...registerData, email: e.target.value });
                          if (registerErrors.email) {
                            setRegisterErrors({ ...registerErrors, email: "" });
                          }
                        }}
                        autoComplete="email"
                        className={registerErrors.email ? "border-red-500" : ""}
                        required
                      />
                      {registerErrors.email && (
                        <p className="text-red-500 text-sm mt-1">{registerErrors.email}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="register-password">{t('password_label', 'login')}</Label>
                      <Input
                        id="register-password"
                        name="password"
                        type="password"
                        placeholder={t('password_placeholder', 'login')}
                        value={registerData.password}
                        onChange={(e) => {
                          setRegisterData({ ...registerData, password: e.target.value });
                          if (registerErrors.password) {
                            setRegisterErrors({ ...registerErrors, password: "" });
                          }
                        }}
                        autoComplete="new-password"
                        className={registerErrors.password ? "border-red-500" : ""}
                        required
                      />
                      {registerErrors.password && (
                        <p className="text-red-500 text-sm mt-1">{registerErrors.password}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="register-confirm-password">{t('confirm_password_label', 'login')}</Label>
                      <Input
                        id="register-confirm-password"
                        name="confirm-password"
                        type="password"
                        placeholder={t('confirm_password_placeholder', 'login')}
                        value={registerData.confirmPassword}
                        onChange={(e) => {
                          setRegisterData({
                            ...registerData,
                            confirmPassword: e.target.value,
                          });
                          if (registerErrors.confirmPassword) {
                            setRegisterErrors({ ...registerErrors, confirmPassword: "" });
                          }
                        }}
                        autoComplete="new-password"
                        className={registerErrors.confirmPassword ? "border-red-500" : ""}
                        required
                      />
                      {registerErrors.confirmPassword && (
                        <p className="text-red-500 text-sm mt-1">{registerErrors.confirmPassword}</p>
                      )}
                    </div>
                    <Button type="submit" className="w-full bg-red-600 hover:bg-red-700">
                      {t('signup_button', 'login')}
                    </Button>
                  </form>
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
