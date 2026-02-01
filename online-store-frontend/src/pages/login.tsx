import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../lib/context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import styles from "../styles/login.module.css";

export default function Login() {
  const router = useRouter();
  const { login, register, googleLogin } = useAuth();
  const [activeTab, setActiveTab] = useState("login");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const [loginData, setLoginData] = useState({
    email: "admin@laptop.com",
    password: "admin123",
  });

  const [registerData, setRegisterData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({});

  const from = (router.query.from as string) || "/";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(loginData.email, loginData.password);
    if (success) {
      toast.success("Đăng nhập thành công!");
      router.replace(from);
    } else {
      toast.error("Email hoặc mật khẩu không đúng");
    }
  };

  const handleGoogleLogin = async (credentialResponse: any) => {
    try {
      setIsGoogleLoading(true);
      const idToken = credentialResponse.credential;
      const success = await googleLogin(idToken);
      if (success) {
        toast.success("Đăng nhập bằng Google thành công!");
        router.replace(from);
      } else {
        toast.error("Đăng nhập bằng Google thất bại");
      }
    } catch (error) {
      toast.error("Có lỗi xảy ra khi đăng nhập bằng Google");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const validateRegisterForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!registerData.name.trim()) {
      errors.name = "Họ và tên là bắt buộc";
    }

    if (!registerData.email.trim()) {
      errors.email = "Email là bắt buộc";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerData.email)) {
      errors.email = "Email không hợp lệ";
    }

    if (!registerData.password) {
      errors.password = "Mật khẩu là bắt buộc";
    } else if (registerData.password.length < 6) {
      errors.password = "Mật khẩu phải có ít nhất 6 ký tự";
    }

    if (!registerData.confirmPassword) {
      errors.confirmPassword = "Xác nhận mật khẩu là bắt buộc";
    } else if (registerData.password !== registerData.confirmPassword) {
      errors.confirmPassword = "Mật khẩu xác nhận không khớp";
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
      toast.success("Đăng ký thành công!");
      setRegisterErrors({});
      setRegisterData({ name: "", email: "", password: "", confirmPassword: "" });
      router.replace(from);
    } else {
      toast.error("Đăng ký thất bại. Vui lòng thử lại.");
    }
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg border p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-red-600 text-white px-4 py-3 rounded">
              <span className="text-2xl">LT</span>
            </div>
            <span className="text-2xl ml-2">LaptopStore</span>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={styles.toggleSwitch}>
              <TabsTrigger value="login" className={styles.toggleTrigger}>Đăng nhập</TabsTrigger>
              <TabsTrigger value="register" className={styles.toggleTrigger}>Đăng ký</TabsTrigger>
            </TabsList>

            <div className={styles.flipContainer}>
              <div
                className={`${styles.flipCard} ${
                  activeTab === "login" ? styles.active : ""
                }`}
              >
                <TabsContent value="login" className={styles.tabContent}>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                    id="login-email"
                    type="email"
                    placeholder="Nhập email của bạn"
                    value={loginData.email}
                    onChange={(e) =>
                      setLoginData({ ...loginData, email: e.target.value })
                    }
                    required
                  />
                    </div>
                    <div>
                      <Label htmlFor="login-password">Mật khẩu</Label>
                      <Input
                    id="login-password"
                    type="password"
                    placeholder="Nhập mật khẩu"
                    value={loginData.password}
                    onChange={(e) =>
                      setLoginData({ ...loginData, password: e.target.value })
                    }
                    required
                  />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" />
                        <span>Ghi nhớ đăng nhập</span>
                      </label>
                      <Link href="/forgot-password" className="text-red-600 hover:underline">
                        Quên mật khẩu?
                      </Link>
                    </div>
                    <Button type="submit" className="w-full bg-red-600 hover:bg-red-700">
                      Đăng nhập
                    </Button>

                    <div className="flex items-center gap-2 my-4">
                      <div className="flex-1 border-t"></div>
                      <span className="text-sm text-gray-500">HOẶC</span>
                      <div className="flex-1 border-t"></div>
                    </div>

                    <div className="flex justify-center">
                      <GoogleLogin
                        onSuccess={handleGoogleLogin}
                        onError={() => toast.error("Đăng nhập Google thất bại")}
                        disabled={isGoogleLoading}
                      />
                    </div>

                    <div className="text-center text-sm text-gray-600 mt-4">
                      <p>Đăng nhập demo:</p>
                      <p>Admin: admin@laptop.com / admin123</p>
                      <p>User: anyemail@email.com / 123456</p>
                    </div>
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
                    <div>
                      <Label htmlFor="register-name">Họ và tên</Label>
                      <Input
                        id="register-name"
                        placeholder="Nhập họ và tên"
                        value={registerData.name}
                        onChange={(e) => {
                          setRegisterData({ ...registerData, name: e.target.value });
                          if (registerErrors.name) {
                            setRegisterErrors({ ...registerErrors, name: "" });
                          }
                        }}
                        className={registerErrors.name ? "border-red-500" : ""}
                        required
                      />
                      {registerErrors.name && (
                        <p className="text-red-500 text-sm mt-1">{registerErrors.name}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="register-email">Email</Label>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="Nhập email của bạn"
                        value={registerData.email}
                        onChange={(e) => {
                          setRegisterData({ ...registerData, email: e.target.value });
                          if (registerErrors.email) {
                            setRegisterErrors({ ...registerErrors, email: "" });
                          }
                        }}
                        className={registerErrors.email ? "border-red-500" : ""}
                        required
                      />
                      {registerErrors.email && (
                        <p className="text-red-500 text-sm mt-1">{registerErrors.email}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="register-password">Mật khẩu</Label>
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="Nhập mật khẩu (ít nhất 6 ký tự)"
                        value={registerData.password}
                        onChange={(e) => {
                          setRegisterData({ ...registerData, password: e.target.value });
                          if (registerErrors.password) {
                            setRegisterErrors({ ...registerErrors, password: "" });
                          }
                        }}
                        className={registerErrors.password ? "border-red-500" : ""}
                        required
                      />
                      {registerErrors.password && (
                        <p className="text-red-500 text-sm mt-1">{registerErrors.password}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="register-confirm-password">Xác nhận mật khẩu</Label>
                      <Input
                        id="register-confirm-password"
                        type="password"
                        placeholder="Xác nhận mật khẩu"
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
                        className={registerErrors.confirmPassword ? "border-red-500" : ""}
                        required
                      />
                      {registerErrors.confirmPassword && (
                        <p className="text-red-500 text-sm mt-1">{registerErrors.confirmPassword}</p>
                      )}
                    </div>
                    <Button type="submit" className="w-full bg-red-600 hover:bg-red-700">
                      Đăng ký
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
