import { Clock, RefreshCw, AlertCircle, Undo, Truck, CheckCircle, ArrowRight, ArrowLeft, ArrowDown } from "lucide-react";

export default function ReturnPolicy() {
  const returnItems = [
    {
      title: "Thời gian đổi trả",
      icon: Clock,
      description: "Đổi trả miễn phí trong 7 ngày kể từ ngày nhận hàng"
    },
    {
      title: "Hàng nguyên đai",
      icon: RefreshCw,
      description: "Sản phẩm phải nguyên hộp, chưa sử dụng hoặc lỗi từ nhà sản xuất"
    },
    {
      title: "Hoàn tiền toàn bộ",
      icon: Undo,
      description: "Hoàn tiền 100% trong vòng 3-5 ngày làm việc"
    },
    {
      title: "Vận chuyển miễn phí",
      icon: Truck,
      description: "Chúng tôi chịu phí vận chuyển cho việc đổi trả"
    }
  ];

  const returnReasons = [
    {
      title: "Lý do được đổi trả",
      items: [
        "Sản phẩm bị lỗi hoặc hư hỏng từ nhà sản xuất",
        "Sản phẩm không đúng với hình ảnh/mô tả trên website",
        "Sản phẩm bị lỗi sau 3 ngày sử dụng",
        "Khách hàng đổi ý (trong 7 ngày, chưa sử dụng)"
      ]
    },
    {
      title: "Lý do không được đổi trả",
      items: [
        "Sản phẩm đã qua 7 ngày kể từ ngày nhận hàng",
        "Hộp hoặc packaging bị tổn thương, mất mác, không còn nguyên",
        "Sản phẩm đã sử dụng, có dấu hiệu sử dụng (trầy xước, bế, móp)",
        "Sản phẩm hết hạn hoặc không còn giá trị thương mại"
      ]
    }
  ];

  const returnProcess = [
    {
      step: "1",
      title: "Liên hệ chúng tôi",
      description: "Gọi hoặc email để yêu cầu đổi trả trong 7 ngày nhận hàng"
    },
    {
      step: "2",
      title: "Xác nhận đơn đổi trả",
      description: "Chúng tôi kiểm tra đơn của bạn và xác nhận ngay trong 24 giờ"
    },
    {
      step: "3",
      title: "Gửi sản phẩm về",
      description: "Đóng gói sản phẩm nguyên vẹn và gửi về theo hướng dẫn của chúng tôi"
    },
    {
      step: "6",
      title: "Hoàn tất",
      description: "Hoàn tiền sẽ về tài khoản của bạn trong 3-5 ngày làm việc"
    },
    {
      step: "5",
      title: "Xử lý đổi trả",
      description: "Hoàn tiền hoặc gửi sản phẩm mới theo yêu cầu của bạn"
    },
    {
      step: "4",
      title: "Kiểm tra hàng",
      description: "Chúng tôi kiểm tra sản phẩm và xác nhận trong 2-3 ngày"
    }
  ];

  const conditions = [
    "Sản phẩm phải nguyên đai, chưa sử dụng hoặc sử dụng rất ít",
    "Hộp, hộp con, tất cả phụ kiện phải đầy đủ",
    "Không được tháo dỡ, sửa chữa hoặc can thiệp vào sản phẩm",
    "Không được vận chuyển không đúng cách, gây hư hỏng thêm",
    "Hóa đơn mua hàng phải còn nguyên bản",
    "Sản phẩm không được có dấu hiệu sử dụng (bã bẩn, trầy xước, móp...)"
  ];

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <h1 className="text-white mb-4 text-4xl font-bold">Chính sách đổi trả</h1>
              <p className="text-blue-100 text-lg">
                Chúng tôi cam kết cung cấp dịch vụ đổi trả linh hoạt, nhanh chóng và không phức tạp
              </p>
            </div>
            {/* THAY ĐỔI: Sửa đường dẫn từ link sang /public/assets/policies/return-hero.png */}
            <div className="hidden md:block">
              <img
                src="https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500&h=400&fit=crop"
                alt="Chính sách đổi trả"
                className="rounded-lg shadow-lg w-full object-cover h-64"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Key Points Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {returnItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={index} className="bg-white border rounded-lg p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Return Reasons */}
      <section className="bg-gray-50 py-16">
        <div className="container mx-auto px-4 flex justify-center">
          <div className="max-w-4xl w-full">
            {/* THAY ĐỔI: Sửa đường dẫn từ link sang /public/assets/policies/return-reasons.png */}
            <div className="mb-12 bg-white rounded-lg overflow-hidden shadow-md">
              <img
                src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=900&h=400&fit=crop"
                alt="Lý do đổi trả"
                className="w-full h-64 object-cover"
              />
            </div>
            {returnReasons.map((reason, index) => (
              <div key={index} className="mb-12">
                <h2 className="text-2xl font-bold text-green-600 mb-6 text-center">{reason.title}</h2>
                <ul className="space-y-3">
                  {reason.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="flex items-start gap-3 bg-white rounded-lg p-4">
                      <div className="w-5 h-5 bg-green-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-white text-xs">✓</span>
                      </div>
                      <span className="text-gray-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Return Process */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Quy trình đổi trả</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-y-12">
          {returnProcess.map((process, index) => (
            <div key={index} className="relative h-full">
              <div className="bg-white border rounded-lg p-6 h-full min-h-[280px]">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mb-4 text-lg">
                  {process.step}
                </div>
                <h3 className="font-semibold text-lg mb-2">{process.title}</h3>
                <p className="text-gray-600">{process.description}</p>
              </div>
              {/* Mũi tên ngang giữa các bước trong cùng hàng */}
              {/* Hàng 1: mũi tên sang phải (1→2→3) */}
              {index < 2 && (
                <div className="hidden lg:flex absolute top-1/2 -right-6 transform -translate-y-1/2">
                  <ArrowRight className="w-6 h-6 text-blue-600" />
                </div>
              )}
              {/* Hàng 2: mũi tên sang trái (4←5, không có ←6) */}
              {(index === 3 || index === 4) && (
                <div className="hidden lg:flex absolute top-1/2 -right-6 transform -translate-y-1/2">
                  <ArrowLeft className="w-6 h-6 text-blue-600" />
                </div>
              )}
              {/* Mũi tên xuống từ bước 3 sang bước 4 (hoặc 6) */}
              {index === 2 && (
                <div className="hidden lg:flex absolute -bottom-6 left-1/2 transform -translate-x-1/2">
                  <ArrowDown className="w-6 h-6 text-blue-600" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Conditions */}
      <section className="bg-green-50 py-16">
        <div className="container mx-auto px-4 flex justify-center">
          <div className="max-w-4xl w-full">
            <h2 className="text-3xl font-bold text-green-600 mb-6 text-center">Điều kiện để được đổi trả</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {conditions.map((condition, index) => (
                <div key={index} className="flex items-start gap-3 bg-white rounded-lg p-4">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="text-gray-700">{condition}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="bg-blue-600 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-white text-3xl font-bold mb-4">Cần hỗ trợ đổi trả?</h2>
          <p className="text-blue-100 mb-8 text-lg max-w-2xl mx-auto">
            Liên hệ với chúng tôi ngay để được hỗ trợ nhanh chóng và chuyên nghiệp
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="tel:0901234567"
              className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Gọi: 090 123 4567
            </a>
            <a
              href="mailto:info@laptopstore.vn"
              className="bg-transparent border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-blue-600 transition-colors"
            >
              Email: info@laptopstore.vn
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
