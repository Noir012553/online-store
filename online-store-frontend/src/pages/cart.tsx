import Link from "next/link"; // Thay thế Link từ react-router-dom
import { useRouter } from "next/router"; // Thay thế useNavigate từ react-router-dom
import { Trash2, Minus, Plus, ShoppingBag, ArrowRight, CheckCircle } from "lucide-react";
import { useCart } from "../lib/context/CartContext";
import { formatCurrency } from "../lib/utils";
import { Button } from "../components/ui/button";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { EmptyState } from "../components/EmptyState";
import { Badge } from "../components/ui/badge";

export default function Cart() {
  const { items, removeFromCart, updateQuantity, totalPrice } = useCart();
  const router = useRouter(); // Sử dụng useRouter của Next.js

  const shippingFee = 0;
  const finalTotal = totalPrice + shippingFee;

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-12">
        <Breadcrumbs links={[{ label: "Giỏ hàng" }]} />
        <EmptyState
          icon={ShoppingBag}
          title="Giỏ hàng trống"
          description="Bạn chưa có sản phẩm nào trong giỏ hàng. Khám phá và thêm sản phẩm yêu thích của bạn ngay!"
          actionLabel="Tiếp tục mua sắm"
          onAction={() => router.push("/products")} // Thay thế navigate("/products")
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 animate-in fade-in duration-300">
      <Breadcrumbs links={[{ label: "Giỏ hàng" }]} />
      <div className="flex items-center justify-between mb-8">
        <h1>Giỏ hàng của bạn</h1>
        <Badge className="bg-red-600 text-white">{items.length} sản phẩm</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border overflow-hidden shadow-sm">
            <div className="bg-gray-50 px-4 py-2 border-b hidden md:block">
              <div className="grid grid-cols-12 gap-1">
                <div className="col-span-6 text-left text-xs">Sản phẩm</div>
                <div className="col-span-2 text-left text-xs">Đơn giá</div>
                <div className="col-span-2 text-left text-xs">Số lượng</div>
                <div className="col-span-1 text-left text-xs">Thành tiền</div>
                <div className="col-span-1 text-right text-xs">Xóa</div>
              </div>
            </div>

            <div className="divide-y">
              {items.map((item) => (
                <div key={item.laptop.id} className="p-3 md:p-4 hover:bg-gray-50 transition-colors animate-in slide-in-from-right duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <div className="md:col-span-6 flex gap-3 items-center">
                      <Link href={`/product/${item.laptop.id}`}> {/* Thay to bằng href */}
                        <ImageWithFallback
                          src={item.laptop.image}
                          alt={item.laptop.name}
                          className="w-28 h-28 object-cover rounded border hover:shadow-md transition-shadow"
                        />
                      </Link>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <Link
                          href={`/product/${item.laptop.id}`} // Thay to bằng href
                          className="hover:text-red-600 transition-colors"
                        >
                          <h3 className="line-clamp-2 text-sm">{item.laptop.name}</h3>
                        </Link>
                        <p className="text-xs text-gray-600 mt-0.5 truncate hidden md:block">
                          {item.laptop.specs.cpu}
                        </p>
                        <div className="md:hidden mt-1">
                          <p className="text-red-600 text-xs">
                            {formatCurrency(item.laptop.price)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="hidden md:block md:col-span-2 text-left text-xs">
                      <span className="text-gray-900">{formatCurrency(item.laptop.price)}</span>
                    </div>

                    <div className="md:col-span-2 flex items-center justify-between md:justify-start gap-1">
                      <span className="md:hidden text-gray-600 text-xs">Sl:</span>
                      <div className="flex items-center gap-0.5 bg-gray-50 rounded-md p-0.5">
                        <button
                          onClick={() => updateQuantity(item.laptop.id, item.quantity - 1)}
                          className="p-0.5 hover:bg-white rounded transition-all disabled:opacity-50"
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>
                        <span className="w-6 text-left text-xs">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.laptop.id, item.quantity + 1)}
                          className="p-0.5 hover:bg-white rounded transition-all"
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>

                    <div className="md:col-span-1 flex items-center justify-start">
                      <div className="text-left">
                        <p className="md:hidden text-xs text-gray-600">TT:</p>
                        <span className="text-red-600 text-xs">
                          {formatCurrency(item.laptop.price * item.quantity)}
                        </span>
                      </div>
                    </div>

                    <div className="md:col-span-1 flex items-center justify-end">
                      <button
                        onClick={() => removeFromCart(item.laptop.id)}
                        className="text-gray-400 hover:text-red-600"
                        title="Xóa sản phẩm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-between">
            <Link href="/products"> {/* Thay to bằng href */}
              <Button variant="outline">
                Tiếp tục mua sắm
              </Button>
            </Link>
          </div>
        </div>

        <div>
          <div className="bg-white rounded-lg border p-6 sticky top-24">
            <h3 className="mb-4">Tóm tắt đơn hàng</h3>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between">
                <span>Tạm tính:</span>
                <span>{formatCurrency(totalPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span>Phí vận chuyển:</span>
                <span className="text-green-600">Miễn phí</span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span>Tổng cộng:</span>
                <span className="text-red-600">{formatCurrency(finalTotal)}</span>
              </div>
            </div>

            <Button
              onClick={() => router.push("/checkout")} // Thay thế navigate("/checkout")
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              Tiến hành thanh toán
            </Button>

            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <p className="text-gray-600">Bảo hành chính hãng</p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <p className="text-gray-600">Đổi trả trong 15 ngày</p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <p className="text-gray-600">Thanh toán an toàn</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
