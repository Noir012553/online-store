import { useEffect, useState } from 'react';
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
  Eye,
  EyeOff,
  Globe2,
  Image,
  KeyRound,
  LockKeyhole,
  Mail,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { withAdminMeta } from '../../components/admin/withAdminLayout';
import { apiCall } from '../../lib/api';
import { useLanguage } from '../../lib/i18n';
import { SITE_URL } from '../../lib/seo';

type SectionKey = 'overview' | 'branding' | 'email' | 'payment' | 'cloudflare' | 'security';
type StatusTone = 'good' | 'warning' | 'danger' | 'neutral';
type SettingsStatus = {
  generatedAt: string;
  email: {
    service: 'smtp' | 'sendgrid';
    host: string;
    port: number;
    secure: boolean;
    account: string;
    from: string;
    replyTo: string;
    userConfigured: boolean;
    passwordConfigured: boolean;
    sendgridKeyConfigured: boolean;
    configured: boolean;
  };
  payment: {
    merchantCode: string;
    endpoint: string;
    returnUrl: string;
    callbackUrl: string;
    merchantConfigured: boolean;
    secretConfigured: boolean;
    mode: 'sandbox' | 'production';
    configured: boolean;
  };
  r2: {
    configured: boolean;
    credentialsConfigured: boolean;
    configurationValid: boolean;
    uploadEnabled: boolean;
    uploadBudgetConfigured: boolean;
    policy: { maxAssets: number; maxBytes: number; maxRetries: number };
    accounts: Array<{ id: string; accountId: string; bucket: string; publicBaseUrl: string }>;
  };
  cloudflareAi: {
    enabled: boolean;
    configuredCount: number;
    maxRequestsPerDay: number;
    maxInputCharsPerDay: number;
    models: string[];
    accountIds: string[];
    allCredentialsConfigured: boolean;
  };
  cloudflareOperations: { tunnelManaged: boolean; dnsManaged: boolean };
  security: {
    secretValuesReturned: false;
    encryptedSecretStoreAvailable: boolean;
    managedOverridesAvailable: boolean;
    restartRequiredGroups: string[];
  };
};

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
  neutral: 'border-gray-200 bg-gray-50 text-gray-600',
};

function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'warning' ? AlertTriangle : tone === 'danger' ? XCircle : CircleAlert;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[tone]}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}

function DataField({ label, value }: { label: string; value: string | number }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        value={value === '' ? 'Chưa cấu hình' : value}
        readOnly
        aria-readonly="true"
        className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 text-sm text-gray-700 outline-none"
      />
    </label>
  );
}

function SecretField({ label, configured }: { label: string; configured: boolean }) {
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);

  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between gap-2 text-sm font-medium text-gray-700">
        <span>{label}</span>
        <span className={`text-xs font-medium ${configured ? 'text-emerald-700' : 'text-amber-700'}`}>
          {configured ? 'Đã cấu hình · không thể đọc lại' : 'Chưa cấu hình'}
        </span>
      </span>
      <span className="relative block">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="new-password"
          placeholder={configured ? 'Chỉ nhập nếu muốn thay đổi secret' : 'Nhập secret mới'}
          className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 pr-11 text-sm text-gray-800 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
        />
        <button
          type="button"
          onClick={() => setVisible(current => !current)}
          aria-label={visible ? `Ẩn ${label}` : `Hiện ${label}`}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-lg text-gray-500 transition hover:bg-gray-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { t, loadNamespace } = useLanguage();

  const loadStatus = async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const response = await apiCall<{ success: boolean; data: SettingsStatus }>('/admin/settings/status', {
        skipCache: true,
        skipErrorToast: true,
      });
      setStatus(response.data);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
    void loadNamespace('footer');
  }, [loadNamespace]);

  const openSection = (section: SectionKey) => setActiveSection(section);
  const currentSection = sections.find((section) => section.id === activeSection) ?? sections[0];
  const CurrentIcon = currentSection.icon;
  const storeName = t('store_name', 'admin');
  const supportEmail = t('contact_email_display', 'footer');
  const supportPhone = t('contact_phone_display', 'footer');

  const serviceTone = (configured: boolean, enabled?: boolean): StatusTone => {
    if (!configured) return 'danger';
    return enabled === false ? 'warning' : 'good';
  };

  const emailTone = status ? serviceTone(status.email.configured) : 'neutral';
  const paymentTone = status
    ? !status.payment.configured ? 'danger' : status.payment.mode === 'sandbox' ? 'warning' : 'good'
    : 'neutral';
  const r2Tone = status
    ? !status.r2.configurationValid || !status.r2.configured
      ? 'danger'
      : !status.r2.uploadEnabled || !status.r2.uploadBudgetConfigured ? 'warning' : 'good'
    : 'neutral';
  const aiTone = status
    ? !status.cloudflareAi.allCredentialsConfigured ? 'danger' : !status.cloudflareAi.enabled ? 'warning' : 'good'
    : 'neutral';

  return (
    <div className="mx-auto w-full max-w-7xl space-y-7 pb-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
            <span>Quản trị</span><ChevronRight className="h-4 w-4" /><span className="text-gray-800">Cài đặt hệ thống</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">Cài đặt hệ thống</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">Trạng thái cấu hình đang chạy của cửa hàng và các dịch vụ tích hợp.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-red-700">
          <LockKeyhole className="h-3.5 w-3.5" /> Super Admin
        </span>
      </div>

      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5" role="status">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">Thông tin được đọc trực tiếp từ backend</p>
          <p className="mt-1 text-sm leading-5 text-amber-800">Mật khẩu và token chỉ hiển thị trạng thái đã cấu hình, không gửi giá trị hiện tại về trình duyệt. Thay đổi cấu hình chưa khả dụng vì hệ thống chưa có kho secret mã hóa và quy trình reload an toàn.</p>
        </div>
        <button type="button" onClick={() => void loadStatus()} disabled={isLoading} aria-label="Làm mới trạng thái" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white text-amber-800 transition hover:bg-amber-100 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loadError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div><p className="text-sm font-semibold text-red-900">Không tải được trạng thái cấu hình</p><p className="mt-1 text-sm text-red-800">Kiểm tra kết nối backend và quyền Super Admin, sau đó thử tải lại.</p></div>
        </div>
      )}

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
                  <div><h2 className="text-lg font-bold text-gray-900">Tình trạng cấu hình</h2><p className="mt-1 text-sm text-gray-500">{isLoading ? 'Đang đọc cấu hình runtime…' : 'Trạng thái lấy từ cấu hình của backend đang chạy.'}</p></div>
                  <span className="text-xs font-medium text-gray-400">{status ? `Cập nhật: ${new Date(status.generatedAt).toLocaleString()}` : 'Chưa tải dữ liệu'}</span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatusTile icon={Building2} label="Thương hiệu" detail={storeName || 'LaptopStore'} tone="good" />
                  <StatusTile icon={Mail} label="Email" detail={status ? status.email.configured ? `${status.email.service.toUpperCase()} · ${status.email.host}` : 'Thiếu thông tin gửi email' : 'Đang tải'} tone={emailTone} />
                  <StatusTile icon={CreditCard} label="VNPay" detail={status ? `${status.payment.mode === 'sandbox' ? 'Sandbox' : 'Production'} · ${status.payment.configured ? 'đủ credentials' : 'thiếu credentials'}` : 'Đang tải'} tone={paymentTone} />
                  <StatusTile icon={Cloud} label="Cloudflare" detail={status ? `R2 ${status.r2.configured ? 'đã cấu hình' : 'chưa cấu hình'} · AI ${status.cloudflareAi.configuredCount} key` : 'Đang tải'} tone={status ? r2Tone === 'danger' || aiTone === 'danger' ? 'danger' : r2Tone === 'warning' || aiTone === 'warning' ? 'warning' : 'good' : 'neutral'} />
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-4"><h2 className="text-lg font-bold text-gray-900">Nhóm cấu hình</h2><p className="mt-1 text-sm text-gray-500">Chọn nhóm để xem giá trị không nhạy cảm và trạng thái credentials.</p></div>
                <div className="divide-y divide-gray-100">
                  <OverviewRow icon={Image} title="Thương hiệu & cửa hàng" description={`${storeName || 'LaptopStore'} · ${supportEmail || 'Chưa có email hỗ trợ'}`} status="Đang hoạt động" tone="good" onClick={() => openSection('branding')} />
                  <OverviewRow icon={Mail} title="Email cửa hàng" description={status ? `${status.email.host}:${status.email.port} · From ${status.email.from || 'chưa cấu hình'}` : 'Đang tải cấu hình email'} status={status ? status.email.configured ? 'Đã cấu hình' : 'Thiếu credentials' : 'Đang tải'} tone={emailTone} onClick={() => openSection('email')} />
                  <OverviewRow icon={CreditCard} title="VNPay" description={status ? `${status.payment.mode} · ${status.payment.endpoint}` : 'Đang tải cấu hình thanh toán'} status={status ? status.payment.configured ? status.payment.mode : 'Thiếu credentials' : 'Đang tải'} tone={paymentTone} onClick={() => openSection('payment')} />
                  <OverviewRow icon={Cloud} title="Cloudflare R2 & AI" description={status ? `${status.r2.accounts.length} R2 account · ${status.cloudflareAi.configuredCount} AI key` : 'Đang tải trạng thái Cloudflare'} status={status ? status.r2.configured && status.cloudflareAi.allCredentialsConfigured ? 'Có cấu hình' : 'Cần kiểm tra' : 'Đang tải'} tone={status ? r2Tone === 'danger' || aiTone === 'danger' ? 'danger' : r2Tone === 'warning' || aiTone === 'warning' ? 'warning' : 'good' : 'neutral'} onClick={() => openSection('cloudflare')} />
                  <OverviewRow icon={KeyRound} title="Bảo mật & môi trường" description="Secret được che; hiện chưa có kho lưu cấu hình để chỉnh sửa." status={status?.security.encryptedSecretStoreAvailable ? 'Kho secret sẵn sàng' : 'Chỉ đọc'} tone={status?.security.encryptedSecretStoreAvailable ? 'good' : 'warning'} onClick={() => openSection('security')} />
                </div>
              </section>
            </>
          ) : (
            <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3"><span className="rounded-lg bg-red-50 p-2.5 text-red-600"><CurrentIcon className="h-5 w-5" /></span><div><h2 className="text-lg font-bold text-gray-900">{currentSection.label}</h2><p className="mt-1 text-sm text-gray-500">Giá trị đang hoạt động, lấy từ frontend hoặc backend tùy cấu hình.</p></div></div>
                  <StatusBadge tone={loadError ? 'danger' : isLoading ? 'neutral' : 'warning'}>{loadError ? 'Không tải được' : isLoading ? 'Đang tải' : 'Chế độ chỉ đọc'}</StatusBadge>
                </div>
              </div>

              <div className="space-y-6 p-5 sm:p-6">
                {activeSection === 'branding' && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2"><DataField label="Tên cửa hàng" value={storeName || 'LaptopStore'} /><DataField label="Email hỗ trợ" value={supportEmail} /><DataField label="Điện thoại hỗ trợ" value={supportPhone} /><DataField label="Website" value={SITE_URL} /></div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-5"><div className="flex flex-wrap items-center gap-4"><img src="/assets/branding/logo-cropped.png" alt="Logo cửa hàng" className="h-16 w-auto rounded bg-white object-contain p-2" /><div><p className="text-sm font-semibold text-gray-800">Logo đang sử dụng</p><p className="mt-1 text-xs text-gray-500">/assets/branding/logo-cropped.png</p></div></div></div>
                  </>
                )}
                {activeSection === 'email' && status && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2"><DataField label="Nhà cung cấp" value={status.email.service === 'sendgrid' ? 'SendGrid SMTP' : 'SMTP'} /><DataField label="SMTP host" value={status.email.host} /><DataField label="Cổng" value={status.email.port} /><DataField label="TLS / secure" value={status.email.secure ? 'Bật' : 'Tắt'} /><DataField label="Tài khoản SMTP" value={status.email.account} /><DataField label="Địa chỉ From" value={status.email.from} /><DataField label="Reply-To" value={status.email.replyTo} /></div>
                    <div className="grid gap-4 sm:grid-cols-2"><SecretField label="Mật khẩu SMTP" configured={status.email.passwordConfigured} /><SecretField label="SendGrid API key" configured={status.email.sendgridKeyConfigured} /></div>
                    <SecretNotice text="Email credentials chỉ được hiển thị trạng thái. Giá trị mới nhập chỉ nằm trong form hiện tại và chưa được gửi/lưu." />
                  </>
                )}
                {activeSection === 'payment' && status && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2"><DataField label="Môi trường" value={status.payment.mode === 'sandbox' ? 'Sandbox' : 'Production'} /><DataField label="Merchant / Terminal code" value={status.payment.merchantCode} /><DataField label="Endpoint" value={status.payment.endpoint} /><DataField label="Return URL" value={status.payment.returnUrl} /><DataField label="Callback URL" value={status.payment.callbackUrl} /></div>
                    <SecretField label="VNPay hash secret" configured={status.payment.secretConfigured} />
                    <SecretNotice text="Không thể đọc lại hash secret. Cấu hình VNPay được khởi tạo khi backend start nên cần quy trình deploy an toàn để thay đổi." />
                  </>
                )}
                {activeSection === 'cloudflare' && status && (
                  <>
                    <div className="rounded-lg border border-gray-200 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">Cloudflare R2</p><p className="mt-1 text-xs text-gray-500">{status.r2.configurationValid ? `${status.r2.accounts.length} account đã cấu hình` : 'Cấu hình account không hợp lệ hoặc thiếu trường'}</p></div><StatusBadge tone={r2Tone}>{status.r2.configured ? status.r2.uploadEnabled ? 'Upload bật' : 'Upload tắt' : 'Chưa cấu hình'}</StatusBadge></div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2"><SecretField label="R2 access key ID" configured={status.r2.credentialsConfigured} /><SecretField label="R2 secret access key" configured={status.r2.credentialsConfigured} /></div>
                      {status.r2.accounts.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead className="text-xs uppercase text-gray-500"><tr><th className="pb-2 pr-4 font-medium">Account ID</th><th className="pb-2 pr-4 font-medium">Bucket</th><th className="pb-2 font-medium">Public base URL</th></tr></thead><tbody className="divide-y divide-gray-100">{status.r2.accounts.map(account => <tr key={account.id}><td className="py-2 pr-4">{account.accountId}</td><td className="py-2 pr-4">{account.bucket}</td><td className="break-all py-2">{account.publicBaseUrl}</td></tr>)}</tbody></table></div>}
                      <div className="mt-4 grid gap-3 sm:grid-cols-3"><DataField label="Upload policy" value={status.r2.uploadEnabled ? 'Bật' : 'Tắt'} /><DataField label="Số file tối đa" value={status.r2.policy.maxAssets} /><DataField label="Dung lượng tối đa (bytes)" value={status.r2.policy.maxBytes} /></div>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">Cloudflare AI</p><p className="mt-1 text-xs text-gray-500">{status.cloudflareAi.configuredCount} cấu hình credential · {status.cloudflareAi.enabled ? 'được bật' : 'đang tắt'}</p></div><StatusBadge tone={aiTone}>{status.cloudflareAi.allCredentialsConfigured ? status.cloudflareAi.enabled ? 'Sẵn sàng' : 'Đang tắt' : 'Thiếu credentials'}</StatusBadge></div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2"><DataField label="Giới hạn request/ngày" value={status.cloudflareAi.maxRequestsPerDay} /><DataField label="Giới hạn ký tự/ngày" value={status.cloudflareAi.maxInputCharsPerDay} /></div>
                      <div className="mt-4 flex flex-wrap gap-2">{status.cloudflareAi.models.length ? status.cloudflareAi.models.map((model, index) => <span key={`${model}-${index}`} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700">{model}</span>) : <span className="text-sm text-gray-500">Chưa cấu hình model</span>}</div>
                      {status.cloudflareAi.configuredCount > 0 && <div className="mt-4 grid gap-4 sm:grid-cols-2"><SecretField label="Cloudflare API token" configured={status.cloudflareAi.allCredentialsConfigured} /><DataField label="Account ID" value={status.cloudflareAi.accountIds.filter(Boolean).join(', ')} /></div>}
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">Tunnel và DNS chưa được quản lý qua ứng dụng</p><p className="mt-1 text-sm leading-5 text-amber-800">API Cloudflare và cơ chế cập nhật tunnel agent chưa được tích hợp. Không có thao tác DNS nào được thực hiện từ trang này.</p></div>
                    <SecretNotice text="Access key, secret key và API token không bao giờ được trả về từ backend." />
                  </>
                )}
                {activeSection === 'security' && status && (
                  <>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><p className="text-sm font-semibold text-emerald-900">Secret không được trả về trình duyệt</p><p className="mt-1 text-sm leading-5 text-emerald-800">API hiện chỉ trả trạng thái đã cấu hình và dữ liệu vận hành đã lọc.</p></div></div></div>
                    <div className="grid gap-4 sm:grid-cols-2"><DataField label="Kho secret mã hóa" value={status.security.encryptedSecretStoreAvailable ? 'Sẵn sàng' : 'Chưa được cấu hình'} /><DataField label="Override quản lý trong ứng dụng" value={status.security.managedOverridesAvailable ? 'Sẵn sàng' : 'Chưa được cấu hình'} /><DataField label="Số nhóm cần restart/redeploy" value={status.security.restartRequiredGroups.length} /><DataField label="Cloudflare Tunnel / DNS" value="Chưa được ứng dụng quản lý" /></div>
                    <div className="rounded-lg border border-gray-200 p-4"><p className="text-sm font-semibold text-gray-900">Nhóm cần restart/redeploy</p><div className="mt-3 flex flex-wrap gap-2">{status.security.restartRequiredGroups.map(group => <span key={group} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{group}</span>)}</div></div>
                  </>
                )}
                {(activeSection === 'email' && !status || activeSection === 'payment' && !status || activeSection === 'cloudflare' && !status || activeSection === 'security' && !status) && !isLoading && <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">Chưa có dữ liệu để hiển thị. Hãy tải lại trạng thái cấu hình.</p>}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5"><p className="text-xs text-gray-500">Chỉ xem cấu hình runtime · hiện không ghi dữ liệu mới.</p><button type="button" disabled className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-200 px-4 text-sm font-semibold text-gray-500">Lưu thay đổi</button></div>
              </div>
            </section>
          )}

          <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><p className="text-sm leading-5 text-gray-600"><span className="font-semibold text-gray-800">Mã màu trạng thái:</span> đỏ là nguy hiểm, vàng là cần chú ý, xanh là tốt. Secret hiện có không thể xem lại; nút mắt chỉ áp dụng cho giá trị mới nhập.</p></div>
        </div>
      </div>
    </div>
  );
}

function StatusTile({ icon: Icon, label, detail, tone }: { icon: React.ElementType; label: string; detail: string; tone: StatusTone }) {
  const iconTone = tone === 'good' ? 'bg-emerald-50 text-emerald-600' : tone === 'warning' ? 'bg-amber-50 text-amber-600' : tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500';
  const textTone = tone === 'good' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : tone === 'danger' ? 'text-red-700' : 'text-gray-500';
  return <div className="rounded-lg border border-gray-200 p-4"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-gray-800">{label}</span><span className={`rounded-md p-1.5 ${iconTone}`}><Icon className="h-4 w-4" /></span></div><p className={`mt-3 text-sm font-medium ${textTone}`}>{detail}</p></div>;
}

function OverviewRow({ icon: Icon, title, description, status, tone, onClick }: { icon: React.ElementType; title: string; description: string; status: string; tone: StatusTone; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 py-4 text-left first:pt-1 last:pb-1"><span className="rounded-lg bg-gray-100 p-2.5 text-gray-500 transition-colors group-hover:bg-red-50 group-hover:text-red-600"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-gray-900">{title}</span><span className="mt-1 block truncate text-xs text-gray-500">{description}</span></span><StatusBadge tone={tone}>{status}</StatusBadge><ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-red-600" /></button>;
}

function SecretNotice({ text }: { text: string }) {
  return <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><p className="text-sm leading-5 text-amber-900">{text}</p></div>;
}

export default withAdminMeta(SettingsPage, { permission: 'super-admin', featureName: 'Cài đặt hệ thống' });
