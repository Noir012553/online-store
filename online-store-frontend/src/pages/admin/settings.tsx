import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, RotateCcw, Save, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { settingsAPI, type StoreSettingsRecord } from '../../lib/api';

const EMPTY_SETTINGS: StoreSettingsRecord = {
  branding: { storeName: '', supportEmail: '', logoUrl: '', darkLogoUrl: '', faviconUrl: '' },
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
  const [settings, setSettings] = useState<StoreSettingsRecord>(EMPTY_SETTINGS);
  const [scheduledStart, setScheduledStart] = useState('');
  const [scheduledEnd, setScheduledEnd] = useState('');
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof settingsAPI.getAudit>> | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<AssetField | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<AssetField, string>>>({});
  const previewsRef = useRef(previews);

  const loadSettings = useCallback(async () => {
    const response = await settingsAPI.getAdmin();
    setSettings(response.data);
    setScheduledStart(toLocalDateTime(response.data.maintenance.scheduledStart));
    setScheduledEnd(toLocalDateTime(response.data.maintenance.scheduledEnd));
  }, []);

  const loadAudit = useCallback(async () => {
    setAudit(await settingsAPI.getAudit(auditPage));
  }, [auditPage]);

  useEffect(() => {
    Promise.all([loadSettings(), loadAudit()])
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Không thể tải cấu hình'))
      .finally(() => setLoading(false));
  }, [loadSettings, loadAudit]);

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
      toast.success('Đã lưu cấu hình');
      await loadAudit();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể lưu cấu hình');
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
      toast.success('Đã tải ảnh lên và lưu');
      await loadAudit();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải ảnh lên');
    } finally {
      setUploading(null);
    }
  };

  const resetSettings = async () => {
    if (!window.confirm('Khôi phục thương hiệu và bảo trì về mặc định? Thao tác này sẽ tắt bảo trì và được ghi vào nhật ký.')) return;
    setSaving(true);
    try {
      const response = await settingsAPI.reset();
      setSettings(response.data);
      setScheduledStart('');
      setScheduledEnd('');
      toast.success('Đã khôi phục cấu hình mặc định');
      await loadAudit();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể khôi phục cấu hình');
    } finally {
      setSaving(false);
    }
  };

  const updateBranding = (field: keyof StoreSettingsRecord['branding'], value: string) => {
    setSettings((current) => ({ ...current, branding: { ...current.branding, [field]: value } }));
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">Đang tải cấu hình…</div>;

  const assetInputs: Array<{ field: AssetField; label: string; value: string }> = [
    { field: 'logo', label: 'Logo chính', value: settings.branding.logoUrl },
    { field: 'darkLogo', label: 'Logo nền tối', value: settings.branding.darkLogoUrl },
    { field: 'favicon', label: 'Favicon', value: settings.branding.faviconUrl },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600"><Settings2 className="h-5 w-5" /></div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Cấu hình cửa hàng</h1>
          <p className="mt-2 text-sm text-slate-600">Thương hiệu storefront và thông báo bảo trì.</p>
        </div>
        <p className="text-xs text-slate-500">Phiên bản {settings.version}{settings.updatedAt ? ` · Cập nhật ${new Date(settings.updatedAt).toLocaleString()}` : ''}</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900">Thương hiệu và liên hệ</h2>
          <p className="mt-1 text-sm text-slate-500">Ảnh được kiểm tra định dạng và tải qua kho asset hiện có.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
            Tên cửa hàng
            <input value={settings.branding.storeName} maxLength={120} onChange={(event) => updateBranding('storeName', event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
          </label>
          <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
            Email hỗ trợ
            <input type="email" value={settings.branding.supportEmail} maxLength={254} onChange={(event) => updateBranding('supportEmail', event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
          </label>
          {assetInputs.map(({ field, label, value }) => (
            <div key={field} className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-sm font-medium text-slate-700">{label}</p>
              <div className="flex min-h-24 items-center justify-center rounded-lg bg-slate-50 p-3">
                {(previews[field] || value) ? <img src={previews[field] || value} alt={`${label} xem trước`} className="max-h-20 max-w-full object-contain" /> : <span className="text-xs text-slate-400">Chưa có ảnh</span>}
              </div>
              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {uploading === field ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                Chọn ảnh
                <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only" disabled={uploading !== null} onChange={(event) => { void uploadAsset(field, event.target.files?.[0]); event.currentTarget.value = ''; }} />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Thông báo bảo trì</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Khi bật, storefront chuyển đến trang thông báo. API, callback thanh toán, health check và Super Admin vẫn được truy cập.</p>
          </div>
          <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-800">
            <input type="checkbox" checked={settings.maintenance.enabled} onChange={(event) => setSettings((current) => ({ ...current, maintenance: { ...current.maintenance, enabled: event.target.checked } }))} className="h-5 w-5 accent-red-600" />
            {settings.maintenance.enabled ? 'Đang bật' : 'Đang tắt'}
          </label>
        </div>
        <label className="mt-6 block text-sm font-medium text-slate-700">
          Nội dung thông báo
          <textarea value={settings.maintenance.message} maxLength={1000} rows={4} onChange={(event) => setSettings((current) => ({ ...current, maintenance: { ...current.maintenance, message: event.target.value } }))} className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" placeholder="Website đang được nâng cấp. Vui lòng quay lại sau." />
        </label>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">Bắt đầu dự kiến<input type="datetime-local" value={scheduledStart} onChange={(event) => setScheduledStart(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
          <label className="block text-sm font-medium text-slate-700">Kết thúc dự kiến<input type="datetime-local" value={scheduledEnd} onChange={(event) => setScheduledEnd(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" onClick={() => void resetSettings()} disabled={saving || uploading !== null} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RotateCcw className="h-4 w-4" />Khôi phục mặc định</button>
        <button type="button" onClick={() => void saveSettings()} disabled={saving || uploading !== null} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Lưu cấu hình</button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div><h2 className="text-lg font-semibold text-slate-900">Nhật ký thay đổi</h2><p className="mt-1 text-sm text-slate-500">Chỉ lưu người thao tác, trường thay đổi và phiên bản.</p></div>
          <span className="text-xs text-slate-500">{audit?.pagination.total || 0} bản ghi</span>
        </div>
        <div className="divide-y divide-slate-100">
          {audit?.data.map((entry) => (
            <div key={entry._id} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto] sm:gap-4">
              <p className="font-medium text-slate-800">{entry.action === 'reset' ? 'Khôi phục mặc định' : entry.action === 'logo_upload' ? 'Tải asset thương hiệu' : 'Cập nhật cấu hình'} · v{entry.version}<span className="block text-xs font-normal text-slate-500">{entry.changedFields.join(', ')}</span></p>
              <p className="text-xs text-slate-500 sm:text-right">{entry.userName || 'Super Admin'} · {new Date(entry.createdAt).toLocaleString()}</p>
            </div>
          ))}
          {!audit?.data.length && <p className="py-6 text-center text-sm text-slate-500">Chưa có thay đổi.</p>}
        </div>
        {(audit?.pagination.totalPages || 0) > 1 && <div className="mt-5 flex items-center justify-end gap-3 text-sm"><button type="button" disabled={auditPage <= 1} onClick={() => setAuditPage((page) => page - 1)} className="rounded-md border px-3 py-1.5 disabled:opacity-40">Trước</button><span>{auditPage} / {audit?.pagination.totalPages}</span><button type="button" disabled={auditPage >= (audit?.pagination.totalPages || 1)} onClick={() => setAuditPage((page) => page + 1)} className="rounded-md border px-3 py-1.5 disabled:opacity-40">Sau</button></div>}
      </section>
    </div>
  );
}

export default withAdminLayout(SettingsAdminPage, { permission: 'super-admin', featureName: 'Cấu hình cửa hàng' });
