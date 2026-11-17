import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Copy,
  Pencil,
  Trash2,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Cloud,
  CreditCard,
  Database,
  Globe2,
  Image,
  Rocket,
  Sparkles,
  Truck,
  KeyRound,
  LockKeyhole,
  Mail,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { withAdminMeta } from '../../components/admin/withAdminLayout';
import { apiCall } from '../../lib/api';
import { useLanguage } from '../../lib/i18n';
import { SITE_NAME, SITE_URL } from '../../lib/seo';
import { interpolateTranslation } from '../../lib/translationInterpolate';
import { INTL_LOCALES } from '../../lib/i18n/types';

type SectionKey = 'overview' | 'branding' | 'email' | 'payment' | 'shipping' | 'deployment' | 'storage' | 'ai' | 'security';
type StatusTone = 'good' | 'warning' | 'danger' | 'neutral';
type RuntimeSetting = {
  key: string;
  group: string;
  type: string;
  secret: boolean;
  configured: boolean;
  valid: boolean | null;
  restartRequired: boolean;
} & ({ secret: true } | { secret: false; value: string });
type DraftSetting = string | { configured: boolean; reset?: boolean } | null;
type SettingsDraft = { version: number; settings: Record<string, DraftSetting> };
type SettingDefinition = { group: string; type: string; secret: boolean; restartRequired: boolean; min?: number; max?: number; values?: string[] };
type AdminPaymentMethod = {
  code: 'cod' | 'vnpay';
  name: string;
  description: string;
  isEnabled: boolean;
  isDeleted: boolean;
  available: boolean;
};
type ApplyJob = {
  id: string;
  status: 'unavailable' | 'queued' | 'claimed' | 'applying' | 'rolling-back' | 'succeeded' | 'failed' | 'rollback-failed';
  applied: boolean;
  version: number;
  message?: string;
};
type SettingsStatus = {
  generatedAt: string;
  email: {
    service: 'smtp' | 'sendgrid'; host: string; port: number; secure: boolean;
    account: string; from: string; userConfigured: boolean; passwordConfigured: boolean;
    sendgridKeyConfigured: boolean; configured: boolean;
  };
  payment: {
    merchantCode: string; endpoint: string; returnUrl: string; callbackUrl: string;
    merchantConfigured: boolean; secretConfigured: boolean; mode: 'sandbox' | 'production'; configured: boolean;
  };
  r2: {
    configured: boolean; credentialsConfigured: boolean; configurationValid: boolean;
    policyValid: boolean; uploadEnabled: boolean; uploadBudgetConfigured: boolean;
    policy: { maxAssets: number; maxBytes: number; maxRetries: number };
    accounts: Array<{ id: string; accountId: string; bucket: string; publicBaseUrl: string }>;
  };
  cloudflareAi: {
    enabled: boolean; configuredCount: number; maxRequestsPerDay: number;
    maxInputCharsPerDay: number;
    limits?: Partial<{ maxOutputTokens: number; rateLimitCooldownMs: number; cooldownWaitBudgetMs: number; maxParallelPerKey: number }>;
    models: string[]; accountIds: string[]; allCredentialsConfigured: boolean;
  };
  cloudflareOperations: { tunnelManaged: boolean; dnsManaged: boolean };
  security: {
    encryptedSecretStoreAvailable: boolean; managedOverridesAvailable: boolean;
    managedDraftAvailable: boolean; applyWorkerAvailable: boolean; restartRequiredGroups: string[];
  };
};
type SettingsGroup = { section: 'email' | 'payment' | 'shipping' | 'storage' | 'ai'; title: string; keys: string[] };
type ProviderCategory = 'email' | 'payment' | 'shipping' | 'deployment' | 'storage';
type ProviderDirectoryEntry = {
  id: string;
  category: ProviderCategory;
  code: string;
  name: string;
  description: string;
  managementUrl: string;
  details: Array<{ label: string; value: string }>;
  isDeleted: boolean;
  isConnected: false;
  isOperational: false;
};
type ProviderPreset = { code: string; name: string; description: string; managementUrl: string; statusLabel: string };
type ShippingProviderEntry = { _id: string; code: string; name: string; description?: string; isActive: boolean; isDeleted?: boolean };

const providerPresets: Partial<Record<ProviderCategory, ProviderPreset[]>> = {
  email: [
    { code: 'smtp', name: 'SMTP', description: 'Gửi email qua máy chủ SMTP được cấu hình.', managementUrl: '', statusLabel: 'Đang hỗ trợ' },
    { code: 'sendgrid', name: 'SendGrid', description: 'Gửi email qua dịch vụ SMTP của SendGrid.', managementUrl: 'https://sendgrid.com/', statusLabel: 'Đang hỗ trợ' },
  ],
  payment: [
    { code: 'cod', name: 'COD', description: 'Thanh toán khi nhận hàng.', managementUrl: '', statusLabel: 'Đang hỗ trợ' },
    { code: 'vnpay', name: 'VNPay', description: 'Thanh toán trực tuyến qua VNPay.', managementUrl: '', statusLabel: 'Đang hỗ trợ' },
  ],
  shipping: [
    { code: 'ghn', name: 'GHN', description: 'Tính phí vận chuyển và tạo vận đơn.', managementUrl: '', statusLabel: 'Đang hỗ trợ' },
  ],
  deployment: [
    { code: 'cloudflare-tunnel', name: 'Cloudflare Tunnel', description: 'Mô hình kết nối/định tuyến hiện tại; không tự build hoặc deploy ứng dụng.', managementUrl: 'https://dash.cloudflare.com/', statusLabel: 'Đang sử dụng' },
  ],
  storage: [
    { code: 'cloudflare-r2', name: 'Cloudflare R2', description: 'Lưu trữ tệp qua adapter Cloudflare R2 hiện có.', managementUrl: 'https://dash.cloudflare.com/', statusLabel: 'Đang hỗ trợ' },
  ],
};

const r2NumberedKeys = (base: string) => [base, ...Array.from({ length: 8 }, (_, index) => `${base}_${index + 2}`)];
const r2AccountSlots = Array.from({ length: 9 }, (_, index) => String(index + 1));
const r2AccountKey = (base: string, slot: string) => slot === '1' ? base : `${base}_${slot}`;
const r2AccountRoleKeys = ['R2_ACCOUNT_ROLE', ...['GENERAL', 'PRODUCT', 'MAIN', 'GALLERY', 'DESCRIPTION', 'BANNER', 'BRAND', 'ABOUT_REVIEWER', 'ABOUT_LOADING', 'ABOUT_TEAM', 'ABOUT_HERO'].map(role => `R2_ACCOUNT_ROLE_${role}`)];
const aiModelKeys = ['CLOUDFLARE_AI_MODEL', ...Array.from({ length: 13 }, (_, index) => `CLOUDFLARE_AI_MODEL_${index + 1}`)];
const cloudflareAccountKeys = ['CLOUDFLARE_ACCOUNT_ID', ...Array.from({ length: 13 }, (_, index) => `CLOUDFLARE_ACCOUNT_ID_${index + 1}`)];
const cloudflareTokenKeys = ['CLOUDFLARE_API_TOKEN', ...Array.from({ length: 13 }, (_, index) => `CLOUDFLARE_API_TOKEN_${index + 1}`)];
const cloudflareAiAccountSlots = Array.from({ length: 13 }, (_, index) => String(index + 1));
const defaultCloudflareAiModel = '@cf/meta/llama-3-8b-instruct';
const runtimeSecretKeys = [
  'EMAIL_PASSWORD', 'SENDGRID_API_KEY', 'VNPAY_HASH_SECRET', 'GHN_API_TOKEN',
  ...r2NumberedKeys('R2_ACCESS_KEY_ID'), ...r2NumberedKeys('R2_SECRET_ACCESS_KEY'),
  ...cloudflareTokenKeys,
];
const hiddenCloudflareAiSettingKeys = new Set([
  'CLOUDFLARE_AI_MAX_TOKENS',
  'CLOUDFLARE_RATE_LIMIT_COOLDOWN_MS',
  'CLOUDFLARE_MAX_RATE_LIMIT_COOLDOWN_MS',
  'CLOUDFLARE_COOLDOWN_WAIT_BUDGET_MS',
  'CLOUDFLARE_MAX_PARALLEL_PER_KEY',
]);

// Keep this list explicit and in sync with the backend managed-draft allowlist.
const settingsGroups: SettingsGroup[] = [
  { section: 'email', title: 'Email', keys: ['EMAIL_SERVICE', 'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_SECURE', 'EMAIL_USER', 'EMAIL_FROM', 'EMAIL_PASSWORD', 'SENDGRID_API_KEY'] },
  { section: 'payment', title: 'Thanh toán', keys: ['VNPAY_ENDPOINT', 'VNPAY_TMN_CODE', 'VNPAY_RETURN_URL', 'VNPAY_CALLBACK_URL', 'VNPAY_HASH_SECRET'] },
  { section: 'shipping', title: 'Cấu hình GHN sandbox', keys: ['GHN_API_TOKEN', 'GHN_SHOP_ID', 'GHN_WAREHOUSE_DISTRICT_ID', 'GHN_WAREHOUSE_WARD_CODE', 'GHN_MAX_INSURANCE_VALUE'] },
  { section: 'storage', title: 'Chính sách tải lên R2', keys: ['R2_UPLOAD_ENABLED', 'R2_MAX_UPLOAD_COUNT', 'R2_MAX_UPLOAD_BYTES', 'R2_MAX_RETRIES', 'R2_MAX_IMAGE_BYTES', 'R2_MAX_VIDEO_BYTES'] },
  { section: 'storage', title: 'Thông tin công khai R2', keys: [...r2NumberedKeys('R2_ACCOUNT_ID'), ...r2NumberedKeys('R2_BUCKET_NAME'), ...r2NumberedKeys('R2_PUBLIC_BASE_URL')] },
  { section: 'storage', title: 'Thông tin xác thực R2', keys: [...r2NumberedKeys('R2_ACCESS_KEY_ID'), ...r2NumberedKeys('R2_SECRET_ACCESS_KEY')] },
  { section: 'storage', title: 'Phân công tài khoản R2', keys: r2AccountRoleKeys },
  { section: 'ai', title: 'Tài khoản Cloudflare AI', keys: [...cloudflareAccountKeys, ...cloudflareTokenKeys] },
  { section: 'ai', title: 'Chính sách Cloudflare AI', keys: ['CLOUDFLARE_AI_ENABLED', 'CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY', 'CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY', 'CLOUDFLARE_MAX_REQUESTS_PER_SEC', 'CLOUDFLARE_MAX_PARALLEL_REQUESTS'] },
  { section: 'ai', title: 'Mô hình Cloudflare AI', keys: aiModelKeys },
];
const allowedKeys = new Set(settingsGroups.flatMap(group => group.keys));
const secretKeys = new Set(runtimeSecretKeys);
const fieldLabels: Record<string, string> = {
  EMAIL_SERVICE: 'Nhà cung cấp email', EMAIL_HOST: 'Máy chủ SMTP', EMAIL_PORT: 'Cổng SMTP', EMAIL_SECURE: 'Kết nối TLS an toàn',
  EMAIL_USER: 'Tài khoản email', EMAIL_FROM: 'Địa chỉ người gửi', EMAIL_PASSWORD: 'Mật khẩu email', SENDGRID_API_KEY: 'Khóa API SendGrid',
  VNPAY_ENDPOINT: 'Địa chỉ cổng thanh toán', VNPAY_TMN_CODE: 'Mã đơn vị VNPay', VNPAY_RETURN_URL: 'URL quay về',
  VNPAY_CALLBACK_URL: 'URL nhận thông báo', VNPAY_HASH_SECRET: 'Khóa bí mật VNPay',
  GHN_API_TOKEN: 'API token GHN', GHN_SHOP_ID: 'Mã shop GHN', GHN_WAREHOUSE_DISTRICT_ID: 'Mã quận/huyện kho GHN',
  GHN_WAREHOUSE_WARD_CODE: 'Mã phường/xã kho GHN', GHN_MAX_INSURANCE_VALUE: 'Giá trị bảo hiểm tối đa GHN', R2_UPLOAD_ENABLED: 'Bật tải lên',
  R2_MAX_UPLOAD_COUNT: 'Số tệp tối đa', R2_MAX_UPLOAD_BYTES: 'Dung lượng tối đa', R2_MAX_RETRIES: 'Số lần thử lại',
  R2_MAX_IMAGE_BYTES: 'Dung lượng ảnh tối đa', R2_MAX_VIDEO_BYTES: 'Dung lượng video tối đa', CLOUDFLARE_AI_ENABLED: 'Bật Cloudflare AI',
  CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY: 'Số yêu cầu tối đa mỗi ngày', CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY: 'Số ký tự đầu vào tối đa mỗi ngày',
  CLOUDFLARE_MAX_REQUESTS_PER_SEC: 'Số yêu cầu tối đa mỗi giây',
  CLOUDFLARE_MAX_PARALLEL_REQUESTS: 'Số yêu cầu đồng thời tối đa', CLOUDFLARE_AI_MODEL: 'Mô hình AI',
};
const settingHelpText: Record<string, string> = {
  EMAIL_SERVICE: 'Chọn smtp hoặc sendgrid theo tài khoản gửi thư đang dùng.',
  EMAIL_HOST: 'Tên máy chủ SMTP do nhà cung cấp email cung cấp; không nhập địa chỉ email.',
  EMAIL_PORT: 'Số cổng SMTP theo hướng dẫn của nhà cung cấp email.',
  EMAIL_SECURE: 'Chọn theo chế độ kết nối SMTP mà nhà cung cấp yêu cầu.',
  EMAIL_USER: 'Tên đăng nhập SMTP, thường là địa chỉ email của tài khoản gửi.',
  EMAIL_FROM: 'Địa chỉ người gửi đã được xác minh với nhà cung cấp email.',
  EMAIL_PASSWORD: 'Mật khẩu SMTP hoặc app password do nhà cung cấp yêu cầu; không phải lúc nào cũng là mật khẩu đăng nhập email.',
  SENDGRID_API_KEY: 'API key tạo trong tài khoản SendGrid; chỉ cần khi chọn SendGrid.',
  VNPAY_ENDPOINT: 'Dùng endpoint sandbox do VNPay cấp cho môi trường thử nghiệm; không dùng endpoint production khi đang test.',
  VNPAY_TMN_CODE: 'Mã terminal/merchant của tài khoản VNPay sandbox, lấy trong thông tin tích hợp của merchant.',
  VNPAY_RETURN_URL: 'URL HTTPS công khai để khách hàng quay lại sau thanh toán; dùng đúng URL return đã cấu hình cho ứng dụng và đăng ký với VNPay.',
  VNPAY_CALLBACK_URL: 'URL HTTPS công khai nhận kết quả server-to-server. Backend hiện nhận tại /api/payments/webhook/vnpay; URL phải trỏ đúng domain API đang chạy và được khai báo với VNPay.',
  VNPAY_HASH_SECRET: 'Secret ký giao dịch của đúng tài khoản VNPay sandbox; không dùng secret production.',
  GHN_API_TOKEN: 'Token lấy từ tài khoản GHN cùng môi trường đang cấu hình; giữ bí mật.',
  GHN_SHOP_ID: 'Shop ID do GHN cấp cho cửa hàng; nhập dạng số, không tự đặt.',
  GHN_WAREHOUSE_DISTRICT_ID: 'Mã quận/huyện của địa chỉ kho gửi đã đăng ký với GHN; lấy từ dữ liệu địa chỉ GHN, không đoán.',
  GHN_WAREHOUSE_WARD_CODE: 'Mã phường/xã của cùng địa chỉ kho gửi theo dữ liệu GHN.',
  GHN_MAX_INSURANCE_VALUE: 'Giới hạn giá trị bảo hiểm khai báo theo chính sách GHN áp dụng cho shop; nhập số tiền VND.',
  R2_UPLOAD_ENABLED: 'Bật true hoặc false theo việc cho phép ứng dụng tải tệp lên R2.',
  R2_MAX_UPLOAD_COUNT: 'Số lượng tệp tối đa được phép trong một lần tải lên.',
  R2_MAX_UPLOAD_BYTES: 'Tổng dung lượng tối đa của một lần tải lên, tính bằng byte.',
  R2_MAX_RETRIES: 'Số lần thử lại tối đa khi tải lên thất bại.',
  R2_MAX_IMAGE_BYTES: 'Dung lượng ảnh tối đa cho mỗi tệp, tính bằng byte.',
  R2_MAX_VIDEO_BYTES: 'Dung lượng video tối đa cho mỗi tệp, tính bằng byte.',
  CLOUDFLARE_AI_ENABLED: 'Bật true chỉ khi đã cấu hình tài khoản và API token có quyền dùng Workers AI.',
  CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY: 'Giới hạn số yêu cầu AI mỗi ngày; nhập số nguyên.',
  CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY: 'Giới hạn tổng số ký tự đầu vào AI mỗi ngày; nhập số nguyên.',
  CLOUDFLARE_MAX_REQUESTS_PER_SEC: 'Giới hạn yêu cầu AI mỗi giây; nhập số nguyên theo giới hạn vận hành mong muốn.',
  CLOUDFLARE_MAX_PARALLEL_REQUESTS: 'Giới hạn số yêu cầu AI chạy đồng thời; nhập số nguyên.',
};
const getSettingHelpText = (key: string) => settingHelpText[key]
  ?? (key.startsWith('R2_ACCOUNT_ID') ? 'Account ID 32 ký tự hex trong trang tổng quan Cloudflare của tài khoản chứa bucket.'
    : key.startsWith('R2_BUCKET_NAME') ? 'Tên bucket R2 đã tạo trong tài khoản Cloudflare tương ứng.'
      : key.startsWith('R2_PUBLIC_BASE_URL') ? 'URL HTTPS công khai hoặc custom domain đã gắn với bucket để truy cập tệp.'
        : key.startsWith('R2_ACCESS_KEY_ID') ? 'Access Key ID tạo cho R2 API token có quyền truy cập bucket này.'
          : key.startsWith('R2_SECRET_ACCESS_KEY') ? 'Secret Access Key đi cùng Access Key ID phía trên; không dùng Cloudflare Global API Key.'
            : key.startsWith('R2_ACCOUNT_ROLE') ? 'Chọn số slot R2 đã cấu hình ở trên; các slot được đánh số từ 1 đến 9.'
              : key.startsWith('CLOUDFLARE_ACCOUNT_ID') ? 'Account ID trong Cloudflare dashboard của tài khoản Workers AI.'
                : key.startsWith('CLOUDFLARE_API_TOKEN') ? 'API token tạo trong Cloudflare với quyền tối thiểu cần cho Workers AI; không dùng Global API Key.'
                  : key.startsWith('CLOUDFLARE_AI_MODEL') ? 'Model identifier được Cloudflare Workers AI hỗ trợ cho tài khoản này; để trống nếu muốn dùng mặc định.'
                    : key === 'CLOUDFLARE_AI_MAX_TOKENS' ? 'Số token đầu ra tối đa cho mỗi yêu cầu AI.'
                      : key === 'CLOUDFLARE_RATE_LIMIT_COOLDOWN_MS' || key === 'CLOUDFLARE_MAX_RATE_LIMIT_COOLDOWN_MS' || key === 'CLOUDFLARE_COOLDOWN_WAIT_BUDGET_MS' ? 'Thời lượng tính bằng mili giây; chỉ thay đổi theo chính sách giới hạn tốc độ đã chọn.'
                        : key === 'CLOUDFLARE_MAX_PARALLEL_PER_KEY' ? 'Số yêu cầu đồng thời tối đa cho mỗi API token.'
                          : 'Nhập giá trị theo loại dữ liệu và giới hạn hiển thị; thông tin xác thực phải lấy từ tài khoản dịch vụ tương ứng.');

const sections = [
  { id: 'overview', label: 'overview' },
  { id: 'branding', label: 'branding' },
  { id: 'email', label: 'email' },
  { id: 'payment', label: 'payment' },
  { id: 'shipping', label: 'shipping' },
  { id: 'deployment', label: 'deployment' },
  { id: 'storage', label: 'storage' },
  { id: 'ai', label: 'ai' },
  { id: 'security', label: 'security' },
] as const;
const sectionIcons: Record<SectionKey, typeof Building2> = {
  overview: Globe2,
  branding: Building2,
  email: Mail,
  payment: CreditCard,
  shipping: Truck,
  deployment: Rocket,
  storage: Database,
  ai: Sparkles,
  security: ShieldCheck,
};

function useSettingsText() {
  const { t } = useLanguage();
  return (key: string, variables?: Record<string, string | number>) => interpolateTranslation(t(key, 'admin-settings'), variables);
}

const statusStyles: Record<StatusTone, string> = {
  good: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
  neutral: 'border-gray-200 bg-gray-50 text-gray-600',
};

function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'warning' ? AlertTriangle : tone === 'danger' ? XCircle : CircleAlert;
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[tone]}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{children}</span>;
}

function BaseDataField({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Building2 }) {
  return <div className="block space-y-2"><span className="text-sm font-medium text-gray-700">{label}</span><div className="flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm text-gray-700"><Icon className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" /><span className="min-w-0 break-all">{value || '—'}</span></div></div>;
}

function DataField({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Building2 }) {
  return <BaseDataField label={label} value={value} icon={Icon} />;
}

function SecretDataField({ label, configured, value, revealed, loading, error, onToggle, icon: Icon }: {
  label: string; configured: boolean; value?: string; revealed: boolean; loading: boolean; error: string; onToggle: () => void; icon: typeof Building2;
}) {
  return <div className="block space-y-2"><span className="text-sm font-medium text-gray-700">{label}</span><div className="flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm text-gray-700"><Icon className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" /><span className="min-w-0 flex-1 break-all font-mono">{configured ? revealed ? value : '••••••••' : 'Chưa cấu hình'}</span><button type="button" onClick={onToggle} disabled={!configured || loading} aria-label={revealed ? `Ẩn ${label}` : `Hiện ${label}`} aria-pressed={revealed} title={configured ? revealed ? 'Ẩn giá trị' : 'Hiện giá trị' : 'Chưa cấu hình'} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : revealed ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}</button></div>{error && <span role="alert" className="block text-xs text-red-700">{error}</span>}</div>;
}

function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<AdminPaymentMethod[]>([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
  const [paymentMethodsError, setPaymentMethodsError] = useState('');
  const [providerEntries, setProviderEntries] = useState<ProviderDirectoryEntry[]>([]);
  const [providerEntriesLoading, setProviderEntriesLoading] = useState(false);
  const [providerEntriesError, setProviderEntriesError] = useState('');
  const [providerSaving, setProviderSaving] = useState(false);
  const [shippingProviders, setShippingProviders] = useState<ShippingProviderEntry[]>([]);
  const [shippingProvidersLoading, setShippingProvidersLoading] = useState(false);
  const [shippingProvidersError, setShippingProvidersError] = useState('');
  const [shippingProviderActionId, setShippingProviderActionId] = useState('');
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSetting[]>([]);
  const [settingsSchema, setSettingsSchema] = useState<Record<string, SettingDefinition>>({});
  const [settingsSchemaError, setSettingsSchemaError] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [revealedRuntimeValues, setRevealedRuntimeValues] = useState<Record<string, boolean>>({});
  const [secretRevealLoading, setSecretRevealLoading] = useState<Record<string, boolean>>({});
  const [secretRevealErrors, setSecretRevealErrors] = useState<Record<string, string>>({});
  const [runtimeActionErrors, setRuntimeActionErrors] = useState<Record<string, string>>({});
  const [copiedSettingKey, setCopiedSettingKey] = useState('');
  const [focusSettingKey, setFocusSettingKey] = useState('');
  const [selectedCloudflareAiSlot, setSelectedCloudflareAiSlot] = useState('1');
  const [selectedR2AccountSlot, setSelectedR2AccountSlot] = useState('1');
  const [valuesLoading, setValuesLoading] = useState(true);
  const [valuesError, setValuesError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [draftLoadError, setDraftLoadError] = useState('');
  const [draftVersion, setDraftVersion] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});
  const [secretResets, setSecretResets] = useState<Record<string, boolean>>({});
  const [secretConfigured, setSecretConfigured] = useState<Record<string, boolean>>({});
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [applyJob, setApplyJob] = useState<ApplyJob | null>(null);
  const [applyError, setApplyError] = useState('');
  const [applyPollingError, setApplyPollingError] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const { t, loadNamespace, locale } = useLanguage();
  const text = useSettingsText();
  const loadSettingsSchema = async () => {
    setSettingsSchemaError(false);
    try {
      const response = await apiCall<{ success: boolean; data: { settings: Record<string, SettingDefinition> } }>('/admin/settings/schema', { skipCache: true, skipErrorToast: true });
      setSettingsSchema(response.data.settings);
    } catch {
      setSettingsSchemaError(true);
      setSettingsSchema({});
    }
  };

  const loadRuntimeSettings = async () => {
    setRevealedSecrets({});
    setRevealedRuntimeValues({});
    setValuesLoading(true);
    setValuesError(false);
    try {
      const response = await apiCall<{ success: boolean; data: { settings: RuntimeSetting[] } }>('/admin/settings/values', { skipCache: true, skipErrorToast: true });
      const visibleSettings = response.data.settings.filter(setting => !hiddenCloudflareAiSettingKeys.has(setting.key));
      setRuntimeSettings(visibleSettings);
      return visibleSettings;
    } catch {
      setValuesError(true);
      return [];
    } finally {
      setValuesLoading(false);
    }
  };

  const loadStatus = async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const response = await apiCall<{ success: boolean; data: SettingsStatus }>('/admin/settings/status', { skipCache: true, skipErrorToast: true });
      setStatus(response.data);
      return response.data;
    } catch {
      setLoadError(true);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const loadDraft = async (liveSettings: RuntimeSetting[], runtimeStatus: SettingsStatus | null) => {
    setDraftLoadError('');
    const liveValues: Record<string, string> = {};
    const configuredSecrets: Record<string, boolean> = {};
    liveSettings.forEach(setting => {
      if (!allowedKeys.has(setting.key)) return;
      if (setting.secret && secretKeys.has(setting.key)) configuredSecrets[setting.key] = setting.configured;
      else if (!setting.secret && !secretKeys.has(setting.key)) liveValues[setting.key] = setting.value;
    });
    if (runtimeStatus) {
      liveValues.R2_UPLOAD_ENABLED = String(runtimeStatus.r2.uploadEnabled);
      if (runtimeStatus.r2.policyValid) {
        liveValues.R2_MAX_UPLOAD_COUNT = String(runtimeStatus.r2.policy.maxAssets);
        liveValues.R2_MAX_UPLOAD_BYTES = String(runtimeStatus.r2.policy.maxBytes);
        liveValues.R2_MAX_RETRIES = String(runtimeStatus.r2.policy.maxRetries);
      }
    }
    try {
      const response = await apiCall<{ success: boolean; data: { draft: SettingsDraft | null } }>('/admin/settings/draft', { skipCache: true, skipErrorToast: true });
      const loadedDraft = response.data.draft;
      const draftValues = { ...liveValues };
      if (loadedDraft) {
        Object.entries(loadedDraft.settings).forEach(([key, value]) => {
          if (!allowedKeys.has(key)) return;
          if (secretKeys.has(key)) {
            if (typeof value === 'object' && value !== null) {
              configuredSecrets[key] = value.configured;
            }
          } else if (value === null) {
            draftValues[key] = '';
          } else if (typeof value === 'string') {
            draftValues[key] = value;
          }
        });
      }
      setDraft(loadedDraft);
      setDraftVersion(loadedDraft?.version ?? 0);
      setValues(draftValues);
      setBaseline(draftValues);
      setSecretInputs({});
      setSecretResets({});
      setSecretConfigured(configuredSecrets);
    } catch (error) {
      const code = (error as Error & { code?: string }).code;
      setDraft(null);
      setDraftVersion(0);
      setValues(liveValues);
      setBaseline(liveValues);
      setSecretInputs({});
      setSecretResets({});
      setSecretConfigured(configuredSecrets);
      setDraftLoadError(code === 'SETTINGS_STORE_UNAVAILABLE' ? '' : 'Không tải được bản nháp đã lưu. Cấu hình đang chạy vẫn được giữ nguyên; hãy tải lại trước khi lưu thay đổi.');
    }
  };

  const refreshAll = async () => {
    const [liveSettings, runtimeStatus] = await Promise.all([loadRuntimeSettings(), loadStatus(), loadSettingsSchema()]);
    await loadDraft(liveSettings, runtimeStatus);
  };

  const loadPaymentMethods = async () => {
    setPaymentMethodsLoading(true);
    setPaymentMethodsError('');
    try {
      const response = await apiCall<{ success: boolean; data: { methods: AdminPaymentMethod[] } }>('/admin/payment-methods', { skipCache: true, skipErrorToast: true });
      setPaymentMethods(response.data.methods);
    } catch {
      setPaymentMethodsError('Không thể tải danh sách phương thức thanh toán.');
    } finally {
      setPaymentMethodsLoading(false);
    }
  };

  const updatePaymentMethod = async (code: AdminPaymentMethod['code'], updates: Partial<Pick<AdminPaymentMethod, 'name' | 'description' | 'isEnabled' | 'isDeleted'>>) => {
    setPaymentMethodsError('');
    try {
      await apiCall(`/admin/payment-methods/${code}`, { method: 'PATCH', body: JSON.stringify(updates), skipErrorToast: true });
      await loadPaymentMethods();
      return true;
    } catch {
      setPaymentMethodsError('Không thể cập nhật phương thức thanh toán.');
      return false;
    }
  };

  const deletePaymentMethod = async (code: AdminPaymentMethod['code']) => {
    if (!window.confirm('Ẩn phương thức này khỏi checkout?')) return;
    setPaymentMethodsError('');
    try {
      await apiCall(`/admin/payment-methods/${code}`, { method: 'DELETE', skipErrorToast: true });
      await loadPaymentMethods();
    } catch {
      setPaymentMethodsError('Không thể xóa phương thức thanh toán.');
    }
  };

  const loadProviderEntries = async () => {
    setProviderEntriesLoading(true);
    setProviderEntriesError('');
    try {
      const response = await apiCall<{ success: boolean; data: { providers: ProviderDirectoryEntry[] } }>('/admin/providers', { skipCache: true, skipErrorToast: true });
      setProviderEntries(response.data.providers);
    } catch {
      setProviderEntriesError('Không thể tải danh sách đối tác.');
    } finally {
      setProviderEntriesLoading(false);
    }
  };

  const loadShippingProviders = async () => {
    setShippingProvidersLoading(true);
    setShippingProvidersError('');
    try {
      const response = await apiCall<{ providers: ShippingProviderEntry[] }>('/shipping-providers?pageSize=100&pageNumber=1', { skipCache: true, skipErrorToast: true });
      setShippingProviders(response.providers);
    } catch {
      setShippingProvidersError('Không thể tải danh sách nhà vận chuyển.');
    } finally {
      setShippingProvidersLoading(false);
    }
  };

  const toggleShippingProvider = async (provider: ShippingProviderEntry) => {
    if (provider.code !== 'ghn') return;
    setShippingProviderActionId(provider._id);
    setShippingProvidersError('');
    try {
      await apiCall(`/shipping-providers/${provider._id}/toggle`, { method: 'PUT', body: JSON.stringify({ isActive: !provider.isActive }), skipErrorToast: true });
      await loadShippingProviders();
    } catch {
      setShippingProvidersError('Không thể cập nhật trạng thái GHN.');
    } finally {
      setShippingProviderActionId('');
    }
  };

  const createProviderEntry = async (input: Omit<ProviderDirectoryEntry, 'id' | 'isDeleted' | 'isConnected' | 'isOperational'>) => {
    setProviderSaving(true);
    setProviderEntriesError('');
    try {
      await apiCall('/admin/providers', { method: 'POST', body: JSON.stringify(input), skipErrorToast: true });
      await loadProviderEntries();
      return true;
    } catch {
      setProviderEntriesError('Không thể thêm đối tác. Hãy kiểm tra mã, tên và liên kết HTTPS.');
      return false;
    } finally {
      setProviderSaving(false);
    }
  };

  const updateProviderEntry = async (id: string, updates: { name: string; description: string; managementUrl: string; details: Array<{ label: string; value: string }> }) => {
    setProviderSaving(true);
    setProviderEntriesError('');
    try {
      await apiCall(`/admin/providers/${id}`, { method: 'PATCH', body: JSON.stringify(updates), skipErrorToast: true });
      await loadProviderEntries();
      return true;
    } catch {
      setProviderEntriesError('Không thể cập nhật đối tác. Hãy kiểm tra tên và liên kết HTTPS.');
      return false;
    } finally {
      setProviderSaving(false);
    }
  };

  const archiveProviderEntry = async (entry: ProviderDirectoryEntry) => {
    if (!window.confirm(`Ẩn ${entry.name} khỏi danh sách?`)) return;
    setProviderEntriesError('');
    try {
      await apiCall(`/admin/providers/${entry.id}`, { method: 'DELETE', skipErrorToast: true });
      await loadProviderEntries();
    } catch {
      setProviderEntriesError('Không thể ẩn đối tác.');
    }
  };

  const restoreProviderEntry = async (entry: ProviderDirectoryEntry) => {
    setProviderEntriesError('');
    try {
      await apiCall(`/admin/providers/${entry.id}/restore`, { method: 'PUT', skipErrorToast: true });
      await loadProviderEntries();
    } catch {
      setProviderEntriesError('Không thể khôi phục đối tác.');
    }
  };

  useEffect(() => {
    void refreshAll();
    void loadNamespace('footer');
    void loadNamespace('admin-settings');
  }, [loadNamespace]);

  useEffect(() => {
    if (activeSection === 'payment') void loadPaymentMethods();
    if (activeSection === 'shipping') void loadShippingProviders();
    if (['email', 'payment', 'shipping', 'deployment', 'storage'].includes(activeSection)) void loadProviderEntries();
  }, [activeSection]);

  const hasUnsavedChanges = useMemo(() => (
    Object.keys(values).some(key => (values[key] ?? '') !== (baseline[key] ?? ''))
    || Object.values(secretInputs).some(value => value.length > 0)
    || Object.values(secretResets).some(Boolean)
  ), [values, baseline, secretInputs, secretResets]);

  useEffect(() => {
    if (!focusSettingKey) return;
    const field = document.getElementById(`settings-${focusSettingKey}`);
    if (!field) return;
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field.focus();
    setFocusSettingKey('');
  }, [activeSection, focusSettingKey]);

  useEffect(() => {
    if (applyJob && ['succeeded', 'failed', 'rollback-failed'].includes(applyJob.status)) {
      void loadStatus();
      void loadRuntimeSettings();
      return;
    }
    if (!applyJob || !['queued', 'claimed', 'applying', 'rolling-back'].includes(applyJob.status)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiCall<{ success: boolean; data: { job: ApplyJob } }>(`/admin/settings/apply-jobs/${encodeURIComponent(applyJob.id)}`, { skipCache: true, skipErrorToast: true });
        if (!cancelled) {
          setApplyJob(response.data.job);
          setApplyPollingError('');
        }
      } catch {
        if (!cancelled) {
          setApplyPollingError('Không thể cập nhật trạng thái áp dụng. Đang thử lại…');
          setApplyJob(current => current ? { ...current } : current);
        }
      }
    }, 2000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [applyJob]);

  const setFieldValue = (key: string, value: string) => setValues(current => ({ ...current, [key]: value }));
  const fetchSecretValue = async (key: string) => {
    const response = await apiCall<{ success: boolean; data: { value: string } }>(`/admin/settings/secrets/${encodeURIComponent(key)}`, { skipCache: true, skipErrorToast: true });
    return response.data.value;
  };
  const toggleSecretReveal = async (key: string) => {
    if (Object.hasOwn(revealedSecrets, key)) {
      setRevealedSecrets(current => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setSecretRevealErrors(current => ({ ...current, [key]: '' }));
      return;
    }

    setSecretRevealLoading(current => ({ ...current, [key]: true }));
    setSecretRevealErrors(current => ({ ...current, [key]: '' }));
    try {
      const value = await fetchSecretValue(key);
      setRevealedSecrets(current => ({ ...current, [key]: value }));
    } catch {
      setSecretRevealErrors(current => ({ ...current, [key]: 'Không thể hiển thị secret.' }));
    } finally {
      setSecretRevealLoading(current => ({ ...current, [key]: false }));
    }
  };
  const toggleRuntimeSetting = (setting: RuntimeSetting) => {
    if (setting.secret) {
      void toggleSecretReveal(setting.key);
      return;
    }
    setRevealedRuntimeValues(current => ({ ...current, [setting.key]: !current[setting.key] }));
  };
  const editRuntimeSetting = (setting: RuntimeSetting) => {
    setActiveSection(setting.group === 'email' ? 'email' : setting.group === 'vnpay' ? 'payment' : setting.group === 'r2' ? 'storage' : 'ai');
    setFocusSettingKey(setting.key);
  };
  const copyRuntimeSetting = async (setting: RuntimeSetting) => {
    setRuntimeActionErrors(current => ({ ...current, [setting.key]: '' }));
    try {
      const value = setting.secret ? revealedSecrets[setting.key] ?? await fetchSecretValue(setting.key) : setting.value;
      if (!value) throw new Error('empty_setting');
      await navigator.clipboard.writeText(value);
      setCopiedSettingKey(setting.key);
    } catch {
      setRuntimeActionErrors(current => ({ ...current, [setting.key]: 'Không thể sao chép giá trị.' }));
    }
  };
  const deleteRuntimeOverride = (setting: RuntimeSetting) => {
    if (!window.confirm(`Xóa override ứng dụng của ${setting.key}? Giá trị process.env trên host không bị xóa.`)) return;
    setRuntimeActionErrors(current => ({ ...current, [setting.key]: '' }));
    if (setting.secret) {
      setSecretInputs(current => ({ ...current, [setting.key]: '' }));
      setSecretResets(current => ({ ...current, [setting.key]: true }));
    } else {
      setFieldValue(setting.key, '');
    }
    editRuntimeSetting(setting);
  };
  const isSecretConfigured = (key: string) => secretConfigured[key] ?? false;
  const isRuntimeSecretConfigured = (key: string) => runtimeSettings.some(setting => setting.key === key && setting.secret && setting.configured);
  const isSecretResetSaved = (key: string) => {
    const value = draft?.settings[key];
    return typeof value === 'object' && value !== null && value.reset === true;
  };
  const isSecretDraftConfigured = (key: string) => {
    const value = draft?.settings[key];
    return typeof value === 'object' && value !== null && value.configured;
  };

  const saveDraft = async () => {
    setSaveLoading(true);
    setSaveError('');
    setSaveMessage('');
    try {
      const changedKeys = [...allowedKeys].filter(key => secretKeys.has(key)
        ? Boolean(secretInputs[key]) || Boolean(secretResets[key])
        : (values[key] ?? '') !== (baseline[key] ?? ''));
      const settings = Object.fromEntries(changedKeys.map(key => [
        key,
        secretKeys.has(key) ? secretResets[key] ? null : secretInputs[key] : (values[key] ?? '').trim() || null,
      ]));
      const response = await apiCall<{ success: boolean; data: { draft: SettingsDraft } }>('/admin/settings/draft', {
        method: 'PUT', body: JSON.stringify({ expectedVersion: draftVersion, settings }), skipErrorToast: true,
      });
      const savedDraft = response.data.draft;
      setDraft(savedDraft);
      setDraftVersion(savedDraft.version);
      const nextBaseline = { ...values };
      setBaseline(nextBaseline);
      setSecretInputs({});
      setSecretResets({});
      setSecretConfigured(current => {
        const next = { ...current };
        Object.entries(secretInputs).forEach(([key, value]) => { if (secretKeys.has(key) && value.length > 0) next[key] = true; });
        Object.entries(savedDraft.settings).forEach(([key, value]) => { if (secretKeys.has(key) && typeof value === 'object' && value !== null) next[key] = value.configured; });
        return next;
      });
      setSaveMessage(`Đã lưu cấu hình phiên bản ${savedDraft.version}. Cấu hình đang chạy chưa thay đổi; cần áp dụng riêng.`);
    } catch {
      setSaveError('Không thể lưu cấu hình. Có thể cấu hình đã được cập nhật ở nơi khác; hãy tải lại và thử lại.');
    } finally {
      setSaveLoading(false);
    }
  };

  const applySettings = async () => {
    if (!draft || hasUnsavedChanges || !status?.security.encryptedSecretStoreAvailable) return;
    const confirmed = window.confirm('Áp dụng cấu hình đã lưu? Worker sẽ khởi động lại backend LaptopStoreBackend và kiểm tra health/version; thao tác có thể làm gián đoạn yêu cầu đang chạy. Cloudflare Tunnel không bị khởi động lại.');
    if (!confirmed) return;
    setApplyLoading(true);
    setApplyError('');
    setApplyPollingError('');
    setApplyJob(null);
    try {
      const response = await apiCall<{ success: boolean; data: { job: ApplyJob } }>('/admin/settings/apply-jobs', {
        method: 'POST', body: JSON.stringify({ expectedVersion: draftVersion }), skipErrorToast: true,
      });
      setApplyJob(response.data.job);
    } catch {
      setApplyError('Không thể tạo yêu cầu áp dụng. Cấu hình đã lưu vẫn được giữ nguyên; hãy tải lại trạng thái trước khi thử lại.');
    } finally {
      setApplyLoading(false);
    }
  };

  const openSection = (section: SectionKey) => setActiveSection(section);
  const currentSection = sections.find(section => section.id === activeSection) ?? sections[0];
  const CurrentIcon = sectionIcons[currentSection.id];
  const SectionDataField = ({ label, value }: { label: string; value: string | number }) => <DataField label={label} value={value} icon={CurrentIcon} />;
  const storeName = SITE_NAME;
  const supportEmail = t('contact_email_display', 'footer');
  const supportPhone = t('contact_phone_display', 'footer');
  const serviceTone = (configured: boolean, enabled?: boolean): StatusTone => !configured ? 'danger' : enabled === false ? 'warning' : 'good';
  const emailTone = status ? serviceTone(status.email.configured) : 'neutral';
  const paymentTone = status ? !status.payment.configured ? 'danger' : status.payment.mode === 'sandbox' ? 'warning' : 'good' : 'neutral';
  const r2Tone = status ? !status.r2.configurationValid || !status.r2.configured ? 'danger' : !status.r2.uploadEnabled || !status.r2.uploadBudgetConfigured ? 'warning' : 'good' : 'neutral';
  const aiTone = status ? !status.cloudflareAi.allCredentialsConfigured ? 'danger' : !status.cloudflareAi.enabled ? 'warning' : 'good' : 'neutral';
  const cloudflareTone = status ? r2Tone === 'danger' || aiTone === 'danger' ? 'danger' : r2Tone === 'warning' || aiTone === 'warning' || !status.cloudflareOperations.tunnelManaged || !status.cloudflareOperations.dnsManaged ? 'warning' : 'good' : 'neutral';
  const securityReady = Boolean(status?.security.encryptedSecretStoreAvailable);
  const selectedGroups = settingsGroups.filter(group => group.section === activeSection
    && group.title !== 'Mô hình Cloudflare AI'
    && !(activeSection === 'storage' && ['Thông tin công khai R2', 'Thông tin xác thực R2'].includes(group.title)));
  const cloudflareAiAccountIdKey = `CLOUDFLARE_ACCOUNT_ID_${selectedCloudflareAiSlot}`;
  const cloudflareAiApiTokenKey = `CLOUDFLARE_API_TOKEN_${selectedCloudflareAiSlot}`;
  const cloudflareAiModelKey = `CLOUDFLARE_AI_MODEL_${selectedCloudflareAiSlot}`;
  const r2AccountIdKey = r2AccountKey('R2_ACCOUNT_ID', selectedR2AccountSlot);
  const r2AccessKeyIdKey = r2AccountKey('R2_ACCESS_KEY_ID', selectedR2AccountSlot);
  const r2SecretAccessKeyKey = r2AccountKey('R2_SECRET_ACCESS_KEY', selectedR2AccountSlot);
  const r2BucketNameKey = r2AccountKey('R2_BUCKET_NAME', selectedR2AccountSlot);
  const r2PublicBaseUrlKey = r2AccountKey('R2_PUBLIC_BASE_URL', selectedR2AccountSlot);
  const cloudflareAiModelOptions = Array.from(new Set([defaultCloudflareAiModel, ...(status?.cloudflareAi.models ?? []), values[cloudflareAiModelKey] ?? ''].filter(Boolean)));
  const selectedCloudflareAiSlotConfigured = Boolean(values[cloudflareAiAccountIdKey]?.trim() || values[cloudflareAiModelKey]?.trim() || isSecretConfigured(cloudflareAiApiTokenKey));
  const applyInProgress = Boolean(applyJob && ['queued', 'claimed', 'applying', 'rolling-back'].includes(applyJob.status));

  const renderR2RuntimeSettings = () => {
    if (!status) return null;
    const r2Settings = runtimeSettings.filter(setting => setting.group === 'r2');
    const policyValues = [
      { key: 'R2_UPLOAD_ENABLED', value: String(status.r2.uploadEnabled) },
      ...(status.r2.policyValid ? [
        { key: 'R2_MAX_UPLOAD_COUNT', value: String(status.r2.policy.maxAssets) },
        { key: 'R2_MAX_UPLOAD_BYTES', value: String(status.r2.policy.maxBytes) },
        { key: 'R2_MAX_RETRIES', value: String(status.r2.policy.maxRetries) },
      ] : []),
    ].filter(item => !r2Settings.some(setting => setting.key === item.key));

    return <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4"><h3 className="text-lg font-bold text-gray-900">Key-value runtime R2</h3><p className="mt-1 text-sm text-gray-600">Giá trị đang chạy do backend trả về; secret được che mặc định. Khu vực này chỉ hiển thị, không phải bản nháp chờ áp dụng.</p></div>
      {valuesError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Không thể tải key-value runtime. Hãy kiểm tra phiên Super Admin rồi thử làm mới.</p> : valuesLoading ? <p className="text-sm text-gray-500">Đang tải key-value runtime…</p> : r2Settings.length > 0 ? <div className="divide-y divide-gray-100">{r2Settings.map(setting => <div key={setting.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(200px,0.8fr)_minmax(0,1.2fr)] sm:items-center"><code className="break-all text-xs font-semibold text-gray-700">{setting.key}</code>{setting.secret ? <SecretDataField icon={KeyRound} label="Secret runtime" configured={setting.configured} value={revealedSecrets[setting.key]} revealed={Object.hasOwn(revealedSecrets, setting.key)} loading={secretRevealLoading[setting.key] ?? false} error={secretRevealErrors[setting.key] ?? ''} onToggle={() => void toggleSecretReveal(setting.key)} /> : <div className="min-w-0 break-all text-sm text-gray-700">{setting.configured ? setting.value : 'Chưa cấu hình'}{setting.valid === false && <span className="ml-2 text-red-700">Cấu hình không hợp lệ</span>}</div>}</div>)}</div> : <p className="text-sm text-gray-500">Backend chưa trả key R2 nào từ runtime registry.</p>}
      {policyValues.length > 0 && <div className="mt-5 border-t border-gray-100 pt-4"><h4 className="mb-2 text-sm font-semibold text-gray-800">Chính sách tải lên đang chạy</h4><div className="grid gap-3 sm:grid-cols-2">{policyValues.map(item => <SectionDataField key={item.key} label={item.key} value={item.value} />)}</div></div>}
    </section>;
  };

  const renderEditableSettings = (embedded = false) => {
    const Wrapper = embedded ? 'div' : 'section';
    return <Wrapper className={embedded ? 'mt-6 border-t border-gray-100 pt-5' : 'rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6'} aria-labelledby={embedded ? undefined : 'editable-settings-title'}>
      {!embedded && <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div><h3 id="editable-settings-title" className="text-lg font-bold text-gray-900">Cấu hình cần áp dụng</h3><p className="mt-1 text-sm text-gray-600">Các thay đổi được lưu riêng và chỉ có hiệu lực sau khi áp dụng. Cho đến lúc đó, hệ thống tiếp tục dùng cấu hình hiện tại. Secret đang chạy được che mặc định; ô nhập chỉ dùng khi cần thay secret.</p></div>
        <span className="w-fit rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{draft ? `Bản nháp phiên bản ${draft.version}` : 'Chưa có thay đổi đã lưu'}</span>
      </div>}
      {draftLoadError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{draftLoadError}</p>}
      {valuesError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Không thể tải giá trị cài đặt đang chạy. Hãy tải lại trước khi lưu để tránh ghi đè giá trị chưa tải.</p>}
      {settingsSchemaError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Không tải được schema cấu hình được backend cho phép; biểu mẫu bị khóa để tránh gửi sai trường.</p>}
      {activeSection === 'storage' && <section className="mb-6 rounded-lg border border-gray-200 p-4" aria-labelledby="r2-account-manager-title">
        <h4 id="r2-account-manager-title" className="text-sm font-semibold text-gray-900">Tài khoản Cloudflare R2</h4>
        <p className="mt-1 text-xs text-gray-500">Chỉnh một tài khoản mỗi lần. Access key và secret key được lưu trong bản nháp mã hóa; để trống secret để giữ nguyên.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium text-gray-700">Tài khoản
            <select value={selectedR2AccountSlot} disabled={saveLoading || applyInProgress} onChange={event => setSelectedR2AccountSlot(event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100">
              {r2AccountSlots.map(slot => {
                const configured = [
                  r2AccountKey('R2_ACCOUNT_ID', slot), r2AccountKey('R2_BUCKET_NAME', slot),
                ].some(key => Boolean(values[key]?.trim()))
                  || isSecretConfigured(r2AccountKey('R2_ACCESS_KEY_ID', slot))
                  || isSecretConfigured(r2AccountKey('R2_SECRET_ACCESS_KEY', slot));
                return <option key={slot} value={slot}>Tài khoản {slot} · {configured ? 'Đã cấu hình' : 'Trống'}</option>;
              })}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-gray-700">Account ID
            <input type="text" maxLength={32} autoComplete="off" value={values[r2AccountIdKey] ?? ''} disabled={saveLoading || applyInProgress} onChange={event => setFieldValue(r2AccountIdKey, event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 font-mono text-xs text-gray-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" placeholder="32 ký tự hex" />
            <span className="block text-xs font-normal text-gray-500">{getSettingHelpText(r2AccountIdKey)}</span>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-gray-700">Tên bucket
            <input type="text" maxLength={63} value={values[r2BucketNameKey] ?? ''} disabled={saveLoading || applyInProgress} onChange={event => setFieldValue(r2BucketNameKey, event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 font-mono text-xs text-gray-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" />
            <span className="block text-xs font-normal text-gray-500">{getSettingHelpText(r2BucketNameKey)}</span>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-gray-700">URL công khai
            <input type="url" value={values[r2PublicBaseUrlKey] ?? ''} disabled={saveLoading || applyInProgress} onChange={event => setFieldValue(r2PublicBaseUrlKey, event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" placeholder="https://cdn.example.com" />
            <span className="block text-xs font-normal text-gray-500">{getSettingHelpText(r2PublicBaseUrlKey)}</span>
          </label>
          {[{ key: r2AccessKeyIdKey, label: 'Access key ID' }, { key: r2SecretAccessKeyKey, label: 'Secret access key' }].map(({ key, label }) => <div key={key} className="space-y-2">
            <SecretDataField icon={KeyRound} label={`${label} hiện tại`} configured={isRuntimeSecretConfigured(key)} value={revealedSecrets[key]} revealed={Object.hasOwn(revealedSecrets, key)} loading={secretRevealLoading[key] ?? false} error={secretRevealErrors[key] ?? ''} onToggle={() => void toggleSecretReveal(key)} />
            <input type="password" autoComplete="new-password" aria-label={`${label} mới`} value={secretInputs[key] ?? ''} disabled={saveLoading || applyInProgress} onChange={event => {
              setSecretInputs(current => ({ ...current, [key]: event.target.value }));
              setSecretResets(current => ({ ...current, [key]: false }));
            }} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 font-mono text-xs text-gray-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" placeholder={isSecretConfigured(key) ? 'Đã cấu hình — để trống để giữ nguyên' : 'Nhập secret'} />
            <span className="block text-xs font-normal text-gray-500">{getSettingHelpText(key)}</span>
            {isSecretDraftConfigured(key) && <button type="button" disabled={saveLoading || applyInProgress} onClick={() => setSecretResets(current => ({ ...current, [key]: !current[key] }))} className="text-xs font-medium text-red-700 underline disabled:opacity-50">{secretResets[key] ? 'Hủy xóa' : 'Xóa cấu hình quản lý'}</button>}
          </div>)}
        </div>
      </section>}
      {selectedGroups.map(group => (
        <div key={group.title} className="mb-6 last:mb-0">
          <h4 className="mb-2 text-sm font-semibold text-gray-800">{group.title}</h4>
          <div className="divide-y divide-gray-100">
            {group.keys.map(key => {
              const definition = settingsSchema[key];
              if (!definition) return null;
              const secret = definition.secret;
              const isCloudflareCredential = key.startsWith('CLOUDFLARE_ACCOUNT_ID') || key.startsWith('CLOUDFLARE_API_TOKEN');
              const isConfigured = secret ? isSecretConfigured(key) : Boolean(values[key]?.trim());
              if (isCloudflareCredential && !isConfigured) return null;
              const label = fieldLabels[key] ?? (key.startsWith('R2_ACCOUNT_ID') ? 'Mã tài khoản R2' : key.startsWith('R2_BUCKET_NAME') ? 'Tên bucket R2' : key.startsWith('R2_PUBLIC_BASE_URL') ? 'URL công khai R2' : key.startsWith('CLOUDFLARE_AI_MODEL') ? 'Mô hình AI' : key);
              const inputClass = 'h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100';
              const input = secret ? <input id={`settings-${key}`} type="password" autoComplete="new-password" aria-label={`${label} mới`} value={secretInputs[key] ?? ''} disabled={saveLoading || applyInProgress} onChange={event => {
                setSecretInputs(current => ({ ...current, [key]: event.target.value }));
                setSecretResets(current => ({ ...current, [key]: false }));
              }} className={`${inputClass} font-mono text-xs`} placeholder={isConfigured ? 'Đã cấu hình — để trống để giữ nguyên' : 'Nhập secret'} />
                : definition.type === 'enum' || definition.type === 'boolean' ? <select id={`settings-${key}`} aria-label={label} value={values[key] ?? ''} disabled={saveLoading || applyInProgress} onChange={event => setFieldValue(key, event.target.value)} className={inputClass}><option value="">Chọn giá trị</option>{(definition.type === 'boolean' ? ['true', 'false'] : definition.values ?? []).map(value => <option key={value} value={value}>{definition.type === 'boolean' ? value === 'true' ? 'Bật' : 'Tắt' : value}</option>)}</select>
                : <input id={`settings-${key}`} type={definition.type === 'integer' ? 'number' : definition.type === 'url' ? 'url' : 'text'} min={definition.min} max={definition.max} step={definition.type === 'integer' ? 1 : undefined} aria-label={`${label} (${key})`} value={values[key] ?? ''} disabled={saveLoading || applyInProgress} onChange={event => setFieldValue(key, event.target.value)} className={`${inputClass} ${definition.type === 'string' ? 'font-mono text-xs' : ''}`} />;
              return <div key={key} className="grid gap-2 border-t border-gray-100 py-3 first:border-t-0 sm:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.2fr)] sm:items-center">
                <span className="min-w-0"><span className="block text-sm font-medium text-gray-700">{label}</span><code className="break-all text-[11px] text-gray-400">{key}</code></span>
                {secret ? <div className="min-w-0 space-y-2">
                  {valuesLoading ? <p className="text-xs text-gray-500">Đang tải trạng thái secret runtime…</p> : valuesError ? <p role="alert" className="text-xs text-red-700">Không thể xác định trạng thái secret runtime.</p> : <SecretDataField icon={KeyRound} label="Secret runtime hiện tại" configured={isRuntimeSecretConfigured(key)} value={revealedSecrets[key]} revealed={Object.hasOwn(revealedSecrets, key)} loading={secretRevealLoading[key] ?? false} error={secretRevealErrors[key] ?? ''} onToggle={() => void toggleSecretReveal(key)} />}
                  {input}
                  <p className="text-xs leading-5 text-gray-500">{getSettingHelpText(key)}</p>
                  {(secretResets[key] && !isSecretResetSaved(key)) || (!secretResets[key] && isSecretDraftConfigured(key)) ? <button type="button" disabled={saveLoading || applyInProgress} onClick={() => {
                    if (secretResets[key]) {
                      setSecretResets(current => ({ ...current, [key]: false }));
                    } else {
                      setSecretInputs(current => ({ ...current, [key]: '' }));
                      setSecretResets(current => ({ ...current, [key]: true }));
                    }
                  }} className="mt-1 text-xs font-medium text-red-700 underline disabled:opacity-50">{secretResets[key] ? 'Hủy xóa' : 'Xóa cấu hình quản lý'}</button> : null}
                </div> : <div className="min-w-0 space-y-1.5">{input}<p className="text-xs leading-5 text-gray-500">{getSettingHelpText(key)}</p></div>}
              </div>;
            })}
          </div>
        </div>
      ))}
      {embedded && activeSection === 'ai' && <section className="mb-6 rounded-lg border border-gray-200 p-4" aria-labelledby="cloudflare-ai-account-manager-title">
        <h4 id="cloudflare-ai-account-manager-title" className="text-sm font-semibold text-gray-900">Quản lý tài khoản Cloudflare AI</h4>
        <p className="mt-1 text-xs text-gray-500">Chọn slot để thêm hoặc chỉnh sửa. Token được lưu trong cấu hình mã hóa; nếu xóa cấu hình quản lý, biến môi trường trên máy chủ vẫn có thể được sử dụng.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium text-gray-700">Tài khoản
            <select value={selectedCloudflareAiSlot} disabled={saveLoading || applyInProgress} onChange={event => setSelectedCloudflareAiSlot(event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100">
              {cloudflareAiAccountSlots.map(slot => {
                const accountKey = slot === '1' ? 'CLOUDFLARE_ACCOUNT_ID' : `CLOUDFLARE_ACCOUNT_ID_${slot}`;
                const tokenKey = slot === '1' ? 'CLOUDFLARE_API_TOKEN' : `CLOUDFLARE_API_TOKEN_${slot}`;
                const configured = Boolean(values[accountKey]?.trim() || isSecretConfigured(tokenKey));
                return <option key={slot} value={slot}>Tài khoản {slot} · {configured ? 'Đã cấu hình' : 'Trống'}</option>;
              })}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-gray-700" htmlFor="cloudflare-ai-account-id">Account ID
            <input id="cloudflare-ai-account-id" type="text" maxLength={32} autoComplete="off" value={values[cloudflareAiAccountIdKey] ?? ''} disabled={saveLoading || applyInProgress} onChange={event => setFieldValue(cloudflareAiAccountIdKey, event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 font-mono text-xs text-gray-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" placeholder="32 ký tự hex" />
            <span className="block text-xs font-normal text-gray-500">{getSettingHelpText(cloudflareAiAccountIdKey)}</span>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-gray-700" htmlFor="cloudflare-ai-model">Mô hình AI
            <select id="cloudflare-ai-model" value={values[cloudflareAiModelKey] ?? ''} disabled={saveLoading || applyInProgress} onChange={event => setFieldValue(cloudflareAiModelKey, event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100">
              <option value="">Mặc định của Cloudflare AI</option>
              {cloudflareAiModelOptions.map(model => <option key={model} value={model}>{model}</option>)}
            </select>
            <span className="block text-xs font-normal text-gray-500">{getSettingHelpText(cloudflareAiModelKey)}</span>
          </label>
          <div className="space-y-3">
            <SecretDataField icon={KeyRound} label="API token hiện tại" configured={isRuntimeSecretConfigured(cloudflareAiApiTokenKey)} value={revealedSecrets[cloudflareAiApiTokenKey]} revealed={Object.hasOwn(revealedSecrets, cloudflareAiApiTokenKey)} loading={secretRevealLoading[cloudflareAiApiTokenKey] ?? false} error={secretRevealErrors[cloudflareAiApiTokenKey] ?? ''} onToggle={() => void toggleSecretReveal(cloudflareAiApiTokenKey)} />
            <input type="password" autoComplete="new-password" aria-label="API token mới" value={secretInputs[cloudflareAiApiTokenKey] ?? ''} disabled={saveLoading || applyInProgress} onChange={event => {
              setSecretInputs(current => ({ ...current, [cloudflareAiApiTokenKey]: event.target.value }));
              setSecretResets(current => ({ ...current, [cloudflareAiApiTokenKey]: false }));
            }} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 font-mono text-xs outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" placeholder={isSecretConfigured(cloudflareAiApiTokenKey) ? 'Đã cấu hình — để trống để giữ nguyên' : 'Nhập API token'} />
            <p className="text-xs leading-5 text-gray-500">{getSettingHelpText(cloudflareAiApiTokenKey)}</p>
          </div>
        </div>
        {selectedCloudflareAiSlotConfigured && <button type="button" disabled={saveLoading || applyInProgress} onClick={() => {
          if (!window.confirm(`Gỡ cấu hình quản lý của tài khoản ${selectedCloudflareAiSlot}? Biến môi trường trên máy chủ vẫn có thể được sử dụng.`)) return;
          setFieldValue(cloudflareAiAccountIdKey, '');
          setFieldValue(cloudflareAiModelKey, '');
          setSecretInputs(current => ({ ...current, [cloudflareAiApiTokenKey]: '' }));
          setSecretResets(current => ({ ...current, [cloudflareAiApiTokenKey]: true }));
        }} className="mt-4 text-sm font-medium text-red-700 underline disabled:opacity-50">Xóa cấu hình quản lý</button>}
      </section>}
      <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {hasUnsavedChanges ? <StatusBadge tone="warning">Có thay đổi chưa lưu</StatusBadge> : <StatusBadge tone="good">Không có thay đổi chưa lưu</StatusBadge>}
            <span className="text-xs text-gray-500">Lưu cấu hình chưa làm thay đổi hệ thống đang chạy; cần áp dụng riêng.</span>
          </div>
          <button type="button" onClick={() => void saveDraft()} disabled={!securityReady || valuesError || settingsSchemaError || Boolean(draftLoadError) || saveLoading || !hasUnsavedChanges} className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300">{saveLoading ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
        </div>
        {saveError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}
        {saveMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{saveMessage}</p>}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">Worker sẽ khởi động lại backend LaptopStoreBackend để áp dụng và kiểm tra cấu hình; thao tác có thể làm gián đoạn yêu cầu đang chạy. Cloudflare Tunnel không bị khởi động lại.</div>
        {status && !status.security.applyWorkerAvailable && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Worker WinSW chưa hoạt động hoặc chưa được xác minh. Nút áp dụng sẽ bị khóa; không có dịch vụ nào được khởi động lại và cấu hình đã lưu chưa có hiệu lực.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {applyJob && <p role="status" className={`text-sm ${applyJob.status === 'failed' ? 'text-red-700' : applyJob.status === 'succeeded' && applyJob.applied ? 'text-emerald-700' : 'text-amber-800'}`}>
              {applyJob.status === 'unavailable' ? `Worker hiện không khả dụng nên chưa có thay đổi nào được áp dụng.${applyJob.message ? ` ${applyJob.message}` : ''}` : applyJob.status === 'queued' ? 'Yêu cầu áp dụng đang xếp hàng…' : applyJob.status === 'claimed' ? 'Worker đã nhận yêu cầu…' : applyJob.status === 'applying' ? 'Đang áp dụng và khởi động lại dịch vụ…' : applyJob.status === 'rolling-back' ? 'Áp dụng không thành công; đang khôi phục cấu hình trước đó…' : applyJob.status === 'succeeded' ? applyJob.applied ? 'Đã áp dụng cài đặt và kiểm tra phiên bản dịch vụ thành công.' : 'Tác vụ kết thúc nhưng xác nhận chưa áp dụng cài đặt.' : applyJob.status === 'rollback-failed' ? `Không xác minh được khôi phục; cần kiểm tra vận hành.${applyJob.message ? ` ${applyJob.message}` : ''}` : `Áp dụng thất bại.${applyJob.message ? ` ${applyJob.message}` : ''}`}
            </p>}
            {applyPollingError && <p role="alert" className="mt-1 text-sm text-red-700">{applyPollingError}</p>}
            {applyError && <p role="alert" className="mt-1 text-sm text-red-700">{applyError}</p>}
          </div>
          <button type="button" onClick={() => void applySettings()} disabled={!securityReady || !status?.security.applyWorkerAvailable || !draft || Boolean(draftLoadError) || hasUnsavedChanges || applyLoading || applyInProgress} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400">{applyLoading ? 'Đang gửi yêu cầu…' : 'Áp dụng cấu hình'}</button>
        </div>
      </div>
    </Wrapper>;
  };

  return <div className="mx-auto w-full max-w-7xl space-y-7 pb-10">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-3 flex items-center gap-2 text-sm text-gray-500"><span>{text('admin_crumb')}</span><ChevronRight className="h-4 w-4" /><span className="text-gray-800">{text('page_title')}</span></div><h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">{text('page_title')}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{text('page_description')}</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-red-700"><LockKeyhole className="h-3.5 w-3.5" />{text('super_admin')}</span></div>
    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5" role="status"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-amber-900">{text('live_backend_title')}</p><p className="mt-1 text-sm leading-5 text-amber-800">{activeSection === 'payment' ? 'Trạng thái thanh toán lấy từ cấu hình runtime của backend.' : ['email', 'ai'].includes(activeSection) ? <>{text('cloudflare_secret_notice')} Lưu cấu hình và áp dụng là hai thao tác riêng biệt.</> : activeSection === 'storage' ? 'Thông tin R2 bên dưới phản ánh cấu hình runtime đang chạy; secret luôn được che mặc định.' : 'Thông tin đối tác không đồng nghĩa với tích hợp vận hành.'}</p></div><button type="button" onClick={() => void refreshAll()} disabled={isLoading || valuesLoading || hasUnsavedChanges || applyInProgress} aria-label={text('refresh_status')} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /></button></div>
    {loadError && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4" role="alert"><XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" /><div><p className="text-sm font-semibold text-red-900">{text('load_error_title')}</p><p className="mt-1 text-sm text-red-800">{text('load_error_hint')}</p></div></div>}
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label={text('settings_nav_aria')} className="h-fit rounded-xl border border-gray-200 bg-white p-2 shadow-sm">{sections.map(({ id, label }) => { const Icon = sectionIcons[id]; return <button key={id} type="button" onClick={() => openSection(id)} aria-current={activeSection === id ? 'page' : undefined} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors last:mb-0 ${activeSection === id ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}><Icon className={`h-5 w-5 shrink-0 ${activeSection === id ? 'text-red-600' : 'text-gray-500'}`} aria-hidden="true" />{text(label)}{activeSection === id && <ChevronRight className="ml-auto h-4 w-4" />}</button>; })}<div className="mt-3 border-t border-gray-100 px-3 pt-3"><p className="text-xs leading-5 text-gray-500">{text('super_admin_only')}</p></div></nav>
      <div className="min-w-0 space-y-6">
        {activeSection === 'overview' ? <>
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-lg font-bold text-gray-900">{text('status_title')}</h2><p className="mt-1 text-sm text-gray-500">{isLoading ? text('status_loading') : text('status_loaded')}</p></div><span className="text-xs font-medium text-gray-400">{status ? text('updated_at', { date: new Date(status.generatedAt).toLocaleString(INTL_LOCALES[locale]) }) : text('not_loaded')}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatusTile icon={Building2} label={text('branding')} detail={text('active')} tone="good" /><StatusTile icon={Mail} label={text('email')} detail={status ? status.email.configured ? text('configured') : text('email_missing') : text('loading')} tone={emailTone} /><StatusTile icon={CreditCard} label="VNPay" detail={status ? status.payment.configured ? text('credentials_complete') : text('credentials_missing') : text('loading')} tone={paymentTone} /><StatusTile icon={Cloud} label="Cloudflare" detail={status ? status.r2.configured && status.cloudflareAi.allCredentialsConfigured ? text('configured') : text('needs_check') : text('loading')} tone={cloudflareTone} /></div></section>
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-gray-900">{text('runtime_settings_title')}</h2><p className="mt-1 text-sm text-gray-500">{text('runtime_settings_description')}</p></div><div className="flex flex-wrap items-center gap-2">{runtimeSettings.some(setting => setting.restartRequired) && <StatusBadge tone="warning">{text('restart_required')}</StatusBadge>}<span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{text('runtime_settings_count', { count: runtimeSettings.length })}</span></div></div>{valuesError ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{text('runtime_settings_error')}</p> : valuesLoading ? <p className="mt-4 text-sm text-gray-500">{text('loading')}</p> : runtimeSettings.length ? <div className="mt-4 divide-y divide-gray-100">{runtimeSettings.map(setting => {
            const isRevealed = setting.secret ? Object.hasOwn(revealedSecrets, setting.key) : Boolean(revealedRuntimeValues[setting.key]);
            return <div key={setting.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.2fr)] sm:items-center"><code className="break-all text-xs font-semibold text-gray-700">{setting.key}</code><span className="flex min-w-0 items-center gap-2 text-sm text-gray-700"><span className="min-w-0 flex-1 break-all">{setting.secret ? setting.configured ? isRevealed ? revealedSecrets[setting.key] : '••••••••' : 'Chưa cấu hình' : isRevealed ? setting.value : '••••••••'}{setting.configured && setting.valid === false && <span className="ml-2 text-red-700">{text('configuration_invalid')}</span>}</span><button type="button" onClick={() => toggleRuntimeSetting(setting)} disabled={setting.secret && (!setting.configured || secretRevealLoading[setting.key])} aria-label={isRevealed ? `Ẩn ${setting.key}` : `Hiện ${setting.key}`} aria-pressed={isRevealed} title={setting.secret && !setting.configured ? 'Chưa cấu hình' : isRevealed ? 'Ẩn giá trị' : 'Hiện giá trị'} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-wait disabled:opacity-50">{secretRevealLoading[setting.key] ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : isRevealed ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}</button>{secretRevealErrors[setting.key] && <span role="alert" className="text-xs text-red-700">{secretRevealErrors[setting.key]}</span>}<button type="button" onClick={() => editRuntimeSetting(setting)} aria-label={`Sửa ${setting.key}`} title="Sửa" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"><Pencil className="h-4 w-4" aria-hidden="true" /></button><button type="button" onClick={() => void copyRuntimeSetting(setting)} disabled={!setting.configured} aria-label={`Sao chép ${setting.key}`} title={copiedSettingKey === setting.key ? 'Đã sao chép' : 'Sao chép'} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-40"><Copy className="h-4 w-4" aria-hidden="true" /></button><button type="button" onClick={() => deleteRuntimeOverride(setting)} aria-label={`Xóa override ${setting.key}`} title="Xóa override; giữ nguyên process.env" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>{runtimeActionErrors[setting.key] && <span role="alert" className="text-xs text-red-700">{runtimeActionErrors[setting.key]}</span>}{copiedSettingKey === setting.key && <span role="status" className="text-xs text-emerald-700">Đã sao chép</span>}</span></div>;
          })}</div> : <p className="mt-4 text-sm text-gray-500">{text('runtime_settings_empty')}</p>}</section>
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-4"><h2 className="text-lg font-bold text-gray-900">{text('groups_title')}</h2><p className="mt-1 text-sm text-gray-500">{text('groups_description')}</p></div><div className="divide-y divide-gray-100"><OverviewRow icon={Image} title={text('store_name')} description={text('active')} status={text('active')} tone="good" onClick={() => openSection('branding')} /><OverviewRow icon={Mail} title={text('email')} description={status ? status.email.configured ? text('configured') : text('credentials_missing') : text('email_loading')} status={status ? status.email.configured ? text('configured') : text('credentials_missing') : text('loading')} tone={emailTone} onClick={() => openSection('email')} /><OverviewRow icon={CreditCard} title="VNPay" description={status ? status.payment.configured ? text('credentials_complete') : text('credentials_missing') : text('payment_loading')} status={status ? status.payment.configured ? text(status.payment.mode) : text('credentials_missing') : text('loading')} tone={paymentTone} onClick={() => openSection('payment')} /><OverviewRow icon={Cloud} title="Cloudflare R2 & AI" description={status ? `${text('accounts_configured', { count: status.r2.accounts.length })} · ${text('credential_configs', { count: status.cloudflareAi.configuredCount, state: status.cloudflareAi.enabled ? text('enabled_state') : text('disabled_state') })}` : text('cloudflare_loading')} status={status ? status.r2.configured && status.cloudflareAi.allCredentialsConfigured ? text('has_configuration') : text('needs_check') : text('loading')} tone={cloudflareTone} onClick={() => openSection('storage')} /><OverviewRow icon={Truck} title={text('shipping')} description="GHN có adapter hiện tại; provider khác cần tích hợp riêng." status="Mở nhóm" tone="warning" onClick={() => openSection('shipping')} /><OverviewRow icon={Rocket} title={text('deployment')} description="Cloudflare Tunnel đang kết nối; deploy riêng frontend/backend chưa tích hợp." status="Mở nhóm" tone="warning" onClick={() => openSection('deployment')} /><OverviewRow icon={Database} title={text('storage')} description={status ? text('accounts_configured', { count: status.r2.accounts.length }) : text('loading')} status={status?.r2.configured ? text('configured') : text('needs_check')} tone={r2Tone} onClick={() => openSection('storage')} /><OverviewRow icon={Sparkles} title={text('ai')} description={status ? text('credential_configs', { count: status.cloudflareAi.configuredCount, state: status.cloudflareAi.enabled ? text('enabled_state') : text('disabled_state') }) : text('loading')} status={status?.cloudflareAi.allCredentialsConfigured ? text('configured') : text('needs_check')} tone={aiTone} onClick={() => openSection('ai')} /><OverviewRow icon={KeyRound} title={text('security')} description="Bản nháp được lưu trữ an toàn; bí mật không thể đọc lại." status={securityReady ? 'Kho bí mật sẵn sàng' : 'Chưa sẵn sàng'} tone={securityReady ? 'good' : 'warning'} onClick={() => openSection('security')} /></div></section>
        </> : <>
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-100 p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><span className="rounded-lg bg-red-50 p-2.5 text-red-600"><CurrentIcon className="h-5 w-5" /></span><div><h2 className="text-lg font-bold text-gray-900">{text(currentSection.label)}</h2><p className="mt-1 text-sm text-gray-500">{text('section_value_description')}</p></div></div><StatusBadge tone={activeSection === 'payment' ? 'good' : loadError ? 'danger' : isLoading ? 'neutral' : 'warning'}>{loadError ? text('load_failed') : isLoading ? text('loading') : activeSection === 'payment' ? 'Phương thức thanh toán' : activeSection === 'shipping' ? 'Nhà vận chuyển' : activeSection === 'deployment' ? 'Deploy chưa được quản lý tại đây' : ['email', 'storage', 'ai'].includes(activeSection) ? 'Cấu hình dịch vụ' : 'Chỉ xem'}</StatusBadge></div></div>
            <div className="space-y-6 p-5 sm:p-6">
              {activeSection === 'branding' && <><div className="grid gap-4 sm:grid-cols-2"><SectionDataField label={text('store_name')} value={storeName || 'LaptopStore'} /><SectionDataField label={text('support_email')} value={supportEmail} /><SectionDataField label={text('support_phone')} value={supportPhone} /><SectionDataField label={text('website')} value={SITE_URL} /></div><div className="rounded-lg border border-gray-200 bg-gray-50 p-5"><div className="flex flex-wrap items-center gap-4"><img src="/assets/branding/logo-cropped.png" alt={text('logo_alt')} className="h-16 w-auto rounded bg-white object-contain p-2" /><div><p className="text-sm font-semibold text-gray-800">{text('logo_current')}</p><p className="mt-1 text-xs text-gray-500">/assets/branding/logo-cropped.png</p></div></div><p className="mt-3 text-sm text-gray-600">Thông tin thương hiệu đang ở chế độ chỉ xem; không thuộc danh sách cài đặt có thể quản lý.</p></div></>}
              {activeSection === 'email' && status && <><div className="grid gap-4 sm:grid-cols-2"><SectionDataField label={text('provider')} value={status.email.service === 'sendgrid' ? 'SendGrid SMTP' : 'SMTP'} /><SectionDataField label={text('smtp_host')} value={status.email.host} /><SectionDataField label={text('port')} value={status.email.port} /><SectionDataField label={text('tls_secure')} value={status.email.secure ? text('enabled') : text('disabled')} /><SectionDataField label={text('smtp_account')} value={status.email.account} /><SectionDataField label={text('from_address')} value={status.email.from} /><SecretDataField icon={Mail} label={text('smtp_password')} configured={status.email.passwordConfigured} value={revealedSecrets.EMAIL_PASSWORD} revealed={Object.hasOwn(revealedSecrets, 'EMAIL_PASSWORD')} loading={secretRevealLoading.EMAIL_PASSWORD ?? false} error={secretRevealErrors.EMAIL_PASSWORD ?? ''} onToggle={() => void toggleSecretReveal('EMAIL_PASSWORD')} /><SecretDataField icon={Mail} label={text('sendgrid_api_key')} configured={status.email.sendgridKeyConfigured} value={revealedSecrets.SENDGRID_API_KEY} revealed={Object.hasOwn(revealedSecrets, 'SENDGRID_API_KEY')} loading={secretRevealLoading.SENDGRID_API_KEY ?? false} error={secretRevealErrors.SENDGRID_API_KEY ?? ''} onToggle={() => void toggleSecretReveal('SENDGRID_API_KEY')} /></div><ProviderDirectoryManager category="email" entries={providerEntries} loading={providerEntriesLoading} saving={providerSaving} error={providerEntriesError} onCreate={createProviderEntry} onUpdate={updateProviderEntry} onArchive={archiveProviderEntry} onRestore={restoreProviderEntry} /></>}
              {activeSection === 'payment' && <><PaymentMethodsManager methods={paymentMethods} loading={paymentMethodsLoading} error={paymentMethodsError} paymentStatus={status?.payment ?? null} secretValue={revealedSecrets.VNPAY_HASH_SECRET} secretRevealed={Object.hasOwn(revealedSecrets, 'VNPAY_HASH_SECRET')} secretLoading={secretRevealLoading.VNPAY_HASH_SECRET ?? false} secretError={secretRevealErrors.VNPAY_HASH_SECRET ?? ''} onToggleSecret={() => void toggleSecretReveal('VNPAY_HASH_SECRET')} onUpdate={updatePaymentMethod} onDelete={deletePaymentMethod} /><ProviderDirectoryManager category="payment" entries={providerEntries} loading={providerEntriesLoading} saving={providerSaving} error={providerEntriesError} onCreate={createProviderEntry} onUpdate={updateProviderEntry} onArchive={archiveProviderEntry} onRestore={restoreProviderEntry} /></>}
              {activeSection === 'storage' && status && <><div className="rounded-lg border border-gray-200 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">{text('r2_title')}</p><p className="mt-1 text-xs text-gray-500">{status.r2.configurationValid ? text('accounts_configured', { count: status.r2.accounts.length }) : text('account_invalid')}</p></div><StatusBadge tone={r2Tone}>{!status.r2.configurationValid ? text('configuration_invalid') : !status.r2.configured ? text('not_configured') : !status.r2.policyValid ? text('policy_invalid') : status.r2.uploadEnabled ? text('upload_enabled') : text('upload_disabled')}</StatusBadge></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead className="text-xs uppercase text-gray-500"><tr><th className="pb-2 pr-4 font-medium">{text('account_id')}</th><th className="pb-2 pr-4 font-medium">{text('bucket')}</th><th className="pb-2 font-medium">{text('public_base_url')}</th></tr></thead><tbody className="divide-y divide-gray-100">{status.r2.accounts.length > 0 ? status.r2.accounts.map(account => <tr key={account.id}><td className="py-2 pr-4 text-xs text-gray-700">{account.accountId}</td><td className="py-2 pr-4 text-xs text-gray-700">{account.bucket}</td><td className="break-all py-2 text-xs text-gray-700">{account.publicBaseUrl}</td></tr>) : <tr><td colSpan={3} className="py-4 text-sm text-gray-500">{status.r2.configurationValid ? 'Chưa có tài khoản R2 được cấu hình trong runtime.' : 'Không thể đọc tài khoản vì cấu hình R2 không hợp lệ.'}</td></tr>}</tbody></table></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><SectionDataField label={text('upload_policy')} value={status.r2.uploadEnabled ? text('enabled') : text('disabled')} /><SectionDataField label={text('max_files')} value={status.r2.policy.maxAssets} /><SectionDataField label={text('max_bytes')} value={status.r2.policy.maxBytes} /></div></div></>}{activeSection === 'ai' && status && <><div className="rounded-lg border border-gray-200 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">{text('cloudflare_ai_title')}</p><p className="mt-1 text-xs text-gray-500">{text('credential_configs', { count: status.cloudflareAi.configuredCount, state: status.cloudflareAi.enabled ? text('enabled_state') : text('disabled_state') })}</p></div><StatusBadge tone={aiTone}>{status.cloudflareAi.allCredentialsConfigured ? status.cloudflareAi.enabled ? text('ready') : text('disabled') : text('missing_credentials')}</StatusBadge></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><SectionDataField label={text('daily_request_limit')} value={status.cloudflareAi.maxRequestsPerDay} /><SectionDataField label={text('daily_character_limit')} value={status.cloudflareAi.maxInputCharsPerDay} /><div className="space-y-2 sm:col-span-2"><p className="text-sm font-medium text-gray-700">{text('cloudflare_ai_title')}</p>{status.cloudflareAi.models.length ? <div className="grid gap-3 sm:grid-cols-2">{status.cloudflareAi.models.map((model, index) => <SectionDataField key={`${model}-${index}`} label={`Model ${index + 1}`} value={model} />)}</div> : <SectionDataField label={text('cloudflare_ai_title')} value={text('models_missing')} />}</div></div><p className="mt-3 text-xs text-gray-600">Mã thông tin Cloudflare AI được giữ kín và không hiển thị tại đây.</p></div></>}
              {activeSection === 'storage' && renderR2RuntimeSettings()}
              {activeSection === 'storage' && selectedGroups.length > 0 && renderEditableSettings()}
              {activeSection === 'ai' && status && <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-gray-900">Trạng thái Cloudflare AI</h3></div><StatusBadge tone={status.cloudflareAi.enabled ? status.cloudflareAi.allCredentialsConfigured ? 'good' : 'warning' : 'neutral'}>{status.cloudflareAi.enabled ? status.cloudflareAi.allCredentialsConfigured ? 'Đã bật, thông tin xác thực đầy đủ' : 'Đã bật, thiếu thông tin xác thực' : 'Đang tắt'}</StatusBadge></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><SectionDataField label="Số cấu hình tài khoản" value={status.cloudflareAi.configuredCount} /><SectionDataField label="Giới hạn yêu cầu/ngày" value={status.cloudflareAi.maxRequestsPerDay} /><SectionDataField label="Giới hạn ký tự đầu vào/ngày" value={status.cloudflareAi.maxInputCharsPerDay} /><SectionDataField label="Thông tin xác thực đầy đủ" value={status.cloudflareAi.allCredentialsConfigured ? 'Có' : 'Không'} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><h4 className="mb-2 text-sm font-semibold text-gray-800">Mô hình</h4>{status.cloudflareAi.models.length > 0 ? <div className="grid gap-2">{status.cloudflareAi.models.map((model, index) => <SectionDataField key={`${model}-${index}`} label={`Mô hình ${index + 1}`} value={model} />)}</div> : <p className="text-sm text-gray-500">Chưa có mô hình trong cấu hình runtime.</p>}</div><div><h4 className="mb-2 text-sm font-semibold text-gray-800">Account ID</h4>{status.cloudflareAi.accountIds.length > 0 ? <div className="grid gap-2">{status.cloudflareAi.accountIds.map((accountId, index) => <SectionDataField key={`${accountId}-${index}`} label={`Tài khoản ${index + 1}`} value={accountId} />)}</div> : <p className="text-sm text-gray-500">Chưa có tài khoản trong cấu hình runtime.</p>}</div></div>{renderEditableSettings(true)}</section>}
              {activeSection === 'security' && status && <><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><p className="text-sm font-semibold text-emerald-900">{text('secret_never_returned')}</p><p className="mt-1 text-sm leading-5 text-emerald-800">{text('filtered_response_notice')}</p></div></div></div><div className="grid gap-4 sm:grid-cols-2"><SectionDataField label={text('encrypted_secret_store')} value={status.security.encryptedSecretStoreAvailable ? text('ready') : text('not_configured_yet')} /><SectionDataField label="Lưu cấu hình có quản lý" value={status.security.managedDraftAvailable ? text('ready') : text('not_configured_yet')} /><SectionDataField label="Worker áp dụng" value={status.security.applyWorkerAvailable ? text('ready') : 'Không khả dụng — chưa thể áp dụng'} /><SectionDataField label={text('restart_groups_count')} value={status.security.restartRequiredGroups.length} /><SectionDataField label="Ứng dụng tự quản lý Cloudflare Tunnel" value={status.cloudflareOperations.tunnelManaged ? 'Có' : 'Không'} /><SectionDataField label="Ứng dụng tự quản lý Cloudflare DNS" value={status.cloudflareOperations.dnsManaged ? 'Có' : 'Không'} /></div><p className="text-xs text-gray-500">Các giá trị này chỉ cho biết ứng dụng có tự quản lý tunnel/DNS hay không; không phản ánh tunnel có tồn tại hoặc đang chạy hay không.</p><div className="rounded-lg border border-gray-200 p-4"><p className="text-sm font-semibold text-gray-900">{text('restart_groups')}</p><div className="mt-3 flex flex-wrap gap-2">{status.security.restartRequiredGroups.map(group => <span key={group} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{group}</span>)}</div></div></>}
              {(activeSection === 'email' || activeSection === 'payment' || activeSection === 'shipping' || activeSection === 'storage' || activeSection === 'ai' || activeSection === 'security') && !status && !isLoading && <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">{text('empty_data')}</p>}
              {activeSection !== 'storage' && activeSection !== 'shipping' && !(activeSection === 'ai' && status) && selectedGroups.length > 0 && renderEditableSettings()}
              {activeSection === 'storage' && <ProviderDirectoryManager category="storage" entries={providerEntries} loading={providerEntriesLoading} saving={providerSaving} error={providerEntriesError} onCreate={createProviderEntry} onUpdate={updateProviderEntry} onArchive={archiveProviderEntry} onRestore={restoreProviderEntry} />}
              {activeSection === 'shipping' && <>{selectedGroups.length > 0 && <><p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Các trường GHN được lưu trong kho mã hóa và có hiệu lực sau khi backend khởi động lại. API sandbox hiện do cấu hình host/provider quyết định; form không tự chuyển endpoint.</p>{renderEditableSettings()}</>}<section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"><div><h3 className="font-bold text-gray-900">Nhà vận chuyển đang có</h3><p className="mt-1 text-sm text-gray-600">Chỉ GHN hiện có adapter tính phí và tạo vận đơn. Nhà vận chuyển khác chưa được checkout sử dụng.</p></div>{shippingProvidersError && <p role="alert" className="mt-3 text-sm text-red-700">{shippingProvidersError}</p>}{shippingProvidersLoading ? <p className="mt-3 text-sm text-gray-500">Đang tải…</p> : <div className="mt-3 space-y-2">{shippingProviders.map(provider => <div key={provider._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3"><div><p className="font-semibold text-gray-900">{provider.name}</p><p className="text-xs text-gray-500">{provider.code}{provider.description ? ` · ${provider.description}` : ''}</p></div><StatusBadge tone={provider.code === 'ghn' && provider.isActive ? 'good' : provider.code === 'ghn' ? 'neutral' : 'warning'}>{provider.code === 'ghn' ? provider.isActive ? 'Đang bật' : 'Đang tắt' : provider.isActive ? 'Chưa có adapter' : 'Đang tắt'}</StatusBadge>{provider.code === 'ghn' && <button type="button" onClick={() => void toggleShippingProvider(provider)} disabled={shippingProviderActionId === provider._id} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">{shippingProviderActionId === provider._id ? 'Đang lưu…' : provider.isActive ? 'Tắt GHN' : 'Bật GHN'}</button>}</div>)}</div>}</section><ProviderDirectoryManager category="shipping" entries={providerEntries} loading={providerEntriesLoading} saving={providerSaving} error={providerEntriesError} onCreate={createProviderEntry} onUpdate={updateProviderEntry} onArchive={archiveProviderEntry} onRestore={restoreProviderEntry} /></>}
              {activeSection === 'deployment' && <><div className="rounded-lg border border-blue-200 bg-blue-50 p-4"><div><p className="font-semibold text-blue-950">Hai mô hình triển khai được chấp nhận</p><p className="mt-1 text-sm text-blue-900">Có thể phục vụ cả frontend và backend qua Cloudflare Tunnel, hoặc triển khai riêng từng thành phần trên cùng hay khác nền tảng.</p><p className="mt-2 text-xs text-blue-800">Hai mô hình dưới đây chỉ để tham khảo; hiện chưa có adapter để lưu lựa chọn hoặc tự triển khai.</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" disabled aria-pressed={true} className={`rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${true ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-blue-200 bg-white hover:bg-blue-50'}`}><p className="text-sm font-semibold text-gray-900">Frontend + backend qua Tunnel</p><p className="mt-1 text-sm text-gray-600">Cloudflare Tunnel kết nối/định tuyến tới cả hai thành phần; đây là mô hình đang sử dụng.</p></button><button type="button" disabled aria-pressed={false} className={`rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${false ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-blue-200 bg-white hover:bg-blue-50'}`}><p className="text-sm font-semibold text-gray-900">Triển khai frontend/backend riêng</p><p className="mt-1 text-sm text-gray-600">Mỗi thành phần có thể chọn cùng hoặc khác nền tảng triển khai.</p></button></div><p className="mt-3 text-xs text-blue-800">Lựa chọn này chỉ cập nhật giao diện; chưa được lưu vào cấu hình và không tự thay đổi hoặc triển khai hạ tầng. Cloudflare Tunnel là lớp kết nối, không thay thế nơi chạy ứng dụng.</p></div><ProviderDirectoryManager category="deployment" entries={providerEntries} loading={providerEntriesLoading} saving={providerSaving} error={providerEntriesError} onCreate={createProviderEntry} onUpdate={updateProviderEntry} onArchive={archiveProviderEntry} onRestore={restoreProviderEntry} /></>}
            </div>
          </section>
        </>}
        <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><p className="text-sm leading-5 text-gray-600"><span className="font-semibold text-gray-800">{text('status_color_legend')}</span> {text('status_color_description')}</p></div>
      </div>
    </div>
  </div>;
}

function ProviderDirectoryManager({ category, entries, loading, saving, error, onCreate, onUpdate, onArchive, onRestore }: {
  category: ProviderCategory;
  entries: ProviderDirectoryEntry[];
  loading: boolean;
  saving: boolean;
  error: string;
  onCreate: (input: Omit<ProviderDirectoryEntry, 'id' | 'isDeleted' | 'isConnected' | 'isOperational'>) => Promise<boolean>;
  onUpdate: (id: string, updates: { name: string; description: string; managementUrl: string; details: Array<{ label: string; value: string }> }) => Promise<boolean>;
  onArchive: (entry: ProviderDirectoryEntry) => Promise<void>;
  onRestore: (entry: ProviderDirectoryEntry) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState('');
  const [selectedValue, setSelectedValue] = useState('');
  const [form, setForm] = useState({ code: '', name: '', description: '', managementUrl: '', details: [] as Array<{ label: string; value: string }> });
  const categoryEntries = entries.filter(entry => entry.category === category);
  const presets = providerPresets[category] ?? [];
  const selectedPreset = presets.find(preset => selectedValue === `preset:${preset.code}`);
  const selectedEntry = categoryEntries.find(entry => selectedValue === `entry:${entry.id}`);
  const selectedProvider = selectedPreset ?? selectedEntry;
  const selectedDetails = selectedEntry?.details ?? [];
  const categoryLabel = category === 'payment' ? 'đối tác thanh toán' : category === 'shipping' ? 'nhà vận chuyển' : category === 'deployment' ? 'nền tảng triển khai' : category === 'storage' ? 'nhà cung cấp lưu trữ' : category === 'email' ? 'nhà cung cấp email' : 'đối tác';
  const managementUrl = (() => {
    const value = selectedProvider?.managementUrl;
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url : null;
    } catch {
      return null;
    }
  })();
  const resetForm = () => {
    setEditingId('');
    setForm({ code: '', name: '', description: '', managementUrl: '', details: [] });
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const details = form.details.filter(detail => detail.label.trim() && detail.value.trim());
    const saved = editingId
      ? await onUpdate(editingId, { name: form.name, description: form.description, managementUrl: form.managementUrl, details })
      : await onCreate({ category, code: form.code, name: form.name, description: form.description, managementUrl: form.managementUrl, details });
    if (saved) resetForm();
  };

  return <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
    <div><h3 className="font-bold text-gray-900">Danh sách đối tác</h3><p className="mt-1 text-sm text-gray-600">Mục được thêm ở đây chỉ là hồ sơ tham khảo; chọn đối tác không bật tích hợp nghiệp vụ khi chưa có adapter tương ứng.</p></div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <label className="block space-y-1 text-sm font-medium text-gray-700"><span>Chọn {categoryLabel}</span><select value={selectedValue} disabled={loading && presets.length === 0 && categoryEntries.length === 0} onChange={event => setSelectedValue(event.target.value)} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm disabled:bg-gray-100"><option value="">{`Chọn ${categoryLabel}`}</option>{presets.length > 0 && <optgroup label="Đang tích hợp">{presets.map(preset => <option key={preset.code} value={`preset:${preset.code}`}>{preset.name}</option>)}</optgroup>}{categoryEntries.length > 0 && <optgroup label="Thông tin tham khảo — chưa kết nối">{categoryEntries.map(entry => <option key={entry.id} value={`entry:${entry.id}`}>{entry.name} · {entry.code}{entry.isDeleted ? ' (Đã ẩn)' : ''}</option>)}</optgroup>}</select></label>
    {selectedProvider && <div className={`rounded-lg border p-4 ${selectedEntry?.isDeleted ? 'border-gray-200 bg-gray-50' : 'border-gray-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold text-gray-900">{selectedProvider.name}</h4><StatusBadge tone={selectedPreset ? 'good' : 'neutral'}>{selectedPreset?.statusLabel ?? 'Chưa kết nối'}</StatusBadge>{selectedEntry?.isDeleted && <StatusBadge tone="neutral">Đã ẩn</StatusBadge>}</div><p className="mt-1 text-sm text-gray-600">{selectedProvider.description || 'Chưa có mô tả'}</p><p className="mt-1 text-xs text-gray-400">Mã nội bộ: {selectedProvider.code}</p>{managementUrl && <p className="mt-2 break-all text-xs text-gray-500">Trang đối tác: {managementUrl.host}</p>}{selectedDetails.length > 0 && <dl className="mt-3 grid gap-2 sm:grid-cols-2">{selectedDetails.map((detail, index) => <div key={`${detail.label}-${index}`} className="min-w-0"><dt className="text-xs font-medium text-gray-500">{detail.label}</dt><dd className="break-all text-sm text-gray-800">{detail.value}</dd></div>)}</dl>}</div>
        <div className="flex flex-wrap gap-2">{managementUrl && !selectedEntry?.isDeleted && <a href={managementUrl.href} target="_blank" rel="noopener noreferrer" onClick={event => { if (!window.confirm(`Mở trang bên ngoài ${managementUrl.host}? Bạn sẽ tự đăng nhập trực tiếp với đối tác.`)) event.preventDefault(); }} className="inline-flex h-9 items-center rounded-lg border border-blue-200 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">{category === 'deployment' ? 'Đăng nhập quản lý' : 'Mở trang đối tác'}</a>}{selectedEntry && (selectedEntry.isDeleted ? <button type="button" onClick={() => void onRestore(selectedEntry)} className="rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">Khôi phục</button> : <><button type="button" onClick={() => { setEditingId(selectedEntry.id); setForm({ code: selectedEntry.code, name: selectedEntry.name, description: selectedEntry.description, managementUrl: selectedEntry.managementUrl, details: selectedEntry.details ?? [] }); }} className="rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">Sửa</button><button type="button" onClick={() => void onArchive(selectedEntry)} className="rounded-lg border border-red-200 px-3 text-sm font-semibold text-gray-700 hover:bg-red-50">Ẩn</button></>)}</div>
      </div>
    </div>}
    <form onSubmit={submit} className="grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2">
      <label className="space-y-1 text-sm font-medium text-gray-700"><span>Mã định danh nội bộ</span><input required minLength={2} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9-]+" value={form.code} disabled={Boolean(editingId) || saving} onChange={event => setForm(current => ({ ...current, code: event.target.value }))} placeholder="ví dụ: ghn, vnpay, sendgrid" className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm disabled:bg-gray-100" /><span className="block text-xs font-normal text-gray-500">Tự đặt mã riêng, duy nhất trong nhóm này; không có một mã chung cho mọi nền tảng.</span></label>
      <label className="space-y-1 text-sm font-medium text-gray-700"><span>Tên đối tác</span><input required minLength={2} maxLength={80} value={form.name} disabled={saving} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Tên hiển thị" className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" /></label>
      <label className="space-y-1 text-sm font-medium text-gray-700 sm:col-span-2"><span>Mô tả</span><input maxLength={500} value={form.description} disabled={saving} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="Thông tin ngắn về đối tác" className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" /></label>
      <label className="space-y-1 text-sm font-medium text-gray-700 sm:col-span-2"><span>Trang quản lý chính thức (HTTPS, không bắt buộc)</span><input type="url" pattern="https://.*" maxLength={500} value={form.managementUrl} disabled={saving} onChange={event => setForm(current => ({ ...current, managementUrl: event.target.value }))} placeholder="https://partner.example.com" className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" /></label>
      <div className="space-y-3 sm:col-span-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-gray-800">Thông tin riêng của đối tác</p><p className="text-xs text-gray-500">Tùy nền tảng, thêm mục như mã cửa hàng, khu vực, phiên bản API hoặc tài khoản dự án. Không nhập mật khẩu, API key hay secret tại đây.</p></div><button type="button" disabled={saving} onClick={() => setForm(current => ({ ...current, details: [...current.details, { label: '', value: '' }] }))} className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">Thêm thông tin</button></div>{form.details.map((detail, index) => <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]"><label className="space-y-1 text-sm font-medium text-gray-700"><span>Tên thông tin</span><input required maxLength={80} value={detail.label} disabled={saving} onChange={event => setForm(current => ({ ...current, details: current.details.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) }))} placeholder={category === 'shipping' ? 'Mã khách hàng / khu vực' : category === 'payment' ? 'Mã đơn vị / môi trường' : category === 'storage' ? 'Region / tên bucket' : category === 'deployment' ? 'Project / môi trường' : 'Tài khoản / phiên bản API'} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" /></label><label className="space-y-1 text-sm font-medium text-gray-700"><span>Giá trị</span><input required maxLength={500} value={detail.value} disabled={saving} onChange={event => setForm(current => ({ ...current, details: current.details.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) }))} placeholder="Giá trị riêng của đối tác" className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" /></label><button type="button" disabled={saving} onClick={() => setForm(current => ({ ...current, details: current.details.filter((_, itemIndex) => itemIndex !== index) }))} className="h-10 self-end rounded-lg border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50">Xóa mục</button></div>)}</div>
      <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{saving ? 'Đang lưu…' : editingId ? 'Lưu thay đổi' : 'Thêm đối tác'}</button>{editingId && <button type="button" disabled={saving} onClick={resetForm} className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700">Hủy</button>}</div>
    </form>
  </section>;
}

function PaymentMethodsManager({ methods, loading, error, paymentStatus, secretValue, secretRevealed, secretLoading, secretError, onToggleSecret, onUpdate, onDelete }: {
  methods: AdminPaymentMethod[];
  loading: boolean;
  error: string;
  paymentStatus: SettingsStatus['payment'] | null;
  secretValue?: string;
  secretRevealed: boolean;
  secretLoading: boolean;
  secretError: string;
  onToggleSecret: () => void;
  onUpdate: (code: AdminPaymentMethod['code'], updates: Partial<Pick<AdminPaymentMethod, 'name' | 'description' | 'isEnabled' | 'isDeleted'>>) => Promise<boolean>;
  onDelete: (code: AdminPaymentMethod['code']) => Promise<void>;
}) {
  const [editingCode, setEditingCode] = useState<AdminPaymentMethod['code'] | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });

  const beginEdit = (method: AdminPaymentMethod) => {
    setEditingCode(method.code);
    setForm({ name: method.name, description: method.description });
  };

  const statusLabel = (method: AdminPaymentMethod) => method.isDeleted
    ? 'Đã ẩn'
    : !method.isEnabled
      ? 'Đang tắt'
      : method.code === 'vnpay' && !method.available
        ? 'Thiếu cấu hình cổng'
        : 'Đang hoạt động';
  const statusTone = (method: AdminPaymentMethod): StatusTone => method.isDeleted || !method.isEnabled
    ? 'neutral'
    : method.code === 'vnpay' && !method.available
      ? 'warning'
      : 'good';

  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading ? <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">Đang tải phương thức thanh toán…</p> : methods.length === 0 ? <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">Chưa có phương thức thanh toán.</p> : methods.map(method => <section key={method.code} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="flex min-w-0 items-start gap-3"><span className={`rounded-lg p-2.5 ${method.code === 'vnpay' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}><CreditCard className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-gray-900">{method.name}</h3><StatusBadge tone={statusTone(method)}>{statusLabel(method)}</StatusBadge></div><p className="mt-1 text-sm text-gray-600">{method.description}</p><p className="mt-1 text-xs text-gray-400">Mã phương thức: {method.code}</p></div></div><div className="flex flex-wrap items-center gap-2 sm:justify-end"><label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={method.isEnabled && !method.isDeleted} disabled={method.isDeleted || loading} onChange={event => void onUpdate(method.code, { isEnabled: event.target.checked })} className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />Hiển thị ở checkout</label><button type="button" onClick={() => beginEdit(method)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"><Pencil className="h-4 w-4" aria-hidden="true" />Sửa</button>{method.isDeleted ? <button type="button" onClick={() => void onUpdate(method.code, { isDeleted: false })} className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">Khôi phục</button> : <button type="button" onClick={() => void onDelete(method.code)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" aria-hidden="true" />Xóa</button>}</div></div>{editingCode === method.code && <form onSubmit={event => { event.preventDefault(); void onUpdate(method.code, form).then(updated => { if (updated) setEditingCode(null); }); }} className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-2"><label className="block text-sm font-medium text-gray-700">Tên hiển thị<input required minLength={2} maxLength={80} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" /></label><label className="block text-sm font-medium text-gray-700">Mô tả<input maxLength={240} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" /></label><div className="flex gap-2 sm:col-span-2"><button type="submit" className="inline-flex h-9 items-center rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700">Lưu</button><button type="button" onClick={() => setEditingCode(null)} className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">Hủy</button></div></form>}{method.code === 'vnpay' && paymentStatus && <div className="mt-4 grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2"><DataField icon={CreditCard} label="Môi trường" value={paymentStatus.mode} /><DataField icon={CreditCard} label="Mã merchant" value={paymentStatus.merchantCode} /><DataField icon={CreditCard} label="Endpoint" value={paymentStatus.endpoint} /><DataField icon={CreditCard} label="Return URL" value={paymentStatus.returnUrl} /><DataField icon={CreditCard} label="Callback URL" value={paymentStatus.callbackUrl} /><SecretDataField icon={CreditCard} label="Khóa bí mật VNPay" configured={paymentStatus.secretConfigured} value={secretValue} revealed={secretRevealed} loading={secretLoading} error={secretError} onToggle={onToggleSecret} /></div>}</section>)}
  </div>;
}

function StatusTile({ icon: Icon, label, detail, tone }: { icon: React.ElementType; label: string; detail: string; tone: StatusTone }) {
  const iconTone = tone === 'good' ? 'bg-emerald-50 text-emerald-600' : tone === 'warning' ? 'bg-amber-50 text-amber-600' : tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500';
  const textTone = tone === 'good' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : tone === 'danger' ? 'text-red-700' : 'text-gray-500';
  return <div className="rounded-lg border border-gray-200 p-4"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-gray-800">{label}</span><span className={`rounded-md p-1.5 ${iconTone}`}><Icon className="h-4 w-4" /></span></div><p className={`mt-3 text-sm font-medium ${textTone}`}>{detail}</p></div>;
}

function OverviewRow({ icon: Icon, title, description, status, tone, onClick }: { icon: React.ElementType; title: string; description: string; status: string; tone: StatusTone; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 py-4 text-left first:pt-1 last:pb-1"><span className="rounded-lg bg-gray-100 p-2.5 text-gray-500 transition-colors group-hover:bg-red-50 group-hover:text-red-600"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-gray-900">{title}</span><span className="mt-1 block truncate text-xs text-gray-500">{description}</span></span><StatusBadge tone={tone}>{status}</StatusBadge><ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-red-600" /></button>;
}

export default withAdminMeta(SettingsPage, { permission: 'super-admin', featureName: 'Cài đặt hệ thống' });
