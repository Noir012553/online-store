import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, RotateCcw, Save, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { settingsAPI, type StoreSettingsRecord } from '../../lib/api';
import { useTranslation } from '../../lib/i18n';

const EMPTY_SETTINGS: StoreSettingsRecord = {
  branding: { storeName: '', siteUrl: '', supportEmail: '', logoUrl: '', darkLogoUrl: '', faviconUrl: '' },
  maintenance: { enabled: false, message: '', scheduledStart: null, scheduledEnd: null },
  version: 1,
  updatedAt: null,
};

type AssetField = 'logo' | 'darkLogo' | 'favicon';

export const getServerSideProps = async () => ({ props: {} });

const toLocalDateTime = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

function SettingsAdminPage() {
  const { t, loadNamespace } = useTranslation();
  const [settings, setSettings] = useState<StoreSettingsRecord>(EMPTY_SETTINGS);
  const [scheduledStart, setScheduledStart] = useState('');
  const [scheduledEnd, setScheduledEnd] = useState('');
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof settingsAPI.getAudit>> | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<'backend-missing' | 'load-failed' | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<AssetField | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<AssetField, string>>>({});
  const previewsRef = useRef(previews);

  const loadSettings = useCallback(async () => {
    await Promise.all([loadNamespace('common'), loadNamespace('contact'), loadNamespace('admin-store-settings')]);
    const response = await settingsAPI.getAdmin();
    const data = response.data;
    setSettings({
      ...data,
      branding: {
        ...data.branding,
        siteUrl: data.branding.siteUrl || '',
        storeName: data.branding.storeName || t('brand_name', 'common'),
        supportEmail: data.branding.supportEmail || t('contact_email', 'contact'),
      },
    });
    setScheduledStart(toLocalDateTime(data.maintenance.scheduledStart));
    setScheduledEnd(toLocalDateTime(data.maintenance.scheduledEnd));
  }, [loadNamespace, t]);

  const loadAudit = useCallback(async () => {
    setAudit(await settingsAPI.getAudit(auditPage));
  }, [auditPage]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadSettings(), loadAudit()]);
      setLoadError(null);
    } catch (error) {
      const apiError = error as Error & { code?: string; status?: number };
      setLoadError(apiError.code === 'ROUTE_NOT_FOUND' || apiError.code === 'INVALID_SETTINGS_FIELDS' || apiError.status === 404 ? 'backend-missing' : 'load-failed');
    } finally {
      setLoading(false);
    }
  }, [loadAudit, loadSettings]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => () => {
    Object.values(previewsRef.current).forEach((url) => url && URL.revokeObjectURL(url));
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await settingsAPI.update({
        branding: settings.branding,
        maintenance: {
          ...settings.maintenance,
          scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : null,
          scheduledEnd: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
        },
      });
      setSettings(response.data);
      toast.success(t('settings_saved', 'admin-store-settings'));
      await loadAudit();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('save_failed', 'admin-store-settings'));
    } finally {
      setSaving(false);
    }
  };

  const uploadAsset = async (field: AssetField, file?: File) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPreviews((current) => {
      if (current[field]) URL.revokeObjectURL(current[field]!);
      return { ...current, [field]: preview };
    });
    setUploading(field);
    try {
      const response = await settingsAPI.uploadBrandAsset(file, field);
      setSettings(response.data);
      setPreviews((current) => {
        if (current[field]) URL.revokeObjectURL(current[field]!);
        const next = { ...current };
        delete next[field];
        return next;
      });
      toast.success(t('asset_uploaded', 'admin-store-settings'));
      await loadAudit();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('asset_upload_failed', 'admin-store-settings'));
    } finally {
      setUploading(null);
    }
  };

  const resetSettings = async () => {
    if (!window.confirm(t('reset_confirmation', 'admin-store-settings'))) return;
    setSaving(true);
    try {
      const response = await settingsAPI.reset();
      setSettings(response.data);
      setScheduledStart('');
      setScheduledEnd('');
      toast.success(t('settings_reset', 'admin-store-settings'));
      await loadAudit();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('reset_failed', 'admin-store-settings'));
    } finally {
      setSaving(false);
    }
  };

  const updateBranding = (field: keyof StoreSettingsRecord['branding'], value: string) => {
    setSettings((current) => ({ ...current, branding: { ...current.branding, [field]: value } }));
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">{t('loading_settings', 'admin-store-settings')}</div>;
  if (loadError) return <div role="alert" className="mx-auto max-w-2xl rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950"><h1 className="text-lg font-semibold">{t(loadError === 'backend-missing' ? 'backend_missing_heading' : 'load_failed_heading', 'admin-store-settings')}</h1><p className="mt-2 leading-6">{t(loadError === 'backend-missing' ? 'backend_missing_help' : 'load_failed_help', 'admin-store-settings')}</p><button type="button" onClick={() => void loadData()} className="mt-4 rounded-lg border border-amber-400 px-4 py-2 font-medium hover:bg-amber-100">{t('retry', 'admin-store-settings')}</button></div>;

  const assetInputs: Array<{ field: AssetField; label: string; value: string }> = [
    { field: 'logo', label: t('logo_main', 'admin-store-settings'), value: settings.branding.logoUrl || '/assets/branding/logo-cropped.png' },
    { field: 'darkLogo', label: t('logo_dark', 'admin-store-settings'), value: settings.branding.darkLogoUrl || '/assets/branding/logo.png' },
    { field: 'favicon', label: t('favicon', 'admin-store-settings'), value: settings.branding.faviconUrl || '/favicon.ico' },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600"><Settings2 className="h-5 w-5" /></div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{t('page_title', 'admin-store-settings')}</h1>
          <p className="mt-2 text-sm text-slate-600">{t('page_subtitle', 'admin-store-settings')}</p>
        </div>
        <p className="text-xs text-slate-500">{t('version', 'admin-store-settings')} {settings.version}{settings.updatedAt ? ` · ${t('updated', 'admin-store-settings')} ${new Date(settings.updatedAt).toLocaleString()}` : ''}</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900">{t('page_title', 'admin-store-settings')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('section_description', 'admin-store-settings')}</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th scope="col" className="w-36 px-4 py-3 font-semibold">{t('table_group', 'admin-store-settings')}</th><th scope="col" className="w-48 px-4 py-3 font-semibold">{t('table_setting', 'admin-store-settings')}</th><th scope="col" className="px-4 py-3 font-semibold">{t('table_value', 'admin-store-settings')}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{t('brand', 'admin-store-settings')}</span></td>
                <th scope="row" className="px-4 py-3 text-sm font-medium text-slate-800"><label htmlFor="store-name">{t('store_name', 'admin-store-settings')}</label></th>
                <td className="px-4 py-3"><input id="store-name" value={settings.branding.storeName} maxLength={120} onChange={(event) => updateBranding('storeName', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" /></td>
              </tr>
              <tr>
                <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{t('brand', 'admin-store-settings')}</span></td>
                <th scope="row" className="px-4 py-3 text-sm font-medium text-slate-800"><label htmlFor="store-site-url">{t('site_domain', 'admin-store-settings')}</label></th>
                <td className="px-4 py-3">
                  <input id="store-site-url" type="text" inputMode="url" autoCapitalize="none" value={settings.branding.siteUrl} maxLength={300} onChange={(event) => updateBranding('siteUrl', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
                  <p className="mt-1 text-xs leading-5 text-slate-500">{t('site_domain_help', 'admin-store-settings')}</p>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{t('brand', 'admin-store-settings')}</span></td>
                <th scope="row" className="px-4 py-3 text-sm font-medium text-slate-800"><label htmlFor="store-support-email">{t('support_email', 'admin-store-settings')}</label></th>
                <td className="px-4 py-3"><input id="store-support-email" type="email" value={settings.branding.supportEmail} maxLength={254} onChange={(event) => updateBranding('supportEmail', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" /></td>
              </tr>
              {assetInputs.map(({ field, label, value }) => (
                <tr key={field}>
                  <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{t('brand', 'admin-store-settings')}</span></td>
                  <th scope="row" className="px-4 py-3 text-sm font-medium text-slate-800">{label}</th>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-4">
                      <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-lg bg-slate-50 p-2">
                        {(previews[field] || value) ? <img src={previews[field] || value} alt={`${label} ${t('preview', 'admin-store-settings')}`} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">{t('no_image', 'admin-store-settings')}</span>}
                      </div>
                      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        {uploading === field ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                        {t('choose_image', 'admin-store-settings')}
                        <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" disabled={uploading !== null} onChange={(event) => { void uploadAsset(field, event.target.files?.[0]); event.currentTarget.value = ''; }} />
                      </label>
                    </div>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="px-4 py-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">{t('maintenance', 'admin-store-settings')}</span></td>
                <th scope="row" className="px-4 py-3 text-sm font-medium text-slate-800">{t('maintenance_notice', 'admin-store-settings')}</th>
                <td className="px-4 py-3">
                  <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-800">
                    <input type="checkbox" checked={settings.maintenance.enabled} onChange={(event) => setSettings((current) => ({ ...current, maintenance: { ...current.maintenance, enabled: event.target.checked } }))} className="h-5 w-5 accent-red-600" />
                    {settings.maintenance.enabled ? t('maintenance_enabled', 'admin-store-settings') : t('maintenance_disabled', 'admin-store-settings')}
                  </label>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{t('maintenance_help', 'admin-store-settings')}</p>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">{t('maintenance', 'admin-store-settings')}</span></td>
                <th scope="row" className="px-4 py-3 text-sm font-medium text-slate-800"><label htmlFor="maintenance-message">{t('maintenance_message', 'admin-store-settings')}</label></th>
                <td className="px-4 py-3"><textarea id="maintenance-message" value={settings.maintenance.message} maxLength={1000} rows={3} onChange={(event) => setSettings((current) => ({ ...current, maintenance: { ...current.maintenance, message: event.target.value } }))} className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" placeholder={t('maintenance_placeholder', 'admin-store-settings')} /></td>
              </tr>
              <tr>
                <td className="px-4 py-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">{t('maintenance', 'admin-store-settings')}</span></td>
                <th scope="row" className="px-4 py-3 text-sm font-medium text-slate-800"><label htmlFor="maintenance-start">{t('scheduled_start', 'admin-store-settings')}</label></th>
                <td className="px-4 py-3"><input id="maintenance-start" type="datetime-local" value={scheduledStart} onChange={(event) => setScheduledStart(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></td>
              </tr>
              <tr>
                <td className="px-4 py-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">{t('maintenance', 'admin-store-settings')}</span></td>
                <th scope="row" className="px-4 py-3 text-sm font-medium text-slate-800"><label htmlFor="maintenance-end">{t('scheduled_end', 'admin-store-settings')}</label></th>
                <td className="px-4 py-3"><input id="maintenance-end" type="datetime-local" value={scheduledEnd} onChange={(event) => setScheduledEnd(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" onClick={() => void resetSettings()} disabled={saving || uploading !== null} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RotateCcw className="h-4 w-4" />{t('reset_defaults', 'admin-store-settings')}</button>
        <button type="button" onClick={() => void saveSettings()} disabled={saving || uploading !== null} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{t('save_settings', 'admin-store-settings')}</button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div><h2 className="text-lg font-semibold text-slate-900">{t('audit_title', 'admin-store-settings')}</h2><p className="mt-1 text-sm text-slate-500">{t('audit_subtitle', 'admin-store-settings')}</p></div>
          <span className="text-xs text-slate-500">{audit?.pagination.total || 0} {t('audit_records', 'admin-store-settings')}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {audit?.data.map((entry) => (
            <div key={entry._id} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto] sm:gap-4">
              <p className="font-medium text-slate-800">{t(entry.action === 'reset' ? 'audit_action_reset' : entry.action === 'logo_upload' ? 'audit_action_asset_upload' : 'audit_action_update', 'admin-store-settings')} · v{entry.version}<span className="block text-xs font-normal text-slate-500">{entry.changedFields.join(', ')}</span></p>
              <p className="text-xs text-slate-500 sm:text-right">{entry.userName || t('super_admin', 'admin-store-settings')} · {new Date(entry.createdAt).toLocaleString()}</p>
            </div>
          ))}
          {!audit?.data.length && <p className="py-6 text-center text-sm text-slate-500">{t('no_changes', 'admin-store-settings')}</p>}
        </div>
        {(audit?.pagination.totalPages || 0) > 1 && <div className="mt-5 flex items-center justify-end gap-3 text-sm"><button type="button" disabled={auditPage <= 1} onClick={() => setAuditPage((page) => page - 1)} className="rounded-md border px-3 py-1.5 disabled:opacity-40">{t('previous', 'admin-store-settings')}</button><span>{auditPage} / {audit?.pagination.totalPages}</span><button type="button" disabled={auditPage >= (audit?.pagination.totalPages || 1)} onClick={() => setAuditPage((page) => page + 1)} className="rounded-md border px-3 py-1.5 disabled:opacity-40">{t('next', 'admin-store-settings')}</button></div>}
      </section>
    </div>
  );
}

export default withAdminLayout(SettingsAdminPage, { permission: 'super-admin', featureName: 'Store settings' });
