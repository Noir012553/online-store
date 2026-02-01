import { Search, ShoppingCart, Truck, CreditCard, CheckCircle, HelpCircle, ArrowRight } from "lucide-react";

export default function ShoppingGuide() {
  const steps = [
    {
      icon: Search,
      number: 1,
      title: "Tìm kiếm sản phẩm",
      description: "Sử dụng thanh tìm kiếm hoặc duyệt qua các danh mục sản phẩm để tìm laptop phù hợp với nhu cầu của bạn"
    },
    {
      icon: ShoppingCart,
      number: 2,
      title: "Thêm vào giỏ hàng",
      description: "Chọn số lượng, cấu hình và màu sắc sản phẩm, sau đó bấm nút 'Thêm vào giỏ hàng'"
    },
    {
      icon: CreditCard,
      number: 3,
      title: "Thanh toán",
      description: "Điền thông tin giao hàng, chọn phương thức thanh toán (COD, VNPay, hoặc chuyển khoản)"
    },
    {
      icon: Truck,
      number: 4,
      title: "Giao hàng",
      description: "Theo dõi đơn hàng của bạn và nhận hàng tại địa chỉ của bạn trong 1-3 ngày làm việc"
    }
  ];

  const tips = [
    {
      category: "Kiến thức cơ bản",
      items: [
        "CPU (Bộ xử lý): Càng mạnh thì hiệu năng càng tốt, Intel i5/i7 hoặc AMD Ryzen 5/7 là lựa chọn tốt",
        "RAM (Bộ nhớ): 8GB đủ cho công việc thường ngày, 16GB cho thiết kế/lập trình, 32GB cho chuyên gia",
        "SSD (Ổ cứng): 256GB cho cơ bản, 512GB để dung thoải, 1TB nếu cần lưu trữ nhiều tệp",
        "GPU (Chipset đồ họa): RTX 3050 hoặc RTX 4050 phù hợp chơi game, AMD tương tự"
      ]
    },
    {
      category: "Cách chọn đúng laptop",
      items: [
        "Xác định mục đích sử dụng: Học tập, công việc, thiết kế hay chơi game?",
        "Xác định ngân sách: Từ 5-10 triệu (cơ bản) đến 20 triệu+ (cao cấp)",
        "Kiểm tra trọng lượng: Nếu mang đi nhiều, chọn dưới 1.5kg; nếu để bàn, có thể chọn nặng hơn",
        "Kiểm tra cổng kết nối: USB-C, HDMI, audio jack... đủ cho nhu cầu của bạn"
      ]
    },
    {
      category: "Mẹo mua hàng",
      items: [
        "Đọc kỹ thông tin sản phẩm: Cấu hình, màu sắc, bảo hành... để tránh nhầm lẫn",
        "So sánh giá: Kiểm tra giá của sản phẩm tương tự trên các nơi khác",
        "Kiểm tra đánh giá: Đọc bình luận của khách hàng khác để biết chất lượng sản phẩm",
        "Tận dụng khuyến mãi: Theo dõi các chương trình khuyến mãi để tiết kiệm tiền"
      ]
    },
    {
      category: "Sau khi mua hàng",
      items: [
        "Kiểm tra hàng: Khi nhận hàng, kiểm tra hộp có nguyên vẹn, sản phẩm có đầy đủ phụ kiện",
        "Bật máy kiểm tra: Bật máy để kiểm tra xem máy có hoạt động bình thường không",
        "Lưu giữ hóa đơn: Giữ hóa đơn để sử dụng cho bảo hành hoặc đổi trả",
        "Đăng ký bảo hành: Nếu cần, đăng ký bảo hành mở rộng trên website của nhà sản xuất"
      ]
    }
  ];

  const faqs = [
    {
      question: "Làm sao để theo dõi đơn hàng của tôi?",
      answer: "Bạn có thể theo dõi đơn hàng bằng cách đăng nhập vào tài khoản của mình và vào phần 'Đơn hàng của tôi'. Chúng tôi cũng sẽ gửi email cập nhật về tình trạng đơn hàng."
    },
    {
      question: "Tôi có thể hủy đơn hàng không?",
      answer: "Nếu đơn hàng chưa được giao, bạn có thể liên hệ với chúng tôi để hủy đơn. Nếu đơn hàng đã giao, bạn có thể yêu cầu đổi trả trong 7 ngày."
    },
    {
      question: "Bạn có hỗ trợ trả góp không?",
      answer: "Có, chúng tôi hỗ trợ trả góp 0% lãi suất cho các sản phẩm có giá trị từ 15 triệu trở lên. Bạn có thể chọn trả góp khi thanh toán."
    },
    {
      question: "Các phương thức thanh toán nào được hỗ trợ?",
      answer: "Chúng tôi hỗ trợ COD (thanh toán khi nhận hàng), VNPay (thẻ tín dụng/ghi nợ), chuyển khoản ngân hàng, và Apple Pay/Google Pay."
    },
    {
      question: "Giao hàng mất bao lâu?",
      answer: "Giao hàng thường mất 1-3 ngày làm việc tùy vào địa chỉ của bạn. Với các đơn hàng ở ngoại thành, có thể mất 3-5 ngày."
    },
    {
      question: "Có phí giao hàng không?",
      answer: "Giao hàng miễn phí cho các đơn hàng từ 10 triệu trở lên. Với các đơn hàng dưới 10 triệu, phí giao hàng là 30,000đ."
    }
  ];

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-linear-to-r from-green-600 to-green-800 py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <h1 className="text-white mb-4 text-4xl font-bold">Hướng dẫn mua hàng</h1>
              <p className="text-green-100 text-lg">
                Tìm hiểu cách mua hàng dễ dàng và an toàn trên LaptopStore
              </p>
            </div>
            {/* THAY ĐỔI: Sửa đường dẫn từ link sang /public/assets/policies/shopping-guide-hero.png */}
            <div className="hidden md:block">
              <img
                src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=500&h=400&fit=crop"
                alt="Hướng dẫn mua hàng"
                className="rounded-lg shadow-lg w-full object-cover h-64"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Steps Section */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">4 bước đơn giản để mua hàng</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="relative">
                <div className="bg-white border rounded-lg p-6 h-full hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                      {step.number}
                    </div>
                    <Icon className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                  <p className="text-gray-600 text-sm">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden lg:flex absolute top-1/2 -right-6 transform -translate-y-1/2">
                    <ArrowRight className="w-6 h-6 text-red-600" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Tips Section */}
      <section className="bg-gray-50 py-16">
        <div className="container mx-auto px-4 flex justify-center">
          <div className="max-w-4xl w-full">
            <h2 className="text-3xl font-bold text-center mb-12">Lời khuyên hữu ích</h2>
            {/* THAY ĐỔI: Sửa đường dẫn từ link sang /public/assets/policies/shopping-tips.png */}
            <div className="mb-12 bg-white rounded-lg overflow-hidden shadow-md">
              <img
                src="https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=900&h=350&fit=crop"
                alt="Lời khuyên mua hàng"
                className="w-full h-56 object-cover"
              />
            </div>
            {tips.map((tip, index) => (
              <div key={index} className="mb-12">
                <h3 className="text-2xl font-bold text-red-600 mb-6 text-center">{tip.category}</h3>
                <ul className="space-y-3">
                  {tip.items.map((item, itemIndex) => (
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

      {/* FAQ Section */}
      <section className="container mx-auto px-4 py-16 flex justify-center">
        <div className="max-w-4xl w-full">
          <h2 className="text-3xl font-bold text-center mb-12">Câu hỏi thường gặp</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <details key={index} className="bg-white border rounded-lg p-6 group">
                <summary className="flex items-start gap-3 cursor-pointer font-semibold text-gray-800 hover:text-red-600">
                  <HelpCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <span>{faq.question}</span>
                </summary>
                <p className="text-gray-600 mt-4 ml-8">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="bg-green-600 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-white text-3xl font-bold mb-4">Vẫn còn thắc mắc?</h2>
          <p className="text-green-100 mb-8 text-lg max-w-2xl mx-auto">
            Hãy liên hệ với chúng tôi, đội ngũ hỗ trợ khách hàng sẽ sẵn sàng trả lời mọi câu hỏi của bạn
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="tel:0901234567"
              className="bg-white text-green-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Gọi: 090 123 4567
            </a>
            <a
              href="mailto:info@laptopstore.vn"
              className="bg-transparent border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-green-600 transition-colors"
            >
              Email: info@laptopstore.vn
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
