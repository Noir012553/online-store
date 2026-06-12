import { Search, User, Menu, LogOut, ChevronDown } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useCart } from "../lib/context/CartContext";
import { useAuth } from "../lib/context/AuthContext";
import { useCategories } from "../lib/context/CategoryContext";
import { useTranslation } from "../lib/i18n";
import { useLogoutConfirm } from "../hooks/useLogoutConfirm";
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
import { BannerSlot } from "./BannerSlot";
import { LanguageSwitcher } from "./LanguageSwitcher";

const SearchDropdown = dynamic(() => import("./SearchDropdown").then((mod) => mod.SearchDropdown), {
  ssr: false,
});

function HeaderComponent() {
  const { totalItems } = useCart();
  const { user, isAdmin } = useAuth();
  const { categories } = useCategories();
  const { t, loadNamespace } = useTranslation();
  const { handleLogoutClick, ConfirmDialog } = useLogoutConfirm();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileProductsOpen, setMobileProductsOpen] = useState(false);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);

  // Ensure common namespace is loaded
  useEffect(() => {
    loadNamespace('common');
    loadNamespace('categories');
  }, [loadNamespace]);

  // Handle navigation safely after router is ready
  const handleNavigate = (path: string) => {
    if (router.isReady) {
      router.push(path);
    }
  };

  return (
    <>
      {/* Sitewide Top Banner */}
      <div className="relative z-[99]">
        <BannerSlot slot="sitewide_top" variant="strip" className="w-full" limit={1} />
      </div>

      <header className="sticky top-0 z-[100] bg-white border-b shadow-sm h-20">
        <div className="container mx-auto header-container-px h-full flex items-center justify-between">
          {/* Left: Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <div className="bg-red-600 text-white px-2 py-1.5 sm:px-3 sm:py-2 rounded group-hover:bg-red-700 transition-colors">
              <span className="text-sm sm:text-lg">{t('brand_initials', 'common')}</span>
            </div>
            <span className="text-xs sm:text-lg group-hover:text-red-600 transition-colors hidden md:inline">{t('brand_name', 'common')}</span>
          </Link>

          {/* Center: Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-6 flex-1 justify-center text-sm">
            <Link href="/" className="hover:text-red-600 transition-colors">
              {t('home')}
            </Link>

            {/* Products Dropdown - Opens on Hover */}
            <div
              className="relative group"
              onMouseEnter={() => setProductDropdownOpen(true)}
              onMouseLeave={() => setProductDropdownOpen(false)}
            >
              <button className="flex items-center gap-1 hover:text-red-600 transition-colors cursor-pointer py-2">
                {t('products')}
                <ChevronDown className="w-4 h-4" />
              </button>

              {/* Dropdown Content */}
              <div className={`absolute left-1/2 -translate-x-1/2 top-full mt-0 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 transition-opacity duration-200 ${
                productDropdownOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
              }`}>
                <Link
                  href="/products"
                  className="block px-4 py-3 hover:bg-gray-100 hover:text-red-600 transition-colors text-gray-900 first:rounded-t-lg border-b border-gray-200 text-sm"
                >
                  {t('allProducts')}
                </Link>
                {categories.map((category, index) => {
                  const displayName = category.translationKey ? t(category.translationKey, 'categories') : t(category.name, 'categories');
                  return (
                    <Link
                      key={category._id}
                      href={`/products/${categoryToSlug(category.name)}`}
                      className={`block px-4 py-3 hover:bg-gray-100 hover:text-red-600 transition-colors text-gray-900 border-b border-gray-200 last:border-b-0 text-sm ${index === categories.length - 1 ? 'rounded-b-lg' : ''}`}
                    >
                      {displayName}
                    </Link>
                  );
                })}
              </div>
            </div>

            <Link href="/about" className="hover:text-red-600 transition-colors">
              {t('about')}
            </Link>
            <Link href="/contact" className="hover:text-red-600 transition-colors">
              {t('contact')}
            </Link>
            {isAdmin && (
              <Link href="/admin" className="hover:text-red-600 transition-colors">
                {t('admin')}
              </Link>
            )}
          </nav>

          {/* Right: Search, Cart, User, Language, Mobile Menu */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden lg:block">
              <SearchDropdown />
            </div>

            <Link href="/cart" className="relative flex items-center justify-center p-1">
              <ShoppingCartIcon className="w-5 h-5" />
              {totalItems > 0 && (
                <Badge className="absolute -top-2 -right-2 bg-red-600 animate-in zoom-in duration-300 px-1 py-0 text-[8px] h-4 w-4 flex items-center justify-center">
                  {totalItems}
                </Badge>
              )}
            </Link>

            <LanguageSwitcher />

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="hover:text-red-600 p-1">
                    <User className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white border-gray-200 z-[150]">
                  <div className="px-4 py-3 bg-white border-b border-gray-200">
                    <p className="font-semibold text-gray-900">{user.name}</p>
                    <p className="text-sm text-gray-600">{user.email}</p>
                  </div>
                  <DropdownMenuItem onClick={() => handleNavigate("/profile")} className="hover:bg-gray-100">
                    {t('profile')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleNavigate("/my-orders")} className="hover:bg-gray-100">
                    {t('myOrders')}
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => handleNavigate("/admin")} className="hover:bg-gray-100">
                      {t('admin')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogoutClick}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    {t('logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/login">
                <Button variant="ghost" size="icon" className="hover:text-red-600 p-1">
                  <User className="w-5 h-5" />
                </Button>
              </Link>
            )}

            {/* Mobile Hamburger Menu */}
            <button
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={t('toggle_menu', 'components')}
              title={t('toggle_menu', 'components')}
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b shadow-md">
          <div className="container mx-auto header-container-px py-4">
            <div className="mb-4">
              <SearchDropdown />
            </div>
            <nav className="flex flex-col gap-3 border-t pt-3">
              <Link
                href="/"
                className="py-2 hover:text-red-600 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t('home')}
              </Link>

              {/* Mobile Products Dropdown */}
              <div>
                <button
                  onClick={() => setMobileProductsOpen(!mobileProductsOpen)}
                  className="py-2 w-full text-left flex items-center justify-between hover:text-red-600 transition-colors"
                >
                  {t('products')}
                  <ChevronDown className={`w-4 h-4 transition-transform ${mobileProductsOpen ? 'rotate-180' : ''}`} />
                </button>
                {mobileProductsOpen && (
                  <div className="flex flex-col gap-2 pl-4 border-l-2 border-gray-200 my-2">
                    <Link
                      href="/products"
                      className="py-2 hover:text-red-600 transition-colors text-sm"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {t('allProducts')}
                    </Link>
                    {categories.map((category) => {
                      return (
                        <Link
                          key={category._id}
                          href={`/products/${categoryToSlug(category.name)}`}
                          className="py-2 hover:text-red-600 transition-colors text-sm"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          {category.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              <Link
                href="/about"
                className="py-2 hover:text-red-600 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t('about')}
              </Link>
              <Link
                href="/contact"
                className="py-2 hover:text-red-600 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t('contact')}
              </Link>
              {user ? (
                <>
                  <Link
                    href="/profile"
                    className="py-2 hover:text-red-600 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {t('profile')}
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className="py-2 hover:text-red-600 transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {t('admin')}
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      handleLogoutClick();
                      setMobileMenuOpen(false);
                    }}
                    className="py-2 text-left hover:text-red-600 transition-colors text-red-600"
                  >
                    {t('logout')}
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="py-2 hover:text-red-600 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('login')}
                </Link>
              )}
            </nav>
          </div>
        </div>
      )}
      <ConfirmDialog />
    </>
  );
}

export const Header = dynamic(() => Promise.resolve(HeaderComponent), { ssr: false });
