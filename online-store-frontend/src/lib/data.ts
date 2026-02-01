// Data types for the laptop store

export interface Laptop {
  id: string;
  _id?: string;
  name: string;
  brand: string;
  category: string;
  categoryName?: string;
  price: number;
  originalPrice?: number;
  image: string;
  images: string[];
  rating: number;
  reviews: number;
  inStock: boolean;
  specs: Record<string, string>;
  description: string;
  features: string[];
  featured?: boolean;
  deal?: {
    discount: number;
    endTime: Date;
  };
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  date: Date;
}

export interface Brand {
  name: string;
  logo: string;
}

export const brands: Brand[] = [
  { name: "Dell", logo: "https://upload.wikimedia.org/wikipedia/commons/4/48/Dell_Logo.svg" },
  { name: "HP", logo: "https://upload.wikimedia.org/wikipedia/commons/a/ad/HP_logo_2012.svg" },
  { name: "Lenovo", logo: "https://upload.wikimedia.org/wikipedia/commons/b/b8/Lenovo_logo_2015.svg" },
  { name: "Asus", logo: "https://upload.wikimedia.org/wikipedia/commons/b/b0/ASUS_Corporate_Logo.svg" },
  { name: "Acer", logo: "https://upload.wikimedia.org/wikipedia/commons/0/00/Acer_2011.svg" },
  { name: "MSI", logo: "https://upload.wikimedia.org/wikipedia/vi/6/6c/Msi_logo.png" },
];

export const features = [
  {
    icon: "Truck",
    title: "Giao hàng toàn quốc",
    description: "Miễn phí vận chuyển cho đơn hàng trên 10 triệu",
  },
  {
    icon: "Shield",
    title: "Bảo hành chính hãng",
    description: "Bảo hành 12-24 tháng, đổi mới trong 15 ngày",
  },
  {
    icon: "Headphones",
    title: "Hỗ trợ 24/7",
    description: "Tư vấn nhiệt tình, giải đáp mọi thắc mắc",
  },
  {
    icon: "CreditCard",
    title: "Thanh toán đa dạng",
    description: "Hỗ trợ trả góp 0%, thanh toán online",
  },
];

export const faqs = [
  {
    question: "Chính sách bảo hành như thế nào?",
    answer: "Tất cả sản phẩm đều được bảo hành chính hãng từ 12-24 tháng. Ngoài ra, chúng tôi hỗ trợ đổi mới trong 15 ngày đầu nếu có lỗi từ nhà sản xuất.",
  },
  {
    question: "Có hỗ trợ trả góp không?",
    answer: "Có, chúng tôi hỗ trợ trả góp 0% lãi suất qua thẻ tín dụng và các công ty tài chính. Thời gian trả góp linh hoạt từ 6-24 tháng.",
  },
  {
    question: "Giao hàng mất bao lâu?",
    answer: "Với khu vực nội thành, giao hàng trong 2-4 giờ. Các tỉnh thành khác từ 1-3 ngày làm việc.",
  },
  {
    question: "Có thể đổi trả sản phẩm không?",
    answer: "Có, bạn có thể đổi trả trong vòng 15 ngày kể từ ngày nhận hàng nếu sản phẩm còn nguyên tem, hộp và chưa qua sử dụng.",
  },
];
