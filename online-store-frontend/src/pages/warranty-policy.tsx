import { CheckCircle, Clock, AlertCircle, PhoneCall } from "lucide-react";

export default function WarrantyPolicy() {
  const warrantyItems = [
    {
      title: "Bảo hành sản phẩm",
      icon: CheckCircle,
      description: "Tất cả sản phẩm được bảo hành theo quy định của nhà sản xuất"
    },
    {
      title: "Thời gian bảo hành",
      icon: Clock,
      description: "Thông thường 12-24 tháng từ ngày mua hàng"
    },
    {
      title: "Điều kiện bảo hành",
      icon: AlertCircle,
      description: "Sản phẩm phải không bị hư hỏng do người dùng"
    },
    {
      title: "Hỗ trợ bảo hành",
      icon: PhoneCall,
      description: "Liên hệ ngay với chúng tôi để được hỗ trợ bảo hành"
    }
  ];

  const warrantyDetails = [
    {
      title: "Phạm vi bảo hành",
      content: [
        "Lỗi do nhà sản xuất: Pin, ổ cứng, bo mạch chủ, cấu phần phần cứng",
        "Lỗi kỹ thuật: Không bật được máy, màn hình treo, bàn phím hỏng",
        "Lỗi điện: Không sạc được pin, cáp sạc lỏng"
      ]
    },
    {
      title: "Không được bảo hành",
      content: [
        "Hư hỏng do va chạm, rơi từ dưới cao hoặc ngấm nước",
        "Lỗi do người dùng tự sửa chữa hoặc cài đặt phần mềm không chính thức",
        "Mòn mday, trầy xước, bề ngoài bị hỏng do sử dụng bình thường",
        "Sản phẩm hết hạn bảo hành"
      ]
    },
    {
      title: "Quy trình bảo hành",
      content: [
        "1. Khách hàng liên hệ LaptopStore và cung cấp thông tin sản phẩm",
        "2. Chúng tôi kiểm tra tính hợp lệ của bảo hành",
        "3. Sản phẩm được gửi đến trung tâm bảo hành chính thức",
        "4. Sản phẩm được sửa chữa hoặc thay thế trong 7-14 ngày",
        "5. Sản phẩm được gửi trả lại hoặc khách hàng nhận tại cửa hàng"
      ]
    },
    {
      title: "Lưu ý quan trọng",
      content: [
        "Giữ gìn hóa đơn mua hàng - cần thiết để yêu cầu bảo hành",
        "Không tự ý tháo dỡ hoặc sửa chữa sản phẩm, có thể mất quyền bảo hành",
        "Thực hiện backup dữ liệu trước khi gửi bảo hành",
        "Bảo hành chỉ áp dụng trong phạm vi Việt Nam"
      ]
    }
  ];

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-linear-to-r from-red-600 to-red-800 py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <h1 className="text-white mb-4 text-4xl font-bold">Chính sách bảo hành</h1>
              <p className="text-red-100 text-lg">
                Chúng tôi cam kết cung cấp dịch vụ bảo hành chuyên nghiệp, nhanh chóng và uy tín cho tất cả sản phẩm
              </p>
            </div>
            <div className="hidden md:block">
              <img
                src="https://images.unsplash.com/photo-1531492746076-161ca9bcad58?w=500&h=400&fit=crop"
                alt="Chính sách bảo hành"
                className="rounded-lg shadow-lg w-full object-cover h-64"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Key Points Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {warrantyItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={index} className="bg-white border rounded-lg p-6 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Warranty Details */}
      <section className="bg-gray-50 py-16">
        <div className="container mx-auto px-4 flex justify-center">
          <div className="max-w-4xl w-full">
            <div className="mb-12 bg-white rounded-lg overflow-hidden shadow-md">
              <img
                src="https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=900&h=400&fit=crop"
                alt="Chi tiết bảo hành"
                className="w-full h-64 object-cover"
              />
            </div>
            {warrantyDetails.map((detail, index) => (
              <div key={index} className="mb-12">
                <h2 className="text-2xl font-bold text-blue-600 mb-6 text-center">{detail.title}</h2>
                <ul className="space-y-3">
                  {detail.content.map((item, itemIndex) => (
                    <li key={itemIndex} className="flex items-start gap-3 bg-white rounded-lg p-4">
                      <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
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

      {/* Contact Section */}
      <section className="bg-red-600 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-white text-3xl font-bold mb-4">Có thắc mắc về bảo hành?</h2>
          <p className="text-red-100 mb-8 text-lg max-w-2xl mx-auto">
            Hãy liên hệ với chúng tôi, đội ngũ hỗ trợ khách hàng sẽ giải đáp tất cả câu hỏi của bạn
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="tel:0901234567"
              className="bg-white text-red-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Gọi: 090 123 4567
            </a>
            <a
              href="mailto:info@laptopstore.vn"
              className="bg-transparent border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-red-600 transition-colors"
            >
              Email: info@laptopstore.vn
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
