"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Package, ShoppingCart, Users, LogOut, Menu, X, Home } from "lucide-react";
import { useAuth } from "../../lib/context/AuthContext";
import { Button } from "../../components/ui/button";
import { NotificationBell } from "../../components/admin/NotificationBell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, logout, user } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    }
  }, [user, router]);

  if (!user) {
    return null; // Hoặc một spinner tải
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h2>Không có quyền truy cập</h2>
        <p className="text-gray-600 mb-6">Bạn cần quyền admin để truy cập trang này</p>
        <Link href="/">
          <Button className="bg-red-600 hover:bg-red-700">Về trang chủ</Button>
        </Link>
      </div>
    );
  }

  const menuItems = [
    { path: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/admin/productsAdmin", icon: Package, label: "Sản phẩm" },
    { path: "/admin/ordersAdmin", icon: ShoppingCart, label: "Đơn hàng" },
    { path: "/admin/customersAdmin", icon: Users, label: "Khách hàng" },
  ];

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className={`bg-black text-white flex flex-col transition-all duration-300 ease-in-out ${sidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className={`p-4 border-b border-gray-800 flex ${sidebarOpen ? 'flex-row items-center justify-between' : 'flex-col items-center gap-4'}`}>
          <div className={`bg-red-600 text-white px-3 py-2 rounded shrink-0 ${!sidebarOpen && 'w-full text-center'}`}>
            <span className="text-xl">LT</span>
          </div>
          {sidebarOpen && (
            <div>
              <div className="text-lg">LaptopStore</div>
              <div className="text-xs text-gray-400">Admin Panel</div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-400 hover:text-white p-2 rounded transition-colors shrink-0"
            title={sidebarOpen ? "Tắt menu" : "Mở menu"}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <nav className={`flex-1 ${sidebarOpen ? 'p-4' : 'p-2'}`}>
          <ul className={`${sidebarOpen ? 'space-y-2' : 'space-y-3'}`}>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = router.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    href={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${sidebarOpen ? 'justify-start' : 'justify-center'} ${isActive
                        ? "bg-red-600 text-white"
                        : "text-gray-300 hover:bg-gray-800"
                      }`}
                    title={sidebarOpen ? undefined : item.label}
                  >
                    <Icon className={`shrink-0 ${sidebarOpen ? 'w-5 h-5' : 'w-6 h-6'}`} />
                    {sidebarOpen && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={`border-t border-gray-800 ${sidebarOpen ? 'p-4' : 'p-2'}`}>
          {sidebarOpen && (
            <div className="flex items-center gap-3 mb-3 px-2">
              <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center shrink-0">
                <span>{user.name[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{user.name}</div>
                <div className="text-xs text-gray-400 truncate">{user.role}</div>
              </div>
            </div>
          )}
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className={`w-full mb-2 text-white hover:bg-gray-800 flex items-center ${sidebarOpen ? 'justify-start gap-2' : 'justify-center'}`}
              title={sidebarOpen ? undefined : 'Về trang chủ'}
            >
              <Home className="w-5 h-5 text-white shrink-0" />
              {sidebarOpen && <span>Về trang chủ</span>}
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className={`w-full text-white hover:bg-gray-800 flex items-center ${sidebarOpen ? 'justify-start gap-2' : 'justify-center'}`}
            onClick={logout}
            title={sidebarOpen ? undefined : 'Đăng xuất'}
          >
            <LogOut className="w-5 h-5 text-white shrink-0" />
            {sidebarOpen && <span>Đăng xuất</span>}
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <div className="bg-white border-b px-8 py-4 flex justify-end shadow-sm">
          <NotificationBell />
        </div>
        <div className="p-8 flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
