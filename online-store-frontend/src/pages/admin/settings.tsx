import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Cloud,
  CreditCard,
  Globe2,
  Image,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { withAdminMeta } from '../../components/admin/withAdminLayout';

type SectionKey = 'overview' | 'branding' | 'email' | 'payment' | 'cloudflare' | 'security';
type StatusTone = 'good' | 'warning' | 'danger';

const sections = [
  { id: 'overview', label: 'Tổng quan', icon: Globe2 },
  { id: 'branding', label: 'Thương hiệu', icon: Building2 },
  { id: 'email', label: 'Email cửa hàng', icon: Mail },
  { id: 'payment', label: 'Thanh toán VNPay', icon: CreditCard },
  { id: 'cloudflare', label: 'Cloudflare', icon: Cloud },
  { id: 'security', label: 'Bảo mật & môi trường', icon: ShieldCheck },
] as const;

const statusStyles: Record<StatusTone, string> = {
  good: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
};

function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'warning' ? AlertTriangle : XCircle;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[tone]}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}

function PreviewField({ label, value, type = 'text' }: { label: string; value: string; type?: 'text' | 'password' }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        readOnly
        aria-readonly="true"
        className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 text-sm text-gray-500 outline-none"
      />
    </label>
  );
}

function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');

  const openSection = (section: SectionKey) => setActiveSection(section);
  const currentSection = sections.find((section) => section.id === activeSection) ?? sections[0];
  const CurrentIcon = currentSection.icon;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-7 pb-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
            <span>Quản trị</span><ChevronRight className="h-4 w-4" /><span className="text-gray-800">Cài đặt hệ thống</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">Cài đặt hệ thống</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">Quản lý thương hiệu, email, thanh toán và các kết nối dịch vụ của cửa hàng.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-red-700">
          <LockKeyhole className="h-3.5 w-3.5" /> Super Admin
        </span>
      </div>

      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5" role="status">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-amber-900">Bản xem trước giao diện</p>
          <p className="mt-1 text-sm leading-5 text-amber-800">Các trạng thái và giá trị minh họa chưa được đọc từ hệ thống. Chức năng lưu, kiểm tra kết nối và thay đổi bí mật chưa khả dụng vì backend Settings chưa được triển khai.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Nhóm cài đặt" className="h-fit rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => openSection(id)}
              aria-current={activeSection === id ? 'page' : undefined}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors last:mb-0 ${activeSection === id ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              <Icon className={`h-4 w-4 ${activeSection === id ? 'text-red-600' : 'text-gray-400'}`} />
              {label}
              {activeSection === id && <ChevronRight className="ml-auto h-4 w-4" />}
            </button>
          ))}
          <div className="mt-3 border-t border-gray-100 px-3 pt-3">
            <p className="text-xs leading-5 text-gray-500">Chỉ tài khoản Super Admin được truy cập khu vực này.</p>
          </div>
        </nav>

        <div className="min-w-0 space-y-6">
          {activeSection === 'overview' ? (
            <>
              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Tình trạng cấu hình</h2>
                    <p className="mt-1 text-sm text-gray-500">Trạng thái mẫu để minh họa cách nhận diện vấn đề.</p>
                  </div>
                  <span className="text-xs font-medium text-gray-400">Cập nhật lần cuối: —</span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatusTile icon={Building2} label="Thương hiệu" detail="Thiếu thông tin cửa hàng" tone="warning" />
                  <StatusTile icon={Mail} label="Email" detail="Chưa kết nối SMTP" tone="danger" />
                  <StatusTile icon={CreditCard} label="VNPay" detail="Đang dùng sandbox" tone="warning" />
                  <StatusTile icon={Cloud} label="Cloudflare" detail="Chưa kiểm tra quyền API" tone="warning" />
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Nhóm cấu hình</h2>
                  <p className="mt-1 text-sm text-gray-500">Chọn một nhóm để xem các mục dự kiến sẽ được quản lý.</p>
                </div>
                <div className="divide-y divide-gray-100">
                  <OverviewRow icon={Image} title="Thương hiệu & cửa hàng" description="Logo, tên cửa hàng, email liên hệ" status="Cần thiết lập" tone="warning" onClick={() => openSection('branding')} />
                  <OverviewRow icon={Mail} title="Email cửa hàng" description="Nhà cung cấp, địa chỉ gửi và thông tin xác thực" status="Chưa kết nối" tone="danger" onClick={() => openSection('email')} />
                  <OverviewRow icon={CreditCard} title="VNPay" description="Môi trường, merchant và URL callback" status="Sandbox" tone="warning" onClick={() => openSection('payment')} />
                  <OverviewRow icon={Cloud} title="Cloudflare" description="R2, AI, Tunnel và DNS được cho phép" status="Chưa xác minh" tone="good" onClick={() => openSection('cloudflare')} />
                  <OverviewRow icon={KeyRound} title="Bảo mật & môi trường" description="Allowlist, trạng thái áp dụng và kiểm toán" status="Chỉ xem trước" tone="warning" onClick={() => openSection('security')} />
                </div>
              </section>
            </>
          ) : (
            <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="rounded-lg bg-red-50 p-2.5 text-red-600"><CurrentIcon className="h-5 w-5" /></span>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{currentSection.label}</h2>
                      <p className="mt-1 text-sm text-gray-500">Các trường được hiển thị ở chế độ xem trước.</p>
                    </div>
                  </div>
                  <StatusBadge tone="warning">Chưa kết nối</StatusBadge>
                </div>
              </div>

              <div className="space-y-6 p-5 sm:p-6">
                {activeSection === 'branding' && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2"><PreviewField label="Tên cửa hàng" value="Chưa cấu hình" /><PreviewField label="Email hỗ trợ" value="Chưa cấu hình" /></div>
                    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5">
                      <div className="flex items-center gap-3"><Image className="h-5 w-5 text-gray-400" /><div><p className="text-sm font-semibold text-gray-800">Logo và hình ảnh thương hiệu</p><p className="mt-1 text-xs text-gray-500">Xem trước logo, favicon và ảnh dùng trên nền tối.</p></div></div>
                      <button type="button" disabled className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-400"><Image className="h-4 w-4" /> Chọn hình ảnh</button>
                    </div>
                  </>
                )}
                {activeSection === 'email' && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2"><PreviewField label="Nhà cung cấp" value="Chưa chọn" /><PreviewField label="SMTP host" value="Chưa cấu hình" /><PreviewField label="Địa chỉ From" value="Chưa cấu hình" /><PreviewField label="Reply-To" value="Chưa cấu hình" /></div>
                    <SecretNotice text="Mật khẩu SMTP hoặc API key chỉ nhập mới/luân chuyển; không hiển thị lại sau khi lưu." />
                  </>
                )}
                {activeSection === 'payment' && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2"><PreviewField label="Môi trường" value="Sandbox" /><PreviewField label="Merchant / Terminal code" value="Chưa cấu hình" /><PreviewField label="Endpoint" value="Chưa cấu hình" /><PreviewField label="Callback URL" value="Chưa cấu hình" /></div>
                    <SecretNotice text="Kiểm tra cấu hình chỉ được phép dùng sandbox; không tạo giao dịch production." />
                  </>
                )}
                {activeSection === 'cloudflare' && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2"><PreviewField label="Phạm vi tài nguyên" value="Chưa chọn account / zone" /><PreviewField label="R2 bucket" value="Chưa cấu hình" /><PreviewField label="Tunnel / hostname" value="Chưa cấu hình" /><PreviewField label="DNS zone" value="Chưa xác minh" /></div>
                    <SecretNotice text="Token được tách theo quyền tối thiểu và không bao giờ trả về trình duyệt." />
                  </>
                )}
                {activeSection === 'security' && (
                  <>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><p className="text-sm font-semibold text-emerald-900">Nguyên tắc bảo vệ bí mật</p><p className="mt-1 text-sm leading-5 text-emerald-800">Secret không được đọc lại; chỉ có thể thay mới hoặc yêu cầu xóa. Các trường environment ngoài allowlist không thể chỉnh từ giao diện.</p></div></div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2"><PreviewField label="Trạng thái allowlist" value="Chưa kết nối backend" /><PreviewField label="Thay đổi cần restart" value="Chờ tích hợp quy trình deploy" /></div>
                  </>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5">
                  <p className="text-xs text-gray-500">Thao tác sẽ khả dụng khi API Settings được triển khai.</p>
                  <button type="button" disabled className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-200 px-4 text-sm font-semibold text-gray-500">Lưu thay đổi</button>
                </div>
              </div>
            </section>
          )}

          <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm leading-5 text-gray-600"><span className="font-semibold text-gray-800">Mã màu trạng thái:</span> đỏ là nguy hiểm, vàng là cần chú ý, xanh là tốt. Không có secret nào được hiển thị trong bản xem trước này.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusTile({ icon: Icon, label, detail, tone }: { icon: React.ElementType; label: string; detail: string; tone: StatusTone }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-gray-800">{label}</span><span className={`rounded-md p-1.5 ${tone === 'good' ? 'bg-emerald-50 text-emerald-600' : tone === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}><Icon className="h-4 w-4" /></span></div>
      <p className={`mt-3 text-sm font-medium ${tone === 'good' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : 'text-red-700'}`}>{detail}</p>
    </div>
  );
}

function OverviewRow({ icon: Icon, title, description, status, tone, onClick }: { icon: React.ElementType; title: string; description: string; status: string; tone: StatusTone; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 py-4 text-left first:pt-1 last:pb-1">
      <span className="rounded-lg bg-gray-100 p-2.5 text-gray-500 transition-colors group-hover:bg-red-50 group-hover:text-red-600"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-gray-900">{title}</span><span className="mt-1 block text-xs text-gray-500">{description}</span></span>
      <StatusBadge tone={tone}>{status}</StatusBadge>
      <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-red-600" />
    </button>
  );
}

function SecretNotice({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <p className="text-sm leading-5 text-amber-900">{text}</p>
    </div>
  );
}

export default withAdminMeta(SettingsPage, { permission: 'super-admin', featureName: 'Cài đặt hệ thống' });
