import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { apiCall } from "../lib/api";

export default function ResetPassword() {
  const router = useRouter();
  const { token } = router.query;
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Validate token exists
  useEffect(() => {
    if (router.isReady && !token) {
      toast.error("Token không hợp lệ");
      router.push("/login");
    }
  }, [router.isReady, token, router]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.password) {
      newErrors.password = "Mật khẩu là bắt buộc";
    } else if (formData.password.length < 6) {
      newErrors.password = "Mật khẩu phải có ít nhất 6 ký tự";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Xác nhận mật khẩu là bắt buộc";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Mật khẩu xác nhận không khớp";
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
      toast.error("Token không hợp lệ");
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
      toast.success("Mật khẩu của bạn đã được thay đổi thành công!");
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (error: any) {
      const errorMessage =
        error?.message || "Có lỗi xảy ra. Vui lòng thử lại.";
      toast.error(errorMessage);
      console.error("Reset password error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!router.isReady) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg border p-8 text-center">
            <p className="text-gray-600">Đang tải...</p>
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
              <span className="text-2xl font-bold">LT</span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center mb-2">Đặt Lại Mật Khẩu</h1>
          <p className="text-center text-gray-600 text-sm mb-6">
            Nhập mật khẩu mới của bạn
          </p>

          {isSuccess ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-green-800 font-medium mb-2">
                Thành công!
              </p>
              <p className="text-green-700 text-sm mb-6">
                Mật khẩu của bạn đã được thay đổi. Bạn sẽ được chuyển hướng đến trang đăng nhập...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Mật Khẩu Mới</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Nhập mật khẩu mới"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  disabled={isLoading}
                />
                {errors.password && (
                  <p className="text-red-600 text-sm">{errors.password}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Xác Nhận Mật Khẩu</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Xác nhận mật khẩu mới"
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({ ...formData, confirmPassword: e.target.value })
                  }
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
                {isLoading ? "Đang xử lý..." : "Đặt Lại Mật Khẩu"}
              </Button>

              <div className="text-center text-sm">
                <Link href="/login" className="text-red-600 hover:underline">
                  Quay lại đăng nhập
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
