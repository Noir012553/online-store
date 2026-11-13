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
import { interpolateTranslation } from '../../lib/translationInterpolate';
import { INTL_LOCALES } from '../../lib/i18n/types';

type SectionKey = 'overview' | 'branding' | 'email' | 'payment' | 'cloudflare' | 'security';
type StatusTone = 'good' | 'warning' | 'danger' | 'neutral';
type SettingsTextKey = string;
type RuntimeSetting =
  | { key: string; secret: true; configured: boolean }
  | { key: string; secret: false; value: string };
type SettingsStatus = {
  generatedAt: string;
  email: {
    service: 'smtp' | 'sendgrid';
    host: string;
    port: number;
    secure: boolean;
    account: string;
    from: string;
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
    policyValid: boolean;
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
  { id: 'overview', label: 'overview', icon: Globe2 },
  { id: 'branding', label: 'branding', icon: Building2 },
  { id: 'email', label: 'email', icon: Mail },
  { id: 'payment', label: 'payment', icon: CreditCard },
  { id: 'cloudflare', label: 'cloudflare', icon: Cloud },
  { id: 'security', label: 'security', icon: ShieldCheck },
] as const;

function useSettingsText() {
  const { t } = useLanguage();
  return (key: SettingsTextKey, variables?: Record<string, string | number>) => (
    interpolateTranslation(t(key, 'admin-settings'), variables)
  );
}

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
  const text = useSettingsText();
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        value={value === '' ? text('not_configured') : value}
        readOnly
        aria-readonly="true"
        className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 text-sm text-gray-700 outline-none"
      />
    </label>
  );
}

function SecretStatus({ label, configured }: { label: string; configured: boolean }) {
  const text = useSettingsText();
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3.5">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <span className={`text-xs font-semibold ${configured ? 'text-emerald-700' : 'text-amber-700'}`}>
        {configured ? text('configured') : text('not_configured')}
      </span>
    </div>
  );
}

function RuntimeSettingRow({ setting }: { setting: RuntimeSetting }) {
  const text = useSettingsText();
  const value = setting.secret
    ? setting.configured ? text('configured') : text('not_configured')
    : setting.value;

  return (
    <div className="grid gap-2 border-t border-gray-100 py-3 sm:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.2fr)] sm:items-center">
      <code className="break-all text-xs font-semibold text-gray-700">{setting.key}</code>
      {setting.secret ? (
        <span className={`h-10 rounded-lg border px-3 py-2.5 text-xs font-medium ${setting.configured ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
          {value}
        </span>
      ) : (
        <input
          type="text"
          value={value}
          readOnly
          aria-readonly="true"
          className="h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 font-mono text-xs text-gray-700 outline-none"
        />
      )}
    </div>
  );
}

function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSetting[]>([]);
  const [valuesLoading, setValuesLoading] = useState(true);
  const [valuesError, setValuesError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { t, loadNamespace, locale } = useLanguage();
  const text = useSettingsText();

  const loadRuntimeSettings = async () => {
    setValuesLoading(true);
    setValuesError(false);
    try {
      const response = await apiCall<{ success: boolean; data: { settings: RuntimeSetting[] } }>('/admin/settings/values', {
        skipCache: true,
        skipErrorToast: true,
      });
      setRuntimeSettings(response.data.settings);
    } catch {
      setValuesError(true);
    } finally {
      setValuesLoading(false);
    }
  };

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
    void loadRuntimeSettings();
    void loadNamespace('footer');
    void loadNamespace('admin-settings');
  }, [loadNamespace]);

  const openSection = (section: SectionKey) => setActiveSection(section);
  const currentSection = sections.find((section) => section.id === activeSection) ?? sections[0];
  const CurrentIcon = currentSection.icon;
  const storeName = text('store_name');
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
  const cloudflareTone = status
    ? r2Tone === 'danger' || aiTone === 'danger'
      ? 'danger'
      : r2Tone === 'warning' || aiTone === 'warning' || !status.cloudflareOperations.tunnelManaged || !status.cloudflareOperations.dnsManaged
        ? 'warning'
        : 'good'
    : 'neutral';

  return (
    <div className="mx-auto w-full max-w-7xl space-y-7 pb-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
            <span>{text('admin_crumb')}</span><ChevronRight className="h-4 w-4" /><span className="text-gray-800">{text('page_title')}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">{text('page_title')}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{text('page_description')}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-red-700">
          <LockKeyhole className="h-3.5 w-3.5" /> {text('super_admin')}
        </span>
      </div>

      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5" role="status">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">{text('live_backend_title')}</p>
          <p className="mt-1 text-sm leading-5 text-amber-800">{text('secret_safety_notice')}</p>
        </div>
        <button type="button" onClick={() => { void loadStatus(); void loadRuntimeSettings(); }} disabled={isLoading || valuesLoading} aria-label={text('refresh_status')} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white text-amber-800 transition hover:bg-amber-100 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loadError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div><p className="text-sm font-semibold text-red-900">{text('load_error_title')}</p><p className="mt-1 text-sm text-red-800">{text('load_error_hint')}</p></div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label={text('settings_nav_aria')} className="h-fit rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => openSection(id)}
              aria-current={activeSection === id ? 'page' : undefined}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors last:mb-0 ${activeSection === id ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              <Icon className={`h-4 w-4 ${activeSection === id ? 'text-red-600' : 'text-gray-400'}`} />
              {text(label)}
              {activeSection === id && <ChevronRight className="ml-auto h-4 w-4" />}
            </button>
          ))}
          <div className="mt-3 border-t border-gray-100 px-3 pt-3">
            <p className="text-xs leading-5 text-gray-500">{text('super_admin_only')}</p>
          </div>
        </nav>

        <div className="min-w-0 space-y-6">
          {activeSection === 'overview' ? (
            <>
              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div><h2 className="text-lg font-bold text-gray-900">{text('status_title')}</h2><p className="mt-1 text-sm text-gray-500">{isLoading ? text('status_loading') : text('status_loaded')}</p></div>
                  <span className="text-xs font-medium text-gray-400">{status ? text('updated_at', { date: new Date(status.generatedAt).toLocaleString(INTL_LOCALES[locale]) }) : text('not_loaded')}</span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatusTile icon={Building2} label={text('branding')} detail={storeName || 'LaptopStore'} tone="good" />
                  <StatusTile icon={Mail} label={text('email')} detail={status ? status.email.configured ? `${status.email.service.toUpperCase()} · ${status.email.host}` : text('email_missing') : text('loading')} tone={emailTone} />
                  <StatusTile icon={CreditCard} label="VNPay" detail={status ? `${text(status.payment.mode)} · ${status.payment.configured ? text('credentials_complete') : text('credentials_missing')}` : text('loading')} tone={paymentTone} />
                  <StatusTile icon={Cloud} label="Cloudflare" detail={status ? `${text('r2_title')} · ${status.r2.configured ? text('configured') : text('not_configured')} · ${text('cloudflare_ai_title')} ${status.cloudflareAi.configuredCount}` : text('loading')} tone={cloudflareTone} />
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="text-lg font-bold text-gray-900">{text('runtime_settings_title')}</h2><p className="mt-1 text-sm text-gray-500">{text('runtime_settings_description')}</p></div>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{text('runtime_settings_count', { count: runtimeSettings.length })}</span>
                </div>
                {valuesError ? (
                  <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{text('runtime_settings_error')}</p>
                ) : valuesLoading ? (
                  <p className="mt-4 text-sm text-gray-500">{text('loading')}</p>
                ) : runtimeSettings.length ? (
                  <div className="mt-4">
                    {runtimeSettings.map(setting => <RuntimeSettingRow key={setting.key} setting={setting} />)}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-gray-500">{text('runtime_settings_empty')}</p>
                )}
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-4"><h2 className="text-lg font-bold text-gray-900">{text('groups_title')}</h2><p className="mt-1 text-sm text-gray-500">{text('groups_description')}</p></div>
                <div className="divide-y divide-gray-100">
                  <OverviewRow icon={Image} title={text('store_name')} description={`${storeName || 'LaptopStore'} · ${supportEmail || text('support_email_missing')}`} status={text('active')} tone="good" onClick={() => openSection('branding')} />
                  <OverviewRow icon={Mail} title={text('email')} description={status ? `${status.email.host}:${status.email.port} · ${text('from_address')}: ${status.email.from || text('not_configured')}` : text('email_loading')} status={status ? status.email.configured ? text('configured') : text('credentials_missing') : text('loading')} tone={emailTone} onClick={() => openSection('email')} />
                  <OverviewRow icon={CreditCard} title="VNPay" description={status ? `${text(status.payment.mode)} · ${status.payment.endpoint}` : text('payment_loading')} status={status ? status.payment.configured ? text(status.payment.mode) : text('credentials_missing') : text('loading')} tone={paymentTone} onClick={() => openSection('payment')} />
                  <OverviewRow icon={Cloud} title="Cloudflare R2 & AI" description={status ? `${text('accounts_configured', { count: status.r2.accounts.length })} · ${text('credential_configs', { count: status.cloudflareAi.configuredCount, state: status.cloudflareAi.enabled ? text('enabled_state') : text('disabled_state') })}` : text('cloudflare_loading')} status={status ? status.r2.configured && status.cloudflareAi.allCredentialsConfigured ? text('has_configuration') : text('needs_check') : text('loading')} tone={cloudflareTone} onClick={() => openSection('cloudflare')} />
                  <OverviewRow icon={KeyRound} title={text('security')} description={text('secret_safety_notice')} status={status?.security.encryptedSecretStoreAvailable ? text('secret_store_ready') : text('read_only')} tone={status?.security.encryptedSecretStoreAvailable ? 'good' : 'warning'} onClick={() => openSection('security')} />
                </div>
              </section>
            </>
          ) : (
            <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3"><span className="rounded-lg bg-red-50 p-2.5 text-red-600"><CurrentIcon className="h-5 w-5" /></span><div><h2 className="text-lg font-bold text-gray-900">{text(currentSection.label)}</h2><p className="mt-1 text-sm text-gray-500">{text('section_value_description')}</p></div></div>
                  <StatusBadge tone={loadError ? 'danger' : isLoading ? 'neutral' : 'warning'}>{loadError ? text('load_failed') : isLoading ? text('loading') : text('read_only_mode')}</StatusBadge>
                </div>
              </div>

              <div className="space-y-6 p-5 sm:p-6">
                {activeSection === 'branding' && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2"><DataField label={text('store_name')} value={storeName || 'LaptopStore'} /><DataField label={text('support_email')} value={supportEmail} /><DataField label={text('support_phone')} value={supportPhone} /><DataField label={text('website')} value={SITE_URL} /></div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-5"><div className="flex flex-wrap items-center gap-4"><img src="/assets/branding/logo-cropped.png" alt={text('logo_alt')} className="h-16 w-auto rounded bg-white object-contain p-2" /><div><p className="text-sm font-semibold text-gray-800">{text('logo_current')}</p><p className="mt-1 text-xs text-gray-500">/assets/branding/logo-cropped.png</p></div></div></div>
                  </>
                )}
                {activeSection === 'email' && status && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2"><DataField label={text('provider')} value={status.email.service === 'sendgrid' ? 'SendGrid SMTP' : 'SMTP'} /><DataField label={text('smtp_host')} value={status.email.host} /><DataField label={text('port')} value={status.email.port} /><DataField label={text('tls_secure')} value={status.email.secure ? text('enabled') : text('disabled')} /><DataField label={text('smtp_account')} value={status.email.account} /><DataField label={text('from_address')} value={status.email.from} /></div>
                    <div className="grid gap-4 sm:grid-cols-2"><SecretStatus label={text('smtp_password')} configured={status.email.passwordConfigured} /><SecretStatus label={text('sendgrid_api_key')} configured={status.email.sendgridKeyConfigured} /></div>
                    <SecretNotice text={text('runtime_settings_description')} />
                  </>
                )}
                {activeSection === 'payment' && status && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2"><DataField label={text('environment')} value={text(status.payment.mode)} /><DataField label={text('merchant_code')} value={status.payment.merchantCode} /><DataField label={text('endpoint')} value={status.payment.endpoint} /><DataField label={text('return_url')} value={status.payment.returnUrl} /><DataField label={text('callback_url')} value={status.payment.callbackUrl} /></div>
                    <SecretStatus label={text('vnpay_hash_secret')} configured={status.payment.secretConfigured} />
                    <SecretNotice text={text('runtime_settings_description')} />
                  </>
                )}
                {activeSection === 'cloudflare' && status && (
                  <>
                    <div className="rounded-lg border border-gray-200 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">{text('r2_title')}</p><p className="mt-1 text-xs text-gray-500">{status.r2.configurationValid ? text('accounts_configured', { count: status.r2.accounts.length }) : text('account_invalid')}</p></div><StatusBadge tone={r2Tone}>{!status.r2.configurationValid ? text('configuration_invalid') : !status.r2.configured ? text('not_configured') : !status.r2.policyValid ? text('policy_invalid') : status.r2.uploadEnabled ? text('upload_enabled') : text('upload_disabled')}</StatusBadge></div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2"><SecretStatus label={text('r2_access_key')} configured={status.r2.credentialsConfigured} /><SecretStatus label={text('r2_secret_key')} configured={status.r2.credentialsConfigured} /></div>
                      {status.r2.accounts.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead className="text-xs uppercase text-gray-500"><tr><th className="pb-2 pr-4 font-medium">{text('account_id')}</th><th className="pb-2 pr-4 font-medium">{text('bucket')}</th><th className="pb-2 font-medium">{text('public_base_url')}</th></tr></thead><tbody className="divide-y divide-gray-100">{status.r2.accounts.map(account => <tr key={account.id}><td className="py-2 pr-4">{account.accountId}</td><td className="py-2 pr-4">{account.bucket}</td><td className="break-all py-2">{account.publicBaseUrl}</td></tr>)}</tbody></table></div>}
                      <div className="mt-4 grid gap-3 sm:grid-cols-3"><DataField label={text('upload_policy')} value={status.r2.uploadEnabled ? text('enabled') : text('disabled')} /><DataField label={text('max_files')} value={status.r2.policy.maxAssets} /><DataField label={text('max_bytes')} value={status.r2.policy.maxBytes} /></div>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-900">{text('cloudflare_ai_title')}</p><p className="mt-1 text-xs text-gray-500">{text('credential_configs', { count: status.cloudflareAi.configuredCount, state: status.cloudflareAi.enabled ? text('enabled_state') : text('disabled_state') })}</p></div><StatusBadge tone={aiTone}>{status.cloudflareAi.allCredentialsConfigured ? status.cloudflareAi.enabled ? text('ready') : text('disabled') : text('missing_credentials')}</StatusBadge></div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2"><DataField label={text('daily_request_limit')} value={status.cloudflareAi.maxRequestsPerDay} /><DataField label={text('daily_character_limit')} value={status.cloudflareAi.maxInputCharsPerDay} /></div>
                      <div className="mt-4 flex flex-wrap gap-2">{status.cloudflareAi.models.length ? status.cloudflareAi.models.map((model, index) => <span key={`${model}-${index}`} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700">{model}</span>) : <span className="text-sm text-gray-500">{text('models_missing')}</span>}</div>
                      {status.cloudflareAi.configuredCount > 0 && <div className="mt-4 grid gap-4 sm:grid-cols-2"><SecretStatus label={text('cloudflare_api_token')} configured={status.cloudflareAi.allCredentialsConfigured} /><DataField label={text('account_id')} value={status.cloudflareAi.accountIds.filter(Boolean).join(', ')} /></div>}
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">{text('tunnel_dns_unmanaged_title')}</p><p className="mt-1 text-sm leading-5 text-amber-800">{text('tunnel_dns_unmanaged_description')}</p></div>
                    <SecretNotice text={text('cloudflare_secret_notice')} />
                  </>
                )}
                {activeSection === 'security' && status && (
                  <>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><p className="text-sm font-semibold text-emerald-900">{text('secret_never_returned')}</p><p className="mt-1 text-sm leading-5 text-emerald-800">{text('filtered_response_notice')}</p></div></div></div>
                    <div className="grid gap-4 sm:grid-cols-2"><DataField label={text('encrypted_secret_store')} value={status.security.encryptedSecretStoreAvailable ? text('ready') : text('not_configured_yet')} /><DataField label={text('managed_overrides')} value={status.security.managedOverridesAvailable ? text('ready') : text('not_configured_yet')} /><DataField label={text('restart_groups_count')} value={status.security.restartRequiredGroups.length} /><DataField label={text('tunnel_dns_label')} value={text('not_managed_by_app')} /></div>
                    <div className="rounded-lg border border-gray-200 p-4"><p className="text-sm font-semibold text-gray-900">{text('restart_groups')}</p><div className="mt-3 flex flex-wrap gap-2">{status.security.restartRequiredGroups.map(group => <span key={group} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{group}</span>)}</div></div>
                  </>
                )}
                {(activeSection === 'email' && !status || activeSection === 'payment' && !status || activeSection === 'cloudflare' && !status || activeSection === 'security' && !status) && !isLoading && <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">{text('empty_data')}</p>}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5"><p className="text-xs text-gray-500">{text('runtime_read_only')}</p><button type="button" disabled className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-200 px-4 text-sm font-semibold text-gray-500">{text('save_changes')}</button></div>
              </div>
            </section>
          )}

          <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><p className="text-sm leading-5 text-gray-600"><span className="font-semibold text-gray-800">{text('status_color_legend')}</span> {text('status_color_description')}</p></div>
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
