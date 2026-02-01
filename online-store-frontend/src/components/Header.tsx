import { Search, User, Menu, LogOut, ChevronDown } from "lucide-react";
import Link from "next/link"; // Thay thế Link từ react-router-dom bằng Link từ next/link
import { useRouter } from "next/router"; // Thay thế useNavigate bằng useRouter
import { useCart } from "../lib/context/CartContext";
import { useAuth } from "../lib/context/AuthContext";
import { categoryAPI } from "../lib/api";
import { categoryToSlug } from "../lib/categoryUtils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useState, useEffect } from "react";
import { Input } from "./ui/input";
import { ShoppingCartIcon } from "./icons/SocialIcons";
import { SearchDropdown } from "./SearchDropdown";

export function Header() {
  const { totalItems } = useCart();
  const { user, logout, isAdmin } = useAuth();
  const router = useRouter(); // Sử dụng useRouter thay vì useNavigate
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileProductsOpen, setMobileProductsOpen] = useState(false);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await categoryAPI.getCategories();
        const cats = response.categories || response;
        setCategories(Array.isArray(cats) ? cats : []);
      } catch (err) {
        // Silently continue on fetch error
      }
    };
    fetchCategories();
  }, []);

  return (
    <>
      <header className="sticky top-0 z-50 bg-white border-b shadow-sm h-20">
        <div className="container mx-auto px-4 h-full flex items-center justify-between">
          {/* Left: Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <div className="bg-red-600 text-white px-3 py-2 rounded group-hover:bg-red-700 transition-colors">
              <span className="text-xl">LT</span>
            </div>
            <span className="text-xl group-hover:text-red-600 transition-colors hidden sm:inline">LaptopStore</span>
          </Link>

          {/* Center: Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-6 flex-1 justify-center">
            <Link href="/" className="hover:text-red-600 transition-colors">
              Trang chủ
            </Link>

            {/* Products Dropdown - Opens on Hover */}
            <div
              className="relative group"
              onMouseEnter={() => setProductDropdownOpen(true)}
              onMouseLeave={() => setProductDropdownOpen(false)}
            >
              <button className="flex items-center gap-1 hover:text-red-600 transition-colors cursor-pointer py-2">
                Sản phẩm
                <ChevronDown className="w-4 h-4" />
              </button>

              {/* Dropdown Content */}
              <div className={`absolute left-1/2 -translate-x-1/2 top-full mt-0 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 transition-opacity duration-200 ${
                productDropdownOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
              }`}>
                <Link
                  href="/products"
                  className="block px-4 py-3 hover:bg-gray-100 hover:text-red-600 transition-colors text-gray-900 first:rounded-t-lg border-b border-gray-200"
                >
                  Tất cả sản phẩm
                </Link>
                {categories.map((category, index) => (
                  <Link
                    key={category._id}
                    href={`/products/${categoryToSlug(category.name)}`}
                    className={`block px-4 py-3 hover:bg-gray-100 hover:text-red-600 transition-colors text-gray-900 border-b border-gray-200 last:border-b-0 ${index === categories.length - 1 ? 'rounded-b-lg' : ''}`}
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>

            <Link href="/about" className="hover:text-red-600 transition-colors">
              Giới thiệu
            </Link>
            <Link href="/contact" className="hover:text-red-600 transition-colors">
              Liên hệ
            </Link>
            {isAdmin && (
              <Link href="/admin" className="hover:text-red-600 transition-colors">
                Quản trị
              </Link>
            )}
          </nav>

          {/* Right: Search, Cart, User, Mobile Menu */}
          <div className="flex items-center gap-4">
            <div className="hidden lg:block">
              <SearchDropdown />
            </div>

            <Link href="/cart" className="relative flex items-center justify-center">
              <ShoppingCartIcon className="w-5 h-5" />
              {totalItems > 0 && (
                <Badge className="absolute -top-2 -right-2 bg-red-600 animate-in zoom-in duration-300 px-1 py-0 text-[8px] h-4 w-4 flex items-center justify-center">
                  {totalItems}
                </Badge>
              )}
            </Link>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="hover:text-red-600">
                    <User className="w-12 h-12" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white border-gray-200">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <p className="font-semibold text-gray-900">{user.name}</p>
                    <p className="text-sm text-gray-600">{user.email}</p>
                  </div>
                  <DropdownMenuItem onClick={() => router.push("/profile")} className="hover:bg-gray-100">
                    Hồ sơ
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/my-orders")} className="hover:bg-gray-100">
                    Đơn hàng
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => router.push("/admin")} className="hover:bg-gray-100">
                      Quản trị
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      logout();
                      router.push("/");
                    }}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Đăng xuất
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/login">
                <Button variant="ghost" size="icon" className="hover:text-red-600">
                  <User className="w-12 h-12" />
                </Button>
              </Link>
            )}

            {/* Mobile Hamburger Menu */}
            <button
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b shadow-md">
          <div className="container mx-auto px-4 py-4">
            <div className="mb-4">
              <SearchDropdown />
            </div>
            <nav className="flex flex-col gap-3 border-t pt-3">
              <Link
                href="/"
                className="py-2 hover:text-red-600 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Trang chủ
              </Link>

              {/* Mobile Products Dropdown */}
              <div>
                <button
                  onClick={() => setMobileProductsOpen(!mobileProductsOpen)}
                  className="py-2 w-full text-left flex items-center justify-between hover:text-red-600 transition-colors"
                >
                  Sản phẩm
                  <ChevronDown className={`w-4 h-4 transition-transform ${mobileProductsOpen ? 'rotate-180' : ''}`} />
                </button>
                {mobileProductsOpen && (
                  <div className="flex flex-col gap-2 pl-4 border-l-2 border-gray-200 my-2">
                    <Link
                      href="/products"
                      className="py-2 hover:text-red-600 transition-colors text-sm"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Tất cả sản phẩm
                    </Link>
                    {categories.map((category) => (
                      <Link
                        key={category._id}
                        href={`/products/${categoryToSlug(category.name)}`}
                        className="py-2 hover:text-red-600 transition-colors text-sm"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {category.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <Link
                href="/about"
                className="py-2 hover:text-red-600 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Giới thiệu
              </Link>
              <Link
                href="/contact"
                className="py-2 hover:text-red-600 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Liên hệ
              </Link>
              {user ? (
                <>
                  <Link
                    href="/profile"
                    className="py-2 hover:text-red-600 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Hồ sơ
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className="py-2 hover:text-red-600 transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Quản trị
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      logout();
                      router.push("/");
                      setMobileMenuOpen(false);
                    }}
                    className="py-2 text-left hover:text-red-600 transition-colors text-red-600"
                  >
                    Đăng xuất
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="py-2 hover:text-red-600 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Đăng nhập
                </Link>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
