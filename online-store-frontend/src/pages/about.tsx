import { useState, useEffect } from "react";
import { Target, Eye, Heart, Award, Users, TrendingUp } from "lucide-react";
import { productAPI } from "../lib/api";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";

interface Stat {
  label: string;
  value: string | number;
}

interface Testimonial {
  name: string;
  role: string;
  content: string;
  avatar: string;
  rating?: number;
}

export default function About() {
  const [stats, setStats] = useState<Stat[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [statsRes, testimonialsRes] = await Promise.all([
          productAPI.getStatsOverview(),
          productAPI.getTestimonials(3),
        ]);

        const statsData = [
          { label: "Năm kinh nghiệm", value: "10+" },
          { label: "Khách hàng", value: `${statsRes.totalCustomers}K+` },
          { label: "Sản phẩm", value: `${statsRes.totalProducts}+` },
          { label: "Đánh giá 5 sao", value: "95%" },
        ];
        setStats(statsData);
        setTestimonials(testimonialsRes || []);
      } catch (error) {
        setStats([
          { label: "Năm kinh nghiệm", value: "10+" },
          { label: "Khách hàng", value: "50K+" },
          { label: "Sản phẩm", value: "1000+" },
          { label: "Đánh giá 5 sao", value: "95%" },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const values = [
    {
      icon: Award,
      title: "Chất lượng",
      description: "Cam kết cung cấp sản phẩm chính hãng, chất lượng cao nhất",
    },
    {
      icon: Heart,
      title: "Tận tâm",
      description: "Phục vụ khách hàng với sự nhiệt tình và chuyên nghiệp",
    },
    {
      icon: Users,
      title: "Uy tín",
      description: "Xây dựng lòng tin với khách hàng qua từng sản phẩm",
    },
    {
      icon: TrendingUp,
      title: "Đổi mới",
      description: "Luôn cập nhật công nghệ và xu hướng mới nhất",
    },
  ];

  const team = [
    {
      name: "Nguyễn Văn A",
      role: "CEO & Founder",
      image: "https://images.pexels.com/photos/7845231/pexels-photo-7845231.jpeg",
    },
    {
      name: "Trần Thị B",
      role: "Giám đốc kinh doanh",
      image: "https://images.pexels.com/photos/7681664/pexels-photo-7681664.jpeg",
    },
    {
      name: "Lê Văn C",
      role: "Trưởng phòng kỹ thuật",
      image: "https://images.pexels.com/photos/2182970/pexels-photo-2182970.jpeg",
    },
    {
      name: "Phạm Thị D",
      role: "Trưởng phòng CSKH",
      image: "https://images.pexels.com/photos/6204232/pexels-photo-6204232.jpeg",
    },
  ];

  const commitments = [
    "Sản phẩm chính hãng 100%, nguồn gốc rõ ràng",
    "Bảo hành chính hãng đầy đủ, đổi mới trong 15 ngày",
    "Giá cả cạnh tranh nhất thị trường",
    "Hỗ trợ trả góp 0% lãi suất",
    "Giao hàng nhanh chóng, miễn phí cho đơn hàng trên 10 triệu",
    "Tư vấn chuyên nghiệp, hỗ trợ 24/7",
  ];

  return (
    <div>
      <section className="relative overflow-hidden" style={{ height: "calc(100vh - 80px)" }}>
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source
            src="https://cdn.builder.io/o/assets%2F01aa1d5ef8ca478f98a6a1bcc1578338%2F99531dfc2deb4c278b9bb60cac8a1fb1?alt=media&token=feb89a6d-fcd8-4fae-a81b-11605384ff9e&apiKey=01aa1d5ef8ca478f98a6a1bcc1578338"
            type="video/mp4"
          />
        </video>
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative container mx-auto px-4 h-full flex items-center">
          <div className="text-white max-w-2xl">
            <h1 className="text-white mb-4">Về chúng tôi</h1>
            <p className="text-xl">
              Hơn 10 năm kinh nghiệm cung cấp laptop chính hãng, uy tín tại Việt Nam
            </p>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-4xl text-red-600 mb-2">{stat.value}</div>
              <div className="text-gray-600">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="mb-6">Lịch sử hình thành</h2>
              <p className="text-gray-700 mb-4">
                LaptopStore được thành lập vào năm 2014 với sứ mệnh mang đến cho người dùng Việt Nam những sản phẩm laptop chất lượng cao với giá cả hợp lý nhất.
              </p>
              <p className="text-gray-700 mb-4">
                Từ một cửa hàng nhỏ, chúng tôi đã phát triển thành một trong những đại lý uy tín nhất, phục vụ hơn 50,000 khách hàng trên toàn quốc.
              </p>
              <p className="text-gray-700">
                Với đội ngũ nhân viên giàu kinh nghiệm và nhiệt huyết, chúng tôi luôn đặt sự hài lòng của khách hàng lên hàng đầu.
              </p>
            </div>
            <div>
              <ImageWithFallback
                src="https://images.unsplash.com/photo-1706101035106-119828e7b564?w=600"
                alt="LaptopStore"
                className="rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          <div className="bg-red-50 p-8 rounded-lg text-center">
            <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center mb-4 mx-auto">
              <Target className="w-6 h-6 text-white" />
            </div>
            <h2 className="mb-4">Tầm nhìn</h2>
            <p className="text-gray-700">
              Trở thành đơn vị hàng đầu trong lĩnh vực phân phối laptop tại Việt Nam, mang đến giải pháp công nghệ toàn diện cho mọi nhu cầu của khách hàng.
            </p>
          </div>
          <div className="bg-red-50 p-8 rounded-lg text-center">
            <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center mb-4 mx-auto">
              <Eye className="w-6 h-6 text-white" />
            </div>
            <h2 className="mb-4">Sứ mệnh</h2>
            <p className="text-gray-700">
              Cung cấp sản phẩm công nghệ chất lượng cao với giá cả hợp lý, kèm theo dịch vụ khách hàng tuyệt vời, góp phần nâng cao năng suất và chất lượng cuộc sống.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {values.map((value, index) => {
            const Icon = value.icon;
            return (
              <div key={index} className="bg-white border rounded-lg p-6 text-center hover:shadow-lg transition-shadow">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="mb-2">{value.title}</h3>
                <p className="text-gray-600 text-sm">{value.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-center mb-4 text-3xl font-bold">Đội ngũ của chúng tôi</h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto text-lg font-semibold">
            Đội ngũ nhân viên giàu kinh nghiệm, nhiệt huyết và chuyên nghiệp, luôn sẵn sàng hỗ trợ bạn
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {team.map((member, index) => (
              <div key={index} className="bg-white rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                <img
                  src={member.image}
                  alt={member.name}
                  className="w-full h-64 object-cover"
                />
                <div className="p-6 text-center">
                  <h3 className="mb-1">{member.name}</h3>
                  <p className="text-gray-600">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <h2 className="text-center mb-12 font-bold">Cam kết của chúng tôi</h2>
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {commitments.map((commitment, index) => (
              <div key={index} className="flex items-start gap-3 bg-white border rounded-lg p-4">
                <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-white text-sm">✓</span>
                </div>
                <span className="text-gray-700">{commitment}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-linear-to-r from-red-600 to-red-800 py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-white mb-12 font-bold">Khách hàng nói gì về chúng tôi</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-white rounded-lg p-6">
                <div className="flex items-center gap-4 mb-4">
                  <img
                    src={testimonial.avatar}
                    alt={testimonial.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <h4>{testimonial.name}</h4>
                    <p className="text-sm text-gray-600">{testimonial.role}</p>
                  </div>
                </div>
                <p className="text-black font-bold text-base italic">"{testimonial.content}"</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
