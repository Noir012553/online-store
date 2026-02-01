import { Mail, Phone, MapPin } from "lucide-react";
import Link from "next/link";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useState, useEffect } from "react";
import {
  FacebookIcon,
  InstagramIcon,
  YoutubeIcon,
  SendIcon,
  TwitterIcon
} from "./icons/SocialIcons";
import { categoryAPI } from "../lib/api";
import { categoryToSlug } from "../lib/categoryUtils";

interface Category {
  _id: string;
  name: string;
  slug?: string;
  description?: string;
}

export function Footer() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // Fetch categories from API
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await categoryAPI.getCategories();
        // Backend returns { categories, page, pages }
        const categoryData = response?.categories || response?.data || response || [];
        if (Array.isArray(categoryData)) {
          setCategories(categoryData);
        } else {
          setCategories([]);
        }
      } catch (error) {
        // Fallback to empty array
        setCategories([]);
      } finally {
        setLoadingCategories(false);
      }
    };

    fetchCategories();
  }, []);

  const validateEmail = (value: string) => {
    if (!value) {
      setEmailError("");
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      setEmailError("Email không hợp lệ");
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
      setPhoneError("Số điện thoại không hợp lệ (VN)");
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

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateEmail(email)) {
      alert("Cảm ơn bạn đã đăng ký email!");
      setEmail("");
    }
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validatePhone(phone)) {
      alert("Cảm ơn bạn đã đăng ký số điện thoại!");
      setPhone("");
    }
  };


  return (
    <footer className="relative bg-black text-white mt-20 overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 opacity-20">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1762279389042-9439bfb6c155?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHxfc2VhcmNofDF8fGRhcmslMjBhYnN0cmFjdCUyMHRlY2hub2xvZ3klMjBwYXR0ZXJufGVufDF8fHwxNzY0NjU4NTU1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral')`
          }}
        />
      </div>

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-linear-to-br from-black via-gray-900 to-red-950/30" />

      {/* Animated Dots Pattern */}
      <div className="absolute inset-0" style={{
        backgroundImage: 'radial-gradient(circle, rgba(239, 68, 68, 0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px',
        animation: 'movePattern 20s linear infinite'
      }} />

      <style>{`
        @keyframes movePattern {
          0% { background-position: 0 0; }
          100% { background-position: 50px 50px; }
        }

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
          transition: all 0.3s ease;
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
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col md:flex-row gap-12 mb-12">
            {/* Left Column: Brand, Inputs, Social Icons (3/10) */}
            <div className="md:flex-3">
              <div className="flex items-center gap-2 mb-4 group">
                <div className="bg-linear-to-br from-red-600 to-red-700 text-white px-3 py-2 rounded-lg shadow-lg group-hover:shadow-red-600/50 transition-all duration-300">
                  <span className="text-xl">LT</span>
                </div>
                <span className="text-xl">LaptopStore</span>
              </div>
              <p className="text-gray-400 mb-6 leading-relaxed">
                Cửa hàng laptop uy tín với hơn 10 năm kinh nghiệm, cung cấp sản phẩm chính hãng, giá tốt nhất thị trường.</p>

              {/* Newsletter */}
              <div className="mb-6">
                <h4 className="text-sm mb-3">Đăng ký nhận tin khuyến mãi</h4>
                <div className="space-y-2">
                  <form onSubmit={handleEmailSubmit} className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        type="email"
                        placeholder="Email của bạn"
                        value={email}
                        onChange={handleEmailChange}
                        className="bg-white/10 border-white/20 text-white placeholder:text-gray-400"
                      />
                      {emailError && <p className="text-red-400 text-xs mt-1">{emailError}</p>}
                    </div>
                    <Button
                      type="submit"
                      size="icon"
                      className="bg-red-600 hover:bg-red-700 shrink-0"
                    >
                      <SendIcon className="w-4 h-4" />
                    </Button>
                  </form>
                  <form onSubmit={handlePhoneSubmit} className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        type="tel"
                        placeholder="Số điện thoại của bạn"
                        value={phone}
                        onChange={handlePhoneChange}
                        className="bg-white/10 border-white/20 text-white placeholder:text-gray-400"
                      />
                      {phoneError && <p className="text-red-400 text-xs mt-1">{phoneError}</p>}
                    </div>
                    <Button
                      type="submit"
                      size="icon"
                      className="bg-blue-600 hover:bg-blue-700 shrink-0"
                    >
                      <SendIcon className="w-4 h-4 text-white" />
                    </Button>
                  </form>
                </div>
              </div>

              {/* Social Links */}
              <div className="flex gap-3">
                <a
                  href="#"
                  className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-red-600 hover:scale-110 transition-all duration-300"
                >
                  <FacebookIcon className="w-5 h-5" />
                </a>
                <a
                  href="#"
                  className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-red-600 hover:scale-110 transition-all duration-300"
                >
                  <InstagramIcon className="w-5 h-5" />
                </a>
                <a
                  href="#"
                  className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-red-600 hover:scale-110 transition-all duration-300"
                >
                  <YoutubeIcon className="w-5 h-5" />
                </a>
                <a
                  href="#"
                  className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-red-600 hover:scale-110 transition-all duration-300"
                >
                  <TwitterIcon className="w-5 h-5" />
                </a>
                <a
                  href="#"
                  className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-red-600 hover:scale-110 transition-all duration-300"
                >
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/d/d6/Logo_Zalo.png"
                    alt="Zalo"
                    className="w-5 h-5 object-contain"
                  />
                </a>
              </div>
            </div>

            {/* Right Column: 6 Menu Items (7/10) */}
            <div className="md:flex-7">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                {/* Row 1: Products, Support, Contact */}

                {/* Products Column */}
                <div>
                  <h3 className="mb-4 relative inline-block font-bold">
                    Sản phẩm
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600" />
                  </h3>
                  {loadingCategories ? (
                    <ul className="space-y-3 text-gray-400">
                      <li className="text-xs">Đang tải...</li>
                    </ul>
                  ) : categories.length > 0 ? (
                    <ul className="space-y-3 text-gray-400">
                      {categories.map((category) => {
                        const slug = category.slug || categoryToSlug(category.name);
                        return (
                          <li key={category._id}>
                            <Link
                              href={`/products/${slug}`}
                              className="hover:text-red-500 hover:translate-x-1 inline-block transition-all duration-300"
                            >
                              {category.name}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <ul className="space-y-3 text-gray-400">
                      <li className="text-xs">Không có danh mục</li>
                    </ul>
                  )}
                </div>

                {/* Support Column */}
                <div>
                  <h3 className="mb-4 relative inline-block font-bold">
                    Hỗ trợ
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600" />
                  </h3>
                  <ul className="space-y-3 text-gray-400">
                    <li>
                      <Link
                        href="/about"
                        className="hover:text-red-500 hover:translate-x-1 inline-block transition-all duration-300"
                      >
                        Giới thiệu
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/contact"
                        className="hover:text-red-500 hover:translate-x-1 inline-block transition-all duration-300"
                      >
                        Liên hệ
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/warranty-policy"
                        className="hover:text-red-500 hover:translate-x-1 inline-block transition-all duration-300"
                      >
                        Chính sách bảo hành
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/return-policy"
                        className="hover:text-red-500 hover:translate-x-1 inline-block transition-all duration-300"
                      >
                        Chính sách đổi trả
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/shopping-guide"
                        className="hover:text-red-500 hover:translate-x-1 inline-block transition-all duration-300"
                      >
                        Hướng dẫn mua hàng
                      </Link>
                    </li>
                  </ul>
                </div>

                {/* Contact Column */}
                <div>
                  <h3 className="mb-4 relative inline-block font-bold">
                    Liên hệ
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600" />
                  </h3>
                  <ul className="space-y-4 text-gray-400">
                    <li className="flex items-center gap-3 group">
                      <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-red-600 transition-colors">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <span className="text-sm">123 Đường Lê Lợi, Quận 1, TP.HCM</span>
                    </li>
                    <li className="flex items-center gap-3 group">
                      <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-red-600 transition-colors">
                        <Phone className="w-4 h-4" />
                      </div>
                      <a href="tel:0901234567" className="hover:text-red-500 transition-colors text-sm">
                        090 123 4567
                      </a>
                    </li>
                    <li className="flex items-center gap-3 group">
                      <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-red-600 transition-colors">
                        <Mail className="w-4 h-4" />
                      </div>
                      <a href="mailto:info@laptopstore.vn" className="hover:text-red-500 transition-colors text-sm">
                        info@laptopstore.vn
                      </a>
                    </li>
                  </ul>
                </div>

                {/* Shipping Units Column */}
                <div>
                  <h3 className="mb-4 relative inline-block font-bold">
                    Đơn vị vận chuyển
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600" />
                  </h3>
                  <div className="laminated-card">
                    <img
                      src="/assets/ghnLogo.png"
                      alt="GHN Icon"
                      className="logo-image"
                    />
                  </div>
                </div>

                {/* Payment Methods Column */}
                <div>
                  <h3 className="mb-4 relative inline-block font-bold">
                    Phương thức thanh toán
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600" />
                  </h3>
                  <div className="laminated-card">
                    <img
                      src="/assets/vnpay.png"
                      alt="VNPay Logo"
                      className="logo-image"
                    />
                  </div>
                </div>

                {/* App Store Column */}
                <div>
                  <h3 className="mb-4 relative inline-block font-bold">
                    Tải ứng dụng
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-red-600" />
                  </h3>
                  <div className="flex flex-col gap-3">
                    <a
                      href="#"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:opacity-80 transition-opacity"
                    >
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/3/3c/Download_on_the_App_Store_Badge.svg"
                        alt="Download on the App Store"
                        className="h-10"
                      />
                    </a>
                    <a
                      href="#"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:opacity-80 transition-opacity"
                    >
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg"
                        alt="Get it on Google Play"
                        className="h-10"
                      />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-gray-400 text-sm text-center md:text-left">
              <p>&copy; 2024 LaptopStore. Toàn bộ quyền được bảo lưu.</p>
              <p>Tạo ra với ❤️ tại Việt Nam</p>
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-400">
              <a href="#" className="hover:text-red-500 transition-colors">Điều khoản</a>
              <span>•</span>
              <a href="#" className="hover:text-red-500 transition-colors">Bảo mật</a>
              <span>•</span>
              <a href="#" className="hover:text-red-500 transition-colors">Sitemap</a>
            </div>
          </div>
        </div>
      </div>

    </footer>
  );
}
