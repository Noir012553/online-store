import { useEffect, useMemo, useState } from 'react';
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

type SectionKey = 'overview' | 'branding' | 'email' | 'payment' | 'cloudflare' | 'security';
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
type DraftSetting = string | { configured: boolean };
type SettingsDraft = { version: number; settings: Record<string, DraftSetting> };
type ApplyJob = {
  id: string;
  status: 'unavailable' | 'queued' | 'running' | 'succeeded' | 'failed';
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
    maxInputCharsPerDay: number; models: string[]; accountIds: string[]; allCredentialsConfigured: boolean;
  };
  cloudflareOperations: { tunnelManaged: boolean; dnsManaged: boolean };
  security: {
    encryptedSecretStoreAvailable: boolean; managedOverridesAvailable: boolean;
    managedDraftAvailable: boolean; applyWorkerAvailable: boolean; restartRequiredGroups: string[];
  };
};
type SettingsGroup = { section: 'email' | 'payment' | 'cloudflare'; title: string; keys: string[] };

const r2NumberedKeys = (base: string) => [base, ...Array.from({ length: 8 }, (_, index) => `${base}_${index + 2}`)];
const aiModelKeys = ['CLOUDFLARE_AI_MODEL', ...Array.from({ length: 13 }, (_, index) => `CLOUDFLARE_AI_MODEL_${index + 1}`)];

// Keep this list explicit and in sync with the backend managed-draft allowlist.
const settingsGroups: SettingsGroup[] = [
  { section: 'email', title: 'Email', keys: ['EMAIL_SERVICE', 'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_SECURE', 'EMAIL_USER', 'EMAIL_FROM', 'EMAIL_PASSWORD', 'SENDGRID_API_KEY'] },
  { section: 'payment', title: 'VNPay', keys: ['VNPAY_ENDPOINT', 'VNPAY_TMN_CODE', 'VNPAY_RETURN_URL', 'VNPAY_CALLBACK_URL', 'VNPAY_HASH_SECRET'] },
  { section: 'cloudflare', title: 'Chính sách tải lên R2', keys: ['R2_UPLOAD_ENABLED', 'R2_MAX_UPLOAD_COUNT', 'R2_MAX_UPLOAD_BYTES', 'R2_MAX_RETRIES', 'R2_MAX_IMAGE_BYTES', 'R2_MAX_VIDEO_BYTES'] },
  { section: 'cloudflare', title: 'Thông tin công khai R2', keys: [...r2NumberedKeys('R2_ACCOUNT_ID'), ...r2NumberedKeys('R2_BUCKET_NAME'), ...r2NumberedKeys('R2_PUBLIC_BASE_URL')] },
  { section: 'cloudflare', title: 'Chính sách Cloudflare AI', keys: ['CLOUDFLARE_AI_ENABLED', 'CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY', 'CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY', 'CLOUDFLARE_AI_MAX_TOKENS', 'CLOUDFLARE_RATE_LIMIT_COOLDOWN_MS', 'CLOUDFLARE_MAX_RATE_LIMIT_COOLDOWN_MS', 'CLOUDFLARE_COOLDOWN_WAIT_BUDGET_MS', 'CLOUDFLARE_MAX_PARALLEL_PER_KEY', 'CLOUDFLARE_MAX_REQUESTS_PER_SEC', 'CLOUDFLARE_MAX_PARALLEL_REQUESTS'] },
  { section: 'cloudflare', title: 'Mô hình Cloudflare AI', keys: aiModelKeys },
];
const allowedKeys = new Set(settingsGroups.flatMap(group => group.keys));
const secretKeys = new Set(['EMAIL_PASSWORD', 'SENDGRID_API_KEY', 'VNPAY_HASH_SECRET']);
const fieldLabels: Record<string, string> = {
  EMAIL_SERVICE: 'Nhà cung cấp email', EMAIL_HOST: 'Máy chủ SMTP', EMAIL_PORT: 'Cổng SMTP', EMAIL_SECURE: 'Kết nối TLS an toàn',
  EMAIL_USER: 'Tài khoản email', EMAIL_FROM: 'Địa chỉ người gửi', EMAIL_PASSWORD: 'Mật khẩu email', SENDGRID_API_KEY: 'Khóa API SendGrid',
  VNPAY_ENDPOINT: 'Địa chỉ cổng thanh toán', VNPAY_TMN_CODE: 'Mã đơn vị VNPay', VNPAY_RETURN_URL: 'URL quay về',
  VNPAY_CALLBACK_URL: 'URL nhận thông báo', VNPAY_HASH_SECRET: 'Khóa bí mật VNPay', R2_UPLOAD_ENABLED: 'Bật tải lên',
  R2_MAX_UPLOAD_COUNT: 'Số tệp tối đa', R2_MAX_UPLOAD_BYTES: 'Dung lượng tối đa', R2_MAX_RETRIES: 'Số lần thử lại',
  R2_MAX_IMAGE_BYTES: 'Dung lượng ảnh tối đa', R2_MAX_VIDEO_BYTES: 'Dung lượng video tối đa', CLOUDFLARE_AI_ENABLED: 'Bật Cloudflare AI',
  CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY: 'Số yêu cầu tối đa mỗi ngày', CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY: 'Số ký tự đầu vào tối đa mỗi ngày',
  CLOUDFLARE_AI_MAX_TOKENS: 'Số token tối đa', CLOUDFLARE_RATE_LIMIT_COOLDOWN_MS: 'Thời gian chờ giới hạn tốc độ (ms)',
  CLOUDFLARE_MAX_RATE_LIMIT_COOLDOWN_MS: 'Thời gian chờ giới hạn tối đa (ms)', CLOUDFLARE_COOLDOWN_WAIT_BUDGET_MS: 'Ngân sách thời gian chờ (ms)',
  CLOUDFLARE_MAX_PARALLEL_PER_KEY: 'Số yêu cầu đồng thời tối đa mỗi khóa', CLOUDFLARE_MAX_REQUESTS_PER_SEC: 'Số yêu cầu tối đa mỗi giây',
  CLOUDFLARE_MAX_PARALLEL_REQUESTS: 'Số yêu cầu đồng thời tối đa', CLOUDFLARE_AI_MODEL: 'Mô hình AI',
};

const sections = [
  { id: 'overview', label: 'overview', icon: Globe2 },
  { id: 'branding', label: 'branding', icon: Building2 },
  { id: 'email', label: 'email', icon: Mail },
  { id: 'payment', label: 'payment', icon: CreditCard },
  { id: 'cloudflare', label: 'cloudflare', icon: Cloud },
  { id: 'security', label: 'security', icon: ShieldCheck },
] as const;

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

function DataField({ label, value }: { label: string; value: string | number }) {
  return <div className="block space-y-2"><span className="text-sm font-medium text-gray-700">{label}</span><div className="min-h-11 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm text-gray-700">{value || '—'}</div></div>;
}

function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSetting[]>([]);
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

  const loadRuntimeSettings = async () => {
    setValuesLoading(true);
    setValuesError(false);
    try {
      const response = await apiCall<{ success: boolean; data: { settings: RuntimeSetting[] } }>('/admin/settings/values', { skipCache: true, skipErrorToast: true });
      setRuntimeSettings(response.data.settings);
      return response.data.settings;
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

  const loadDraft = async (liveSettings: RuntimeSetting[]) => {
    setDraftLoadError('');
    try {
      const response = await apiCall<{ success: boolean; data: { draft: SettingsDraft | null } }>('/admin/settings/draft', { skipCache: true, skipErrorToast: true });
      const loadedDraft = response.data.draft;
      const liveValues: Record<string, string> = {};
      const configuredSecrets: Record<string, boolean> = {};
      liveSettings.forEach(setting => {
        if (!allowedKeys.has(setting.key)) return;
        if (setting.secret && secretKeys.has(setting.key)) configuredSecrets[setting.key] = setting.configured;
        else if (!setting.secret && !secretKeys.has(setting.key)) liveValues[setting.key] = setting.value;
      });
      if (loadedDraft) {
        Object.entries(loadedDraft.settings).forEach(([key, value]) => {
          if (!allowedKeys.has(key)) return;
          if (secretKeys.has(key)) {
            if (typeof value === 'object' && value !== null) configuredSecrets[key] = value.configured;
          } else if (typeof value === 'string') {
            liveValues[key] = value;
          }
        });
      }
      setDraft(loadedDraft);
      setDraftVersion(loadedDraft?.version ?? 0);
      setValues(liveValues);
      setBaseline(liveValues);
      setSecretInputs({});
      setSecretConfigured(configuredSecrets);
    } catch {
      setDraftLoadError('Không thể tải bản nháp cài đặt. Vui lòng thử làm mới trang.');
    }
  };

  const refreshAll = async () => {
    const [liveSettings] = await Promise.all([loadRuntimeSettings(), loadStatus()]);
    await loadDraft(liveSettings);
  };

  useEffect(() => {
    void refreshAll();
    void loadNamespace('footer');
    void loadNamespace('admin-settings');
  }, [loadNamespace]);

  const hasUnsavedChanges = useMemo(() => (
    Object.keys(values).some(key => (values[key] ?? '') !== (baseline[key] ?? ''))
    || Object.values(secretInputs).some(value => value.length > 0)
  ), [values, baseline, secretInputs]);

  useEffect(() => {
    if (!applyJob || (applyJob.status !== 'queued' && applyJob.status !== 'running')) return;
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
  const isSecretConfigured = (key: string) => secretConfigured[key] ?? false;

  const saveDraft = async () => {
    setSaveLoading(true);
    setSaveError('');
    setSaveMessage('');
    try {
      const changedKeys = [...allowedKeys].filter(key => secretKeys.has(key)
        ? Boolean(secretInputs[key])
        : (values[key] ?? '') !== (baseline[key] ?? ''));
      if (changedKeys.some(key => !secretKeys.has(key) && !(values[key] ?? '').trim())) {
        setSaveError('Không thể lưu giá trị trống. Hãy khôi phục giá trị hoặc nhập giá trị mới.');
        return;
      }
      const settings = Object.fromEntries(changedKeys.map(key => [key, secretKeys.has(key) ? secretInputs[key] : values[key]]));
      const response = await apiCall<{ success: boolean; data: { draft: SettingsDraft } }>('/admin/settings/draft', {
        method: 'PUT', body: JSON.stringify({ expectedVersion: draftVersion, settings }), skipErrorToast: true,
      });
      const savedDraft = response.data.draft;
      setDraft(savedDraft);
      setDraftVersion(savedDraft.version);
      const nextBaseline = { ...values };
      setBaseline(nextBaseline);
      setSecretInputs({});
      setSecretConfigured(current => {
        const next = { ...current };
        Object.entries(secretInputs).forEach(([key, value]) => { if (secretKeys.has(key) && value.length > 0) next[key] = true; });
        Object.entries(savedDraft.settings).forEach(([key, value]) => { if (secretKeys.has(key) && typeof value === 'object') next[key] = value.configured; });
        return next;
      });
      setSaveMessage(`Đã lưu bản nháp phiên bản ${savedDraft.version}. Cài đặt chưa được áp dụng.`);
    } catch {
      setSaveError('Không thể lưu bản nháp. Có thể bản nháp đã được cập nhật ở nơi khác; hãy tải lại và thử lại.');
    } finally {
      setSaveLoading(false);
    }
  };

  const applySettings = async () => {
    if (!draft || hasUnsavedChanges || !status?.security.encryptedSecretStoreAvailable) return;
    const confirmed = window.confirm('Áp dụng bản nháp cài đặt đã lưu? Quá trình áp dụng có thể yêu cầu khởi động lại dịch vụ. Thao tác này không khởi động lại dịch vụ tự động.');
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
      setApplyError('Không thể tạo yêu cầu áp dụng. Bản nháp vẫn được giữ nguyên; hãy tải lại trạng thái trước khi thử lại.');
    } finally {
      setApplyLoading(false);
    }
  };

  const openSection = (section: SectionKey) => setActiveSection(section);
  const currentSection = sections.find(section => section.id === activeSection) ?? sections[0];
  const CurrentIcon = currentSection.icon;
  const storeName = SITE_NAME;
  const supportEmail = 'noir002534@gmail.com';
  const supportPhone = t('contact_phone_display', 'footer');
  const serviceTone = (configured: boolean, enabled?: boolean): StatusTone => !configured ? 'danger' : enabled === false ? 'warning' : 'good';
  const emailTone = status ? serviceTone(status.email.configured) : 'neutral';
  const paymentTone = status ? !status.payment.configured ? 'danger' : status.payment.mode === 'sandbox' ? 'warning' : 'good' : 'neutral';
  const r2Tone = status ? !status.r2.configurationValid || !status.r2.configured ? 'danger' : !status.r2.uploadEnabled || !status.r2.uploadBudgetConfigured ? 'warning' : 'good' : 'neutral';
  const aiTone = status ? !status.cloudflareAi.allCredentialsConfigured ? 'danger' : !status.cloudflareAi.enabled ? 'warning' : 'good' : 'neutral';
  const cloudflareTone = status ? r2Tone === 'danger' || aiTone === 'danger' ? 'danger' : r2Tone === 'warning' || aiTone === 'warning' || !status.cloudflareOperations.tunnelManaged || !status.cloudflareOperations.dnsManaged ? 'warning' : 'good' : 'neutral';
  const securityReady = Boolean(status?.security.encryptedSecretStoreAvailable);
  const selectedGroups = settingsGroups.filter(group => group.section === activeSection);

  const renderEditableSettings = () => (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="editable-settings-title">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div><h3 id="editable-settings-title" className="text-lg font-bold text-gray-900">Bản nháp cài đặt</h3><p className="mt-1 text-sm text-gray-600">Giá trị nháp được ưu tiên trên giá trị đang chạy. Bí mật chỉ có thể thay mới; giá trị hiện tại không được hiển thị.</p></div>
        <span className="w-fit rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{draft ? `Phiên bản ${draft.version}` : 'Chưa có bản nháp'}</span>
      </div>
      {!securityReady && <p role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Kho bí mật được mã hóa chưa khả dụng. Không thể lưu hoặc áp dụng bản nháp.</p>}
      {draftLoadError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{draftLoadError}</p>}
      {valuesError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Không thể tải giá trị cài đặt đang chạy. Hãy tải lại trước khi lưu để tránh ghi đè giá trị chưa tải.</p>}
      {selectedGroups.map(group => (
        <div key={group.title} className="mb-6 last:mb-0">
          <h4 className="mb-2 text-sm font-semibold text-gray-800">{group.title}</h4>
          <div className="divide-y divide-gray-100">
            {group.keys.map(key => {
              const secret = secretKeys.has(key);
              const label = fieldLabels[key] ?? (key.startsWith('R2_ACCOUNT_ID') ? 'Mã tài khoản R2' : key.startsWith('R2_BUCKET_NAME') ? 'Tên bucket R2' : key.startsWith('R2_PUBLIC_BASE_URL') ? 'URL công khai R2' : key.startsWith('CLOUDFLARE_AI_MODEL') ? 'Mô hình AI' : key);
              return <label key={key} className="grid gap-2 border-t border-gray-100 py-3 first:border-t-0 sm:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.2fr)] sm:items-center">
                <span className="min-w-0"><span className="block text-sm font-medium text-gray-700">{label}</span><code className="break-all text-[11px] text-gray-400">{key}</code></span>
                {secret ? <span className="min-w-0">
                  <input type="password" autoComplete="new-password" aria-label={`${label} (${key})`} value={secretInputs[key] ?? ''} disabled={saveLoading} onChange={event => setSecretInputs(current => ({ ...current, [key]: event.target.value }))} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 font-mono text-xs outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" placeholder={isSecretConfigured(key) ? 'Đã cấu hình — để trống để giữ nguyên' : 'Nhập bí mật mới'} />
                  <span className="mt-1 block text-xs text-gray-500">{isSecretConfigured(key) ? 'Trạng thái: đã cấu hình. Bí mật hiện tại không thể xem lại.' : 'Trạng thái: chưa cấu hình.'}</span>
                </span> : <input type="text" aria-label={`${label} (${key})`} value={values[key] ?? ''} disabled={saveLoading} onChange={event => setFieldValue(key, event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 font-mono text-xs text-gray-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" />}
              </label>;
            })}
          </div>
        </div>
      ))}
      <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {hasUnsavedChanges ? <StatusBadge tone="warning">Có thay đổi chưa lưu</StatusBadge> : <StatusBadge tone="good">Không có thay đổi chưa lưu</StatusBadge>}
            <span className="text-xs text-gray-500">Lưu bản nháp chưa làm thay đổi cài đặt đang chạy.</span>
          </div>
          <button type="button" onClick={() => void saveDraft()} disabled={!securityReady || valuesError || Boolean(draftLoadError) || saveLoading || !hasUnsavedChanges} className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300">{saveLoading ? 'Đang lưu…' : 'Lưu bản nháp'}</button>
        </div>
        {saveError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{saveError}</p>}
        {saveMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{saveMessage}</p>}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">Áp dụng cài đặt có thể yêu cầu khởi động lại dịch vụ. Ứng dụng không tự khởi động lại dịch vụ sau khi áp dụng.</div>
        {status && !status.security.applyWorkerAvailable && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Worker WinSW chưa được cài đặt và kiểm chứng. Yêu cầu áp dụng sẽ được ghi nhận là không khả dụng; dịch vụ không được khởi động lại và cài đặt chưa có hiệu lực.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {applyJob && <p role="status" className={`text-sm ${applyJob.status === 'failed' ? 'text-red-700' : applyJob.status === 'succeeded' && applyJob.applied ? 'text-emerald-700' : 'text-amber-800'}`}>
              {applyJob.status === 'unavailable' ? `Yêu cầu đang chờ áp dụng; worker hiện không khả dụng nên chưa có thay đổi nào được áp dụng.${applyJob.message ? ` ${applyJob.message}` : ''}` : applyJob.status === 'queued' ? 'Yêu cầu áp dụng đang xếp hàng…' : applyJob.status === 'running' ? 'Đang áp dụng cài đặt…' : applyJob.status === 'succeeded' ? applyJob.applied ? 'Đã áp dụng cài đặt. Có thể cần khởi động lại dịch vụ.' : 'Tác vụ kết thúc nhưng xác nhận chưa áp dụng cài đặt.' : `Áp dụng thất bại.${applyJob.message ? ` ${applyJob.message}` : ''}`}
            </p>}
            {applyPollingError && <p role="alert" className="mt-1 text-sm text-red-700">{applyPollingError}</p>}
            {applyError && <p role="alert" className="mt-1 text-sm text-red-700">{applyError}</p>}
          </div>
          <button type="button" onClick={() => void applySettings()} disabled={!securityReady || !draft || Boolean(draftLoadError) || hasUnsavedChanges || applyLoading || Boolean(applyJob && ['queued', 'running'].includes(applyJob.status))} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400">{applyLoading ? 'Đang gửi yêu cầu…' : 'Áp dụng bản nháp'}</button>
        </div>
      </div>
    </section>
  );

  return <div className="mx-auto w-full max-w-7xl space-y-7 pb-10">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-3 flex items-center gap-2 text-sm text-gray-500"><span>{text('admin_crumb')}</span><ChevronRight className="h-4 w-4" /><span className="text-gray-800">{text('page_title')}</span></div><h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">{text('page_title')}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{text('page_description')}</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-red-700"><LockKeyhole className="h-3.5 w-3.5" />{text('super_admin')}</span></div>
    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5" role="status"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-amber-900">{text('live_backend_title')}</p><p className="mt-1 text-sm leading-5 text-amber-800">Bí mật chỉ được ghi, không bao giờ hiển thị hoặc sao chép. Lưu bản nháp và áp dụng là hai thao tác riêng biệt.</p></div><button type="button" onClick={() => void refreshAll()} disabled={isLoading || valuesLoading || hasUnsavedChanges} aria-label={text('refresh_status')} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /></button></div>
    {loadError && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4" role="alert"><XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" /><div><p className="text-sm font-semibold text-red-900">{text('load_error_title')}</p><p className="mt-1 text-sm text-red-800">{text('load_error_hint')}</p></div></div>}
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label={text('settings_nav_aria')} className="h-fit rounded-xl border border-gray-200 bg-white p-2 shadow-sm">{sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => openSection(id)} aria-current={activeSection === id ? 'page' : undefined} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors last:mb-0 ${activeSection === id ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}><Icon className={`h-4 w-4 ${activeSection === id ? 'text-red-600' : 'text-gray-400'}`} />{text(label)}{activeSection === id && <ChevronRight className="ml-auto h-4 w-4" />}</button>)}<div className="mt-3 border-t border-gray-100 px-3 pt-3"><p className="text-xs leading-5 text-gray-500">{text('super_admin_only')}</p></div></nav>
      <div className="min-w-0 space-y-6">
        {activeSection === 'overview' ? <>
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-lg font-bold text-gray-900">{text('status_title')}</h2><p className="mt-1 text-sm text-gray-500">{isLoading ? text('status_loading') : text('status_loaded')}</p></div><span className="text-xs font-medium text-gray-400">{status ? text('updated_at', { date: new Date(status.generatedAt).toLocaleString(INTL_LOCALES[locale]) }) : text('not_loaded')}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatusTile icon={Building2} label={text('branding')} detail={text('active')} tone="good" /><StatusTile icon={Mail} label={text('email')} detail={status ? status.email.configured ? text('configured') : text('email_missing') : text('loading')} tone={emailTone} /><StatusTile icon={CreditCard} label="VNPay" detail={status ? status.payment.configured ? text('credentials_complete') : text('credentials_missing') : text('loading')} tone={paymentTone} /><StatusTile icon={Cloud} label="Cloudflare" detail={status ? status.r2.configured && status.cloudflareAi.allCredentialsConfigured ? text('configured') : text('needs_check') : text('loading')} tone={cloudflareTone} /></div></section>
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-gray-900">{text('runtime_settings_title')}</h2><p className="mt-1 text-sm text-gray-500">{text('runtime_settings_description')}</p></div><div className="flex flex-wrap items-center gap-2">{runtimeSettings.some(setting => setting.restartRequired) && <StatusBadge tone="warning">{text('restart_required')}</StatusBadge>}<span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{text('runtime_settings_count', { count: runtimeSettings.length })}</span></div></div>{valuesError ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{text('runtime_settings_error')}</p> : valuesLoading ? <p className="mt-4 text-sm text-gray-500">{text('loading')}</p> : runtimeSettings.length ? <div className="mt-4 divide-y divide-gray-100">{runtimeSettings.map(setting => <div key={setting.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.2fr)] sm:items-center"><code className="break-all text-xs font-semibold text-gray-700">{setting.key}</code><span className="text-sm text-gray-700">{setting.secret ? setting.configured ? 'Đã cấu hình' : 'Chưa cấu hình' : setting.value}{setting.configured && setting.valid === false && <span className="ml-2 text-red-700">{text('configuration_invalid')}</span>}</span></div>)}</div> : <p className="mt-4 text-sm text-gray-500">{text('runtime_settings_empty')}</p>}</section>
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-4"><h2 className="text-lg font-bold text-gray-900">{text('groups_title')}</h2><p className="mt-1 text-sm text-gray-500">{text('groups_description')}</p></div><div className="divide-y divide-gray-100"><OverviewRow icon={Image} title={text('store_name')} description={text('active')} status={text('active')} tone="good" onClick={() => openSection('branding')} /><OverviewRow icon={Mail} title={text('email')} description={status ? status.email.configured ? text('configured') : text('credentials_missing') : text('email_loading')} status={status ? status.email.configured ? text('configured') : text('credentials_missing') : text('loading')} tone={emailTone} onClick={() => openSection('email')} /><OverviewRow icon={CreditCard} title="VNPay" description={status ? status.payment.configured ? text('credentials_complete') : text('credentials_missing') : text('payment_loading')} status={status ? status.payment.configured ? text(status.payment.mode) : text('credentials_missing') : text('loading')} tone={paymentTone} onClick={() => openSection('payment')} /><OverviewRow icon={Cloud} title="Cloudflare R2 & AI" description={status ? `${text('accounts_configured', { count: status.r2.accounts.length })} · ${text('credential_configs', { count: status.cloudflareAi.configuredCount, state: status.cloudflareAi.enabled ? text('enabled_state') : text('disabled_state') })}` : text('cloudflare_loading')} status={status ? status.r2.configured && status.cloudflareAi.allCredentialsConfigured ? text('has_configuration') : text('needs_check') : text('loading')} tone={cloudflareTone} onClick={() => openSection('cloudflare')} /><OverviewRow icon={KeyRound} title={text('security')} description="Bản nháp được lưu trữ an toàn; bí mật không thể đọc lại." status={securityReady ? 'Kho bí mật sẵn sàng' : 'Chưa sẵn sàng'} tone={securityReady ? 'good' : 'warning'} onClick={() => openSection('security')} /></div></section>
        </> : <>
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-100 p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><span className="rounded-lg bg-red-50 p-2.5 text-red-600"><CurrentIcon className="h-5 w-5" /></span><div><h2 className="text-lg font-bold text-gray-900">{text(currentSection.label)}</h2><p className="mt-1 text-sm text-gray-500">{text('section_value_description')}</p></div></div><StatusBadge tone={loadError ? 'danger' : isLoading ? 'neutral' : 'warning'}>{loadError ? text('load_failed') : isLoading ? text('loading') : 'Có thể chỉnh sửa bản nháp'}</StatusBadge></div></div>
            <div className="space-y-6 p-5 sm:p-6">
              {activeSection === 'branding' && <><div className="grid gap-4 sm:grid-cols-2"><DataField label={text('store_name')} value={storeName || 'LaptopStore'} /><DataField label={text('support_email')} value={supportEmail} /><DataField label={text('support_phone')} value={supportPhone} /><DataField label={text('website')} value={SITE_URL} /></div><div className="rounded-lg border border-gray-200 bg-gray-50 p-5"><div className="flex flex-wrap items-center gap-4"><img src="/assets/branding/logo-cropped.png" alt={text('logo_alt')} className="h-16 w-auto rounded bg-white object-contain p-2" /><div><p className="text-sm font-semibold text-gray-800">{text('logo_current')}</p><p className="mt-1 text-xs text-gray-500">/assets/branding/logo-cropped.png</p></div></div><p className="mt-3 text-sm text-gray-600">Thông tin thương hiệu đang ở chế độ chỉ xem; không thuộc danh sách cài đặt có thể quản lý.</p></div></>}
              {activeSection === 'email' && status && <div className="grid gap-4 sm:grid-cols-2"><DataField label={text('provider')} value={status.email.service === 'sendgrid' ? 'SendGrid SMTP' : 'SMTP'} /><DataField label={text('smtp_host')} value={status.email.host} /><DataField label={text('port')} value={status.email.port} /><DataField label={text('tls_secure')} value={status.email.secure ? text('enabled') : text('disabled')} /><DataField label={text('smtp_account')} value={status.email.account} /><DataField label={text('from_address')} value={status.email.from} /><DataField label={text('smtp_password')} value={status.email.passwordConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'} /><DataField label={text('sendgrid_api_key')} value={status.email.sendgridKeyConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'} /></div>}
              {activeSection === 'payment' && status && <div className="grid gap-4 sm:grid-cols-2"><DataField label={text('environment')} value={text(status.payment.mode)} /><DataField label={text('merchant_code')} value={status.payment.merchantCode} /><DataField label={text('endpoint')} value={status.payment.endpoint} /><DataField label={text('return_url')} value={status.payment.returnUrl} /><DataField label={text('callback_url')} value={status.payment.callbackUrl} /><DataField label={text('vnpay_hash_secret')} value={status.payment.secretConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'} /></div>}
              {activeSection === 'cloudflare' && status && <><div className="rounded-lg border border-gray-200 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">{text('r2_title')}</p><p className="mt-1 text-xs text-gray-500">{status.r2.configurationValid ? text('accounts_configured', { count: status.r2.accounts.length }) : text('account_invalid')}</p></div><StatusBadge tone={r2Tone}>{!status.r2.configurationValid ? text('configuration_invalid') : !status.r2.configured ? text('not_configured') : !status.r2.policyValid ? text('policy_invalid') : status.r2.uploadEnabled ? text('upload_enabled') : text('upload_disabled')}</StatusBadge></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead className="text-xs uppercase text-gray-500"><tr><th className="pb-2 pr-4 font-medium">{text('account_id')}</th><th className="pb-2 pr-4 font-medium">{text('bucket')}</th><th className="pb-2 font-medium">{text('public_base_url')}</th></tr></thead><tbody className="divide-y divide-gray-100">{status.r2.accounts.map(account => <tr key={account.id}><td className="py-2 pr-4 text-xs text-gray-700">{account.accountId}</td><td className="py-2 pr-4 text-xs text-gray-700">{account.bucket}</td><td className="break-all py-2 text-xs text-gray-700">{account.publicBaseUrl}</td></tr>)}</tbody></table></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><DataField label={text('upload_policy')} value={status.r2.uploadEnabled ? text('enabled') : text('disabled')} /><DataField label={text('max_files')} value={status.r2.policy.maxAssets} /><DataField label={text('max_bytes')} value={status.r2.policy.maxBytes} /></div></div><div className="rounded-lg border border-gray-200 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">{text('cloudflare_ai_title')}</p><p className="mt-1 text-xs text-gray-500">{text('credential_configs', { count: status.cloudflareAi.configuredCount, state: status.cloudflareAi.enabled ? text('enabled_state') : text('disabled_state') })}</p></div><StatusBadge tone={aiTone}>{status.cloudflareAi.allCredentialsConfigured ? status.cloudflareAi.enabled ? text('ready') : text('disabled') : text('missing_credentials')}</StatusBadge></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><DataField label={text('daily_request_limit')} value={status.cloudflareAi.maxRequestsPerDay} /><DataField label={text('daily_character_limit')} value={status.cloudflareAi.maxInputCharsPerDay} /><DataField label={text('cloudflare_ai_title')} value={status.cloudflareAi.models.join(', ') || text('models_missing')} /></div><p className="mt-3 text-xs text-gray-600">Mã thông tin Cloudflare AI được giữ kín và không hiển thị tại đây.</p></div><div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">{text('tunnel_dns_unmanaged_title')}</p><p className="mt-1 text-sm leading-5 text-amber-800">{text('tunnel_dns_unmanaged_description')}</p></div></>}
              {activeSection === 'security' && status && <><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><p className="text-sm font-semibold text-emerald-900">{text('secret_never_returned')}</p><p className="mt-1 text-sm leading-5 text-emerald-800">Bí mật chỉ được ghi vào bản nháp, không thể xem lại hoặc sao chép.</p></div></div></div><div className="grid gap-4 sm:grid-cols-2"><DataField label={text('encrypted_secret_store')} value={status.security.encryptedSecretStoreAvailable ? text('ready') : text('not_configured_yet')} /><DataField label="Lưu bản nháp có quản lý" value={status.security.managedDraftAvailable ? text('ready') : text('not_configured_yet')} /><DataField label="Worker áp dụng" value={status.security.applyWorkerAvailable ? text('ready') : 'Không khả dụng — chưa thể áp dụng'} /><DataField label={text('restart_groups_count')} value={status.security.restartRequiredGroups.length} /><DataField label={text('tunnel_dns_label')} value={text('not_managed_by_app')} /></div><div className="rounded-lg border border-gray-200 p-4"><p className="text-sm font-semibold text-gray-900">{text('restart_groups')}</p><div className="mt-3 flex flex-wrap gap-2">{status.security.restartRequiredGroups.map(group => <span key={group} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{group}</span>)}</div></div></>}
              {(activeSection === 'email' || activeSection === 'payment' || activeSection === 'cloudflare' || activeSection === 'security') && !status && !isLoading && <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">{text('empty_data')}</p>}
              {selectedGroups.length > 0 && renderEditableSettings()}
            </div>
          </section>
        </>}
        <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><p className="text-sm leading-5 text-gray-600"><span className="font-semibold text-gray-800">{text('status_color_legend')}</span> {text('status_color_description')}</p></div>
      </div>
    </div>
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
