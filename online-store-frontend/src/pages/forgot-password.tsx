import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { apiCall } from "../lib/api";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Vui lòng nhập email");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Email không hợp lệ");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiCall<{ message: string }>("/users/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      setIsSubmitted(true);
      toast.success("Hướng dẫn đặt lại mật khẩu đã được gửi đến email của bạn!");
    } catch (error) {
      toast.error("Có lỗi xảy ra. Vui lòng thử lại.");
      console.error("Forgot password error:", error);
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
              <span className="text-2xl font-bold">LT</span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center mb-2">Quên Mật Khẩu</h1>
          <p className="text-center text-gray-600 text-sm mb-6">
            Nhập email của bạn để nhận hướng dẫn đặt lại mật khẩu
          </p>

          {isSubmitted ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-green-800 font-medium mb-4">
                Kiểm tra email của bạn!
              </p>
              <p className="text-green-700 text-sm mb-6">
                Nếu email tồn tại trong hệ thống, bạn sẽ nhận được email chứa link để đặt lại mật khẩu.
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  Quay lại đăng nhập
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Nhập email của bạn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700"
                disabled={isLoading}
              >
                {isLoading ? "Đang xử lý..." : "Gửi Yêu Cầu"}
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
