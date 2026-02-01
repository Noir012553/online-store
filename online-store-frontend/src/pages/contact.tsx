import { useState } from "react";
import { MapPin, Phone, Mail, Clock, MessageSquare } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { faqs } from "../lib/data";
import { toast } from "sonner";



export default function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.");
    setFormData({
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: "",
    });
  };

  const branches = [
    {
      name: "Chi nhánh Hà Nội",
      address: "123 Đường Lê Lợi, Quận Hoàn Kiếm, Hà Nội",
      phone: "024 1234 5678",
      hours: "8:00 - 21:00 (Thứ 2 - Chủ nhật)",
    },
    {
      name: "Chi nhánh TP.HCM",
      address: "456 Đường Nguyễn Huệ, Quận 1, TP.HCM",
      phone: "028 1234 5678",
      hours: "8:00 - 21:00 (Thứ 2 - Chủ nhật)",
    },
    {
      name: "Chi nhánh Đà Nẵng",
      address: "789 Đường Trần Phú, Quận Hải Châu, Đà Nẵng",
      phone: "0236 1234 5678",
      hours: "8:00 - 21:00 (Thứ 2 - Chủ nhật)",
    },
  ];

  const contactMethods = [
    {
      icon: Phone,
      title: "Hotline",
      value: "1900 1234",
      description: "Hỗ trợ 24/7",
    },
    {
      icon: Mail,
      title: "Email",
      value: "info@laptopstore.vn",
      description: "Phản hồi trong 24h",
    },
    {
      icon: MessageSquare,
      title: "Live Chat",
      value: "Chat trực tuyến",
      description: "Phản hồi ngay lập tức",
    },
  ];

  return (
    <div>
      <section className="bg-linear-to-r from-red-600 to-red-800 py-20">
        <div className="container mx-auto px-4 text-center text-white">
          <h1 className="text-white mb-4">Liên hệ với chúng tôi</h1>
          <p className="text-xl max-w-2xl mx-auto">
            Chúng tôi luôn sẵn sàng hỗ trợ bạn. Hãy liên hệ với chúng tôi qua các kênh dưới đây
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {contactMethods.map((method, index) => {
            const Icon = method.icon;
            return (
              <div key={index} className="bg-white border rounded-lg p-6 text-center hover:shadow-lg transition-shadow">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="mb-2">{method.title}</h3>
                <p className="text-red-600 mb-1">{method.value}</p>
                <p className="text-sm text-gray-600">{method.description}</p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div>
            <h2 className="mb-6">Gửi tin nhắn cho chúng tôi</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Họ và tên *</Label>
                <Input
                  id="name"
                  placeholder="Nhập họ và tên của bạn"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="example@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Số điện thoại *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="0901234567"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="subject">Tiêu đề *</Label>
                <Input
                  id="subject"
                  placeholder="Nhập tiêu đề tin nhắn"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="message">Nội dung *</Label>
                <Textarea
                  id="message"
                  placeholder="Hãy nhập nội dung tin nhắn của bạn..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  rows={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full bg-red-600 hover:bg-red-700">
                Gửi tin nhắn
              </Button>
            </form>
          </div>

          <div>
            <h2 className="mb-6">Thông tin cửa hàng</h2>
            <div className="space-y-6">
              {branches.map((branch, index) => (
                <div key={index} className="bg-white border rounded-lg p-6">
                  <h3 className="mb-4">{branch.name}</h3>
                  <div className="space-y-3 text-gray-700">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <span>{branch.address}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-red-600" />
                      <a href={`tel:${branch.phone}`} className="hover:text-red-600">
                        {branch.phone}
                      </a>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-red-600" />
                      <span>{branch.hours}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-center mb-4 text-3xl font-bold">Bản đồ cửa hàng</h2>
          <p className="text-center text-gray-600 mb-8 text-xl font-bold">Chi nhánh trung tâm - Quận 1, TP.HCM</p>
          <div className="max-w-4xl mx-auto">
            <div className="aspect-video bg-gray-200 rounded-lg flex items-center justify-center">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3919.3193500004893!2d106.69729731480123!3d10.787845992312522!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31752f4b3330bcc9%3A0xc86bd58b6c8499d1!2zTmd1eeG7hW4gSHXhu4csIFF14bqtbiAxLCBI4buTIENow60gTWluaCwgVmnhu4d0IE5hbQ!5e0!3m2!1svi!2s!4v1635000000000!5m2!1svi!2s"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                className="rounded-lg"
              ></iframe>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <h2 className="text-center mb-4 text-3xl font-bold">Câu hỏi thường gặp</h2>
        <p className="text-center text-gray-600 mb-8 max-w-2xl mx-auto text-xl font-bold">
          Những câu hỏi được khách hàng quan tâm nhiều nhất
        </p>
        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible>
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger>{faq.question}</AccordionTrigger>
                <AccordionContent>{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="bg-linear-to-r from-red-600 to-red-800 py-12">
        <div className="container mx-auto px-4 text-center text-white">
          <h2 className="text-white mb-4">Cần hỗ trợ ngay?</h2>
          <p className="text-xl mb-6">
            Gọi hotline của chúng tôi để được tư vấn miễn phí
          </p>
          <a href="tel:19001234" className="inline-block">
            <Button size="lg" variant="secondary" className="bg-white text-red-600 hover:bg-gray-100">
              <Phone className="w-5 h-5 mr-2" />
              1900 1234
            </Button>
          </a>
        </div>
      </section>
    </div>
  );
}
