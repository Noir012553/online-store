import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, ChevronLeft, ChevronRight, Clock3, Eye, Plus, Search, Settings2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import {
  providerCatalogAPI,
  providerConfigurationAPI,
  type ProviderCatalogCategory,
  type ProviderCatalogEntry,
  type ProviderCatalogKeyValue,
  type ProviderConfigField,
  type ProviderRegistryItem,
  type ProviderRuntimeEntry,
  type ProviderRuntimeField,
  type ProviderSetupGuide,
} from '../../lib/api';

const CATEGORY_LABELS: Record<ProviderCatalogCategory, string> = {
  email: 'Email',
  payment: 'Thanh toán',
  shipping: 'Vận chuyển',
  deploy: 'Deploy',
  storage: 'Lưu trữ',
  ai: 'AI',
};

const EMPTY_FORM: { name: string; keyValues: ProviderCatalogKeyValue[] } = { name: '', keyValues: [] };
const CONFIG_SCHEMA_CODES = new Set(['paypal', 'momo', 'sendgrid', 'vercel', 'render']);
const SENSITIVE_CATALOG_VALUE = /\b(api[\s_-]*key|access[\s_-]*key|secret|token|password|credential|authorization|bearer)\b/i;

export const getServerSideProps = async () => ({ props: {} });

function ProviderCatalogPage() {
  const [registry, setRegistry] = useState<ProviderRegistryItem[]>([]);
  const [items, setItems] = useState<ProviderCatalogEntry[]>([]);
  const [selected, setSelected] = useState<ProviderCatalogEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProviderCatalogEntry | null>(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState<ProviderCatalogEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [hardDeleting, setHardDeleting] = useState(false);
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof providerCatalogAPI.getAudit>> | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [configFields, setConfigFields] = useState<ProviderConfigField[]>([]);
  const [schemaGuide, setSchemaGuide] = useState<ProviderSetupGuide | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [configDirty, setConfigDirty] = useState(false);
  const [configuredSecrets, setConfiguredSecrets] = useState<string[]>([]);
  const [configVersion, setConfigVersion] = useState(0);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [revealingField, setRevealingField] = useState<string | null>(null);
  const [reauthPassword, setReauthPassword] = useState('');
  const [deleteConfigOpen, setDeleteConfigOpen] = useState(false);
  const [deleteConfigPassword, setDeleteConfigPassword] = useState('');
  const [configActionBusy, setConfigActionBusy] = useState(false);
  const [configStoreAvailable, setConfigStoreAvailable] = useState(true);
  const [runtimeView, setRuntimeView] = useState(false);
  const [runtimeProviders, setRuntimeProviders] = useState<ProviderRuntimeEntry[]>([]);
  const [runtimeSelectedCode, setRuntimeSelectedCode] = useState('vnpay');
  const [runtimeFields, setRuntimeFields] = useState<ProviderRuntimeField[]>([]);
  const [runtimeStatus, setRuntimeStatus] = useState<'loading' | 'loaded' | 'unavailable'>('loading');
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeRevealOpen, setRuntimeRevealOpen] = useState(false);
  const [runtimeRevealKey, setRuntimeRevealKey] = useState('');
  const [runtimeReauthPassword, setRuntimeReauthPassword] = useState('');
  const [runtimeSecret, setRuntimeSecret] = useState('');
  const [runtimeSecretBusy, setRuntimeSecretBusy] = useState(false);
  const [runtimeEditing, setRuntimeEditing] = useState(false);
  const [vnpayValues, setVnpayValues] = useState<Record<string, string>>({});
  const [vnpayCheckoutEnabled, setVnpayCheckoutEnabled] = useState(false);
  const [selectedCode, setSelectedCode] = useState('smtp');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'deleted'>('active');
  const [page, setPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<'backend-missing' | 'load-failed' | null>(null);
  const [saving, setSaving] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  const loadList = useCallback(async () => {
    const response = await providerCatalogAPI.list({ page, pageSize: 10, status, category, search });
    setItems(response.data);
    setPageInfo(response.pagination);
  }, [page, status, category, search]);

  const loadRegistry = useCallback(async () => {
    const response = await providerCatalogAPI.getRegistry();
    setRegistry(response.data);
  }, []);

  const loadAudit = useCallback(async (entry: ProviderCatalogEntry, pageNumber = auditPage) => {
    setAudit(await providerCatalogAPI.getAudit(entry._id, pageNumber));
  }, [auditPage]);

  const loadRuntimeStatus = useCallback(async () => {
    try {
      const response = await providerConfigurationAPI.getRuntimeProviders();
      setRuntimeProviders(response.data);
      setRuntimeStatus('loaded');
    } catch {
      setRuntimeStatus('unavailable');
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadRegistry(), loadList(), loadRuntimeStatus()]);
      setLoadError(null);
    } catch (error) {
      const apiError = error as Error & { code?: string; status?: number };
      setLoadError(apiError.code === 'ROUTE_NOT_FOUND' || apiError.status === 404 ? 'backend-missing' : 'load-failed');
    } finally {
      setLoading(false);
    }
  }, [loadList, loadRegistry, loadRuntimeStatus]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedRegistry = useMemo(() => registry.find((provider) => provider.code === selectedCode), [registry, selectedCode]);
  const selectedRuntimeProvider = useMemo(() => runtimeProviders.find((provider) => provider.providerCode === selected?.providerCode), [runtimeProviders, selected?.providerCode]);
  const runtimeSelectedProvider = useMemo(() => runtimeProviders.find((provider) => provider.providerCode === runtimeSelectedCode), [runtimeProviders, runtimeSelectedCode]);
  const availableProviders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (status !== 'active' || pageInfo.total > 0) return [];
    return registry.filter((provider) => (
      (!category || provider.category === category)
      && (!normalizedSearch || `${provider.name} ${provider.code}`.toLowerCase().includes(normalizedSearch))
    ));
  }, [category, pageInfo.total, registry, search, status]);

  const openRuntimeProviders = async () => {
    setRuntimeEditing(false);
    setRuntimeView(true);
    setSelected(null);
    setEditing(false);
    setAudit(null);
    setRuntimeSecret('');
    setRuntimeRevealOpen(false);
    setRuntimeRevealKey('');
    setRuntimeReauthPassword('');
    setRuntimeLoading(true);
    try {
      const response = await providerConfigurationAPI.getRuntimeProviders();
      setRuntimeProviders(response.data);
      setRuntimeStatus('loaded');
      const preferred = response.data.find((provider) => provider.status === 'configured') || response.data.find((provider) => provider.providerCode === 'vnpay') || response.data[0];
      if (preferred) {
        setRuntimeSelectedCode(preferred.providerCode);
        setRuntimeFields(preferred.fields);
      }
    } catch (error) {
      const apiError = error as Error & { code?: string };
      setRuntimeStatus('unavailable');
      toast.error(apiError.code === 'PROVIDER_NOT_FOUND'
        ? 'Backend đang chạy bản cũ và định tuyến nhầm API runtime. Hãy cập nhật backend rồi khởi động lại dịch vụ.'
        : error instanceof Error ? error.message : 'Không thể đọc cấu hình runtime provider');
    } finally {
      setRuntimeLoading(false);
    }
  };

  const editVnpayRuntime = () => {
    const provider = runtimeProviders.find((item) => item.providerCode === 'vnpay');
    const values = Object.fromEntries((provider?.fields || []).map((field) => [field.key, field.value || '']));
    setVnpayValues(values);
    setVnpayCheckoutEnabled(values.VNPAY_CHECKOUT_ENABLED === 'true');
    setRuntimeSecret('');
    setRuntimeReauthPassword('');
    setRuntimeEditing(true);
  };

  const saveVnpayRuntime = async () => {
    setRuntimeSecretBusy(true);
    try {
      await providerConfigurationAPI.saveVnpayRuntime({
        ...vnpayValues,
        VNPAY_HASH_SECRET: runtimeSecret,
        VNPAY_CHECKOUT_ENABLED: vnpayCheckoutEnabled,
        password: runtimeReauthPassword,
      });
      const response = await providerConfigurationAPI.getRuntimeProvider('vnpay');
      setRuntimeProviders((current) => current.map((provider) => provider.providerCode === 'vnpay' ? response.data : provider));
      if (runtimeSelectedCode === 'vnpay') setRuntimeFields(response.data.fields);
      setRuntimeEditing(false);
      setRuntimeSecret('');
      setRuntimeReauthPassword('');
      toast.success(`Đã áp dụng cấu hình VNPay phiên bản ${response.data.configurationVersion || 1}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể lưu cấu hình VNPay');
    } finally {
      setRuntimeSecretBusy(false);
    }
  };

  const selectRuntimeProvider = (providerCode: string) => {
    setRuntimeEditing(false);
    const provider = runtimeProviders.find((item) => item.providerCode === providerCode);
    setRuntimeSelectedCode(providerCode);
    setRuntimeFields(provider?.fields || []);
    setRuntimeSecret('');
    setRuntimeRevealOpen(false);
    setRuntimeRevealKey('');
    setRuntimeReauthPassword('');
  };

  const revealRuntimeSecret = async () => {
    if (!runtimeReauthPassword || !runtimeRevealKey) return;
    setRuntimeSecretBusy(true);
    try {
      const response = await providerConfigurationAPI.revealRuntimeSecret(runtimeSelectedCode, runtimeRevealKey, runtimeReauthPassword);
      setRuntimeSecret(response.data.value);
      setRuntimeReauthPassword('');
      setRuntimeRevealOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể hiển thị secret');
    } finally {
      setRuntimeSecretBusy(false);
    }
  };

  const loadProviderConfig = async (code: string, providerId?: string) => {
    setConfigDirty(false);
    setConfigFields([]);
    setSchemaGuide(null);
    setConfigValues({});
    setConfiguredSecrets([]);
    setConfigVersion(0);
    setRevealedSecrets({});
    setRevealingField(null);
    setReauthPassword('');
    setDeleteConfigOpen(false);
    setDeleteConfigPassword('');
    setConfigStoreAvailable(false);
    if (!CONFIG_SCHEMA_CODES.has(code)) {
      setConfigStoreAvailable(true);
      return;
    }
    try {
      const schemaResponse = await providerConfigurationAPI.getSchema(code);
      let values = Object.fromEntries(schemaResponse.data.fields.map((field) => [field.key, field.defaultValue || '']));
      let secrets: string[] = [];
      setConfigStoreAvailable(schemaResponse.data.storeAvailable);
      if (providerId) {
        const configResponse = await providerConfigurationAPI.get(providerId);
        values = { ...values, ...configResponse.data.values };
        secrets = configResponse.data.configuredSecrets;
        setConfigVersion(configResponse.data.version);
        setConfigStoreAvailable(configResponse.data.storeAvailable);
      } else {
        setConfigStoreAvailable(true);
      }
      setConfigFields(schemaResponse.data.fields);
      setSchemaGuide(schemaResponse.data.setupGuide);
      setConfigValues(values);
      setConfiguredSecrets(secrets);
    } catch (error) {
      const apiError = error as Error & { code?: string };
      setConfigFields([]);
      setSchemaGuide(null);
      setConfigValues({});
      setConfiguredSecrets([]);
      setConfigVersion(0);
      if (apiError.code === 'PROVIDER_CONFIG_UNSUPPORTED') {
        setConfigStoreAvailable(true);
        return;
      }
      setConfigStoreAvailable(false);
      toast.error(error instanceof Error ? error.message : 'Không thể tải schema cấu hình');
    }
  };

  const openCreate = (code = selectedCode) => {
    const provider = registry.find((item) => item.code === code);
    setRuntimeView(false);
    setRuntimeSecret('');
    setRuntimeRevealKey('');
    setRuntimeRevealOpen(false);
    setRuntimeReauthPassword('');
    setSelected(null);
    setSelectedCode(code);
    setForm({ ...EMPTY_FORM, name: provider?.name || '' });
    setEditing(true);
    setAudit(null);
    void loadProviderConfig(code);
  };

  const openEntry = async (entry: ProviderCatalogEntry) => {
    setRuntimeView(false);
    setRuntimeSecret('');
    setRuntimeRevealKey('');
    setRuntimeRevealOpen(false);
    setRuntimeReauthPassword('');
    setSelected(entry);
    setSelectedCode(entry.providerCode);
    setAuditPage(1);
    setForm({ name: entry.name, keyValues: entry.keyValues || [] });
    setEditing(false);
    void loadProviderConfig(entry.providerCode, entry._id);
    try {
      await loadAudit(entry, 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải nhật ký');
    }
  };

  const editEntry = async (entry: ProviderCatalogEntry) => {
    setEditLoading(true);
    try {
      const response = await providerCatalogAPI.getById(entry._id);
      setSelected(response.data);
      setSelectedCode(response.data.providerCode);
      setForm({ name: response.data.name, keyValues: response.data.keyValues || [] });
      setEditing(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải hồ sơ để chỉnh sửa');
    } finally {
      setEditLoading(false);
    }
  };

  const save = async () => {
    const provider = registry.find((item) => item.code === selectedCode);
    if (!selected && !provider) return;
    setSaving(true);
    let catalogSaved = false;
    try {
      let entry = selected;
      if (selected) {
        const response = await providerCatalogAPI.update(selected._id, { ...form, keyValues: form.keyValues || [] });
        entry = response.data;
      } else {
        const response = await providerCatalogAPI.create({
          ...form,
          keyValues: form.keyValues || [],
          category: provider!.category,
          providerCode: provider!.code,
        });
        entry = response.data;
        setSelected(entry);
        setStatus('active');
        setPage(1);
      }
      if (entry) {
        catalogSaved = true;
        setSelected(entry);
      }
      if (configDirty && configFields.length && entry) {
        const configResponse = await providerConfigurationAPI.save(entry._id, configValues);
        setConfigVersion(configResponse.data.version);
        setConfiguredSecrets(configFields.filter((field) => field.type === 'secret' && (configValues[field.key] || configuredSecrets.includes(field.key))).map((field) => field.key));
        setConfigValues((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, configFields.some((field) => field.key === key && field.type === 'secret') ? '' : value])));
      }
      setSelected(entry);
      setConfigDirty(false);
      toast.success(configDirty ? (selected ? 'Đã lưu hồ sơ và cấu hình' : 'Đã tạo hồ sơ và cấu hình') : (selected ? 'Đã lưu hồ sơ' : 'Đã tạo hồ sơ'));
      if (!selected && entry) await loadAudit(entry, 1);
      setEditing(false);
      await Promise.all([loadList(), selected ? loadAudit(selected) : Promise.resolve()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể lưu hồ sơ';
      toast.error(catalogSaved ? `Hồ sơ đã lưu, nhưng cấu hình chưa được lưu: ${message}` : message);
    } finally {
      setSaving(false);
    }
  };

  const revealSecret = async (key: string) => {
    if (!selected || !reauthPassword) return;
    setConfigActionBusy(true);
    try {
      const response = await providerConfigurationAPI.reveal(selected._id, key, reauthPassword);
      setRevealedSecrets((current) => ({ ...current, [key]: response.data.value }));
      setReauthPassword('');
      setRevealingField(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể hiển thị secret');
    } finally {
      setConfigActionBusy(false);
    }
  };

  const deleteConfiguration = async () => {
    if (!selected || !deleteConfigPassword) return;
    setConfigActionBusy(true);
    try {
      await providerConfigurationAPI.remove(selected._id, deleteConfigPassword);
      setConfigValues({});
      setConfiguredSecrets([]);
      setConfigVersion(0);
      setRevealedSecrets({});
      setDeleteConfigOpen(false);
      setDeleteConfigPassword('');
      toast.success('Đã xóa toàn bộ cấu hình credentials');
      await loadAudit(selected, 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể xóa cấu hình');
    } finally {
      setConfigActionBusy(false);
    }
  };

  const remove = (entry: ProviderCatalogEntry) => setDeleteTarget(entry);

  const confirmRemove = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await providerCatalogAPI.remove(deleteTarget._id);
      toast.success('Đã chuyển hồ sơ vào mục đã xóa');
      setSelected(null);
      setDeleteTarget(null);
      await loadList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể xóa hồ sơ');
    } finally {
      setDeleting(false);
    }
  };

  const restore = async (entry: ProviderCatalogEntry) => {
    try {
      const response = await providerCatalogAPI.restore(entry._id);
      toast.success('Đã khôi phục hồ sơ');
      setSelected(response.data);
      setStatus('active');
      setPage(1);
      await loadList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể khôi phục hồ sơ');
    }
  };

  const confirmHardDelete = async () => {
    if (!hardDeleteTarget || hardDeleting) return;
    setHardDeleting(true);
    try {
      await providerCatalogAPI.hardDelete(hardDeleteTarget._id);
      toast.success('Đã xóa vĩnh viễn hồ sơ');
      if (selected?._id === hardDeleteTarget._id) setSelected(null);
      setHardDeleteTarget(null);
      await loadList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể xóa vĩnh viễn hồ sơ');
    } finally {
      setHardDeleting(false);
    }
  };

  const catalogKeyValues = form.keyValues || [];
  const normalizedKeys = catalogKeyValues.map((pair) => pair.key.trim().toLowerCase());
  const hasInvalidKeyValues = catalogKeyValues.some((pair) => (
    !pair.key.trim()
    || pair.key.length > 100
    || pair.value.length > 2048
    || SENSITIVE_CATALOG_VALUE.test(pair.key)
    || SENSITIVE_CATALOG_VALUE.test(pair.value)
  )) || new Set(normalizedKeys).size !== normalizedKeys.length;

  const setFilter = (update: () => void) => {
    update();
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-7 pb-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600"><Settings2 className="h-5 w-5" /></div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Catalog nhà cung cấp</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Quản lý hồ sơ tham khảo theo nhóm. Catalog không lưu credentials, không bật checkout và không thực hiện deploy hay thay đổi runtime.</p>
        </div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void openRuntimeProviders()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 px-4 py-2.5 text-sm font-medium text-blue-800 hover:bg-blue-50">Xem runtime tất cả provider</button><button type="button" disabled={loading || Boolean(loadError) || !registry.length} onClick={() => openCreate()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />Thêm hồ sơ</button></div>
      </header>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <strong>Trạng thái adapter không đồng nghĩa với trạng thái kết nối.</strong> “Có adapter” chỉ xác nhận backend có luồng tương ứng; cấu hình/credential vẫn được quản lý ngoài catalog. Provider chưa có adapter được đánh dấu rõ và không thể kích hoạt tại đây.
      </section>

      <div className="grid gap-6">
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setFilter(() => setStatus('active'))} className={`rounded-full px-4 py-2 text-sm font-medium ${status === 'active' ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>Hồ sơ hiện tại</button>
            <button type="button" onClick={() => setFilter(() => setStatus('deleted'))} className={`rounded-full px-4 py-2 text-sm font-medium ${status === 'deleted' ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>Đã xóa mềm</button>
          </div>
          <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_180px]">
            <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" name="providerCatalogSearch" autoComplete="off" value={search} onChange={(event) => setFilter(() => setSearch(event.target.value))} placeholder="Tìm theo tên hoặc mã" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" /></label>
            <select value={category} onChange={(event) => setFilter(() => setCategory(event.target.value))} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700"><option value="">Tất cả nhóm</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
          </div>
          {loading ? <p className="py-10 text-center text-sm text-slate-500">Đang tải catalog…</p> : loadError ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-8 text-center text-sm text-amber-950"><p className="font-semibold">{loadError === 'backend-missing' ? 'Backend chưa có API catalog.' : 'Không thể tải catalog.'}</p><p className="mx-auto mt-2 max-w-md leading-6">{loadError === 'backend-missing' ? 'Hãy triển khai phiên bản backend có các route /api/settings/providers trên môi trường preview hoặc staging rồi thử lại. Không có dữ liệu mẫu được hiển thị.' : 'Kiểm tra kết nối và quyền Super Admin rồi thử lại.'}</p><button type="button" onClick={() => void loadData()} className="mt-4 rounded-lg border border-amber-400 px-4 py-2 font-medium hover:bg-amber-100">Thử lại</button></div> : items.length ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Nhà cung cấp</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Nhóm</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Trạng thái</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Khả năng</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((entry) => (
                    <tr key={entry._id} className={`transition-colors ${selected?._id === entry._id ? 'bg-red-50/50' : 'hover:bg-slate-50'}`}>
                      <td className="px-4 py-3"><p className="font-medium text-slate-900">{entry.name}</p><p className="mt-1 text-xs text-slate-500">{entry.providerCode} · hồ sơ v{entry.version}</p></td>
                      <td className="px-4 py-3 text-slate-700">{CATEGORY_LABELS[entry.category]}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${entry.isDeleted ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-800'}`}>{entry.isDeleted ? 'Đã xóa mềm' : 'Hiện tại'}</span></td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${entry.capability === 'not-implemented' || entry.capability === 'not-verified' || entry.capability === 'launcher-only' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{entry.capability === 'not-implemented' ? 'Chưa tích hợp' : entry.capability === 'not-verified' ? 'Chưa xác minh' : entry.capability === 'launcher-only' ? 'Chỉ có launcher' : entry.capability === 'payment-method' ? 'Phương thức hiện có' : 'Có adapter'}</span><p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{entry.capabilityNote}</p></td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => void openEntry(entry)} aria-label="Xem" title="Xem" className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-white"><Eye className="h-4 w-4" aria-hidden="true" /></button>{entry.isDeleted ? <><button type="button" onClick={() => void restore(entry)} aria-label="Khôi phục" title="Khôi phục" className="rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50"><ArchiveRestore className="h-4 w-4" aria-hidden="true" /></button><button type="button" onClick={() => setHardDeleteTarget(entry)} aria-label="Xóa cứng" title="Xóa cứng" className="rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></> : <button type="button" onClick={() => void remove(entry)} aria-label="Xóa mềm" title="Xóa mềm" className="rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : status === 'active' && pageInfo.total === 0 && availableProviders.length ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="font-semibold text-slate-800">Chưa có hồ sơ nào được lưu.</p><p className="mt-1 text-sm leading-5 text-slate-600">Các mục dưới đây là provider trong registry, chưa phải hồ sơ catalog. Chọn một mục để tạo và lưu hồ sơ.</p></div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="px-4 py-3 font-semibold">Nhà cung cấp</th><th scope="col" className="px-4 py-3 font-semibold">Nhóm / mã</th><th scope="col" className="px-4 py-3 font-semibold">Khả năng</th><th scope="col" className="px-4 py-3 text-right font-semibold">Thao tác</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{availableProviders.map((provider) => <tr key={provider.code} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-900">{provider.name}</td><td className="px-4 py-3 text-slate-600">{CATEGORY_LABELS[provider.category]}<span className="mt-1 block text-xs text-slate-500">{provider.code}</span></td><td className="px-4 py-3"><span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{provider.adapter === 'not-implemented' ? 'Chưa tích hợp' : provider.adapter === 'not-verified' ? 'Chưa xác minh' : provider.adapter === 'launcher-only' ? 'Chỉ có launcher' : provider.adapter === 'payment-method' ? 'Phương thức hiện có' : 'Có adapter'}</span><p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{provider.note}</p></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => openCreate(provider.code)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">Tạo hồ sơ</button></td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Chưa có hồ sơ phù hợp.</div>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-sm text-slate-500">
            <span className="text-xs">{pageInfo.total} hồ sơ catalog · Trang {pageInfo.page} / {Math.max(pageInfo.totalPages, 1)}</span><span className="text-xs">Runtime: {runtimeStatus === 'loading' ? 'đang đọc…' : runtimeStatus === 'unavailable' ? 'không đọc được' : `${runtimeProviders.filter((provider) => provider.status === 'configured').length} có dữ liệu · ${runtimeProviders.filter((provider) => provider.status === 'not-managed').length} chưa tích hợp đọc runtime`}</span>
            <div className="flex gap-2"><button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-md border p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><button type="button" aria-label="Trang sau" disabled={page >= pageInfo.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-md border p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div>
          </div>
        </section>

        <Dialog modal open={editing || Boolean(selected) || runtimeView} onOpenChange={(open) => {
          if (!open) {
            setEditing(false);
            setSelected(null);
            setAudit(null);
            setRuntimeView(false);
            setRuntimeEditing(false);
            setRuntimeSecret('');
            setRuntimeRevealOpen(false);
            setRuntimeRevealKey('');
            setRuntimeReauthPassword('');
            setRevealedSecrets({});
            setReauthPassword('');
          }
        }}>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto p-5 sm:p-6">
            <DialogHeader className="sr-only"><DialogTitle>{editing ? (selected ? 'Sửa hồ sơ nhà cung cấp' : 'Thêm hồ sơ nhà cung cấp') : runtimeView ? 'Cấu hình runtime nhà cung cấp' : selected?.name || 'Chi tiết hồ sơ nhà cung cấp'}</DialogTitle></DialogHeader>
          {editing ? <>
            <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">{selected ? 'Sửa hồ sơ' : 'Thêm hồ sơ'}</h2><button type="button" onClick={() => setEditing(false)} aria-label="Đóng biểu mẫu" className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
            {!selected && <label className="mb-4 block text-sm font-medium text-slate-700">Nhà cung cấp<select value={selectedCode} onChange={(event) => { const code = event.target.value; setSelectedCode(code); const match = registry.find((provider) => provider.code === code); if (match) setForm((current) => ({ ...current, name: match.name })); void loadProviderConfig(code); }} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal">{registry.map((provider) => <option key={provider.code} value={provider.code}>{CATEGORY_LABELS[provider.category]} · {provider.name} ({provider.code})</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Chỉ các provider có trong registry allowlist mới được tạo.</span></label>}
            {selected && <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{CATEGORY_LABELS[selected.category]} · {selected.providerCode}</div>}
            <label className="mb-4 block text-sm font-medium text-slate-700">Tên hồ sơ<input value={form.name} maxLength={100} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
            <section className="space-y-3">
              <div><h3 className="text-sm font-semibold text-slate-800">Key-value riêng của catalog</h3><p className="mt-1 text-xs leading-5 text-slate-500">Thông tin tham khảo cho hồ sơ này, không ảnh hưởng cấu hình runtime. Không nhập API key, token, mật khẩu hoặc secret.</p></div>
              {catalogKeyValues.map((pair, index) => <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] sm:items-end">
                <label className="block text-sm font-medium text-slate-700">Key<input maxLength={100} value={pair.key} onChange={(event) => setForm((current) => ({ ...current, keyValues: (current.keyValues || []).map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item) }))} placeholder="Ví dụ: dashboard_url" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <label className="block text-sm font-medium text-slate-700">Value<input maxLength={2048} value={pair.value} onChange={(event) => setForm((current) => ({ ...current, keyValues: (current.keyValues || []).map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) }))} placeholder="Nhập thông tin tham khảo" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <button type="button" onClick={() => setForm((current) => ({ ...current, keyValues: (current.keyValues || []).filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Xóa dòng key-value ${index + 1}`} className="rounded-lg border border-red-200 p-2.5 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>)}
              <button type="button" disabled={catalogKeyValues.length >= 50} onClick={() => setForm((current) => ({ ...current, keyValues: [...(current.keyValues || []), { key: '', value: '' }] }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Thêm key-value</button>
              {catalogKeyValues.some((pair) => SENSITIVE_CATALOG_VALUE.test(pair.key) || SENSITIVE_CATALOG_VALUE.test(pair.value)) && <p role="alert" className="text-xs text-red-700">Không lưu credentials trong catalog. Hãy dùng cấu hình provider riêng.</p>}
            </section>
            {configFields.length > 0 && <section className="mt-5 space-y-4 rounded-xl border border-slate-200 p-4">
              <div><h3 className="font-semibold text-slate-900">Cấu hình {registry.find((provider) => provider.code === selectedCode)?.name}</h3><p className="mt-1 text-xs leading-5 text-slate-600">Nhập đúng giá trị theo key hiển thị. Chỉ dùng sandbox/staging; credential được mã hóa phía backend và không tự kích hoạt adapter hoặc deploy.</p>{schemaGuide && <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"><p>{schemaGuide.note}</p><a href={schemaGuide.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center rounded-lg border border-blue-300 bg-white px-3 py-2 font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{schemaGuide.label} (mở tab mới)</a></div>}</div>
              {!configStoreAvailable && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">Kho secrets chưa sẵn sàng. Backend cần cấu hình khóa mã hóa trước khi lưu credential.</p>}
              {configFields.map((field) => <label key={field.key} className="block text-sm font-medium text-slate-700">
                <span>{field.label}{field.required ? ' *' : ''}</span>
                <code className="mt-1 block break-all text-xs font-normal text-slate-500">{field.key}</code>
                {field.helpText && <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{field.helpText}</span>}
                {field.type === 'select' ? <select value={configValues[field.key] || ''} onChange={(event) => { setConfigDirty(true); setConfigValues((current) => ({ ...current, [field.key]: event.target.value })); }} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal">{field.options?.map((option) => <option value={option} key={option}>{option}</option>)}</select> : <input type={field.type === 'secret' ? 'password' : field.type === 'url' ? 'url' : 'text'} autoComplete="new-password" value={configValues[field.key] || ''} placeholder={field.type === 'secret' && configuredSecrets.includes(field.key) ? 'Đã lưu — nhập giá trị mới để xoay vòng' : field.defaultValue || ''} onChange={(event) => { setConfigDirty(true); setConfigValues((current) => ({ ...current, [field.key]: event.target.value })); }} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />}
              </label>)}
            </section>}
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>Không nhập credential production.</strong> Catalog vẫn chỉ lưu hồ sơ; việc lưu cấu hình không có nghĩa provider đã kết nối hoặc adapter đã sẵn sàng.</div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm">Hủy</button><button type="button" disabled={saving || hasInvalidKeyValues || !form.name.trim() || (!selected && !selectedRegistry) || (configDirty && ((['paypal', 'momo', 'sendgrid', 'vercel', 'render'].includes(selectedCode) && !configStoreAvailable) || configFields.some((field) => field.required && field.type !== 'secret' && !configValues[field.key]) || configFields.some((field) => field.required && field.type === 'secret' && !configValues[field.key] && !configuredSecrets.includes(field.key))))} onClick={() => void save()} className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Đang lưu…' : 'Lưu hồ sơ'}</button></div>
          </> : runtimeView ? <>
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Nguồn runtime: {runtimeSelectedProvider?.status === 'not-managed' ? 'chưa tích hợp' : 'environment / database'}</p><h2 className="mt-1 text-xl font-semibold text-slate-950">{registry.find((provider) => provider.code === runtimeSelectedCode)?.name || runtimeSelectedCode} runtime</h2><p className="mt-1 text-sm text-slate-500">Trạng thái: {runtimeSelectedProvider?.status === 'configured' ? 'đã có dữ liệu runtime' : runtimeSelectedProvider?.status === 'incomplete' ? 'có dữ liệu runtime một phần' : runtimeSelectedProvider?.status === 'not-configured' ? 'chưa cấu hình' : 'chưa có mapping runtime'} · giá trị runtime không phải hồ sơ catalog.</p></div><button type="button" onClick={() => { setRuntimeView(false); setRuntimeSecret(''); setRuntimeRevealOpen(false); setRuntimeRevealKey(''); setRuntimeReauthPassword(''); }} aria-label="Đóng cấu hình runtime" className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
            <label className="mt-5 block text-sm font-medium text-slate-700">Provider<select value={runtimeSelectedCode} onChange={(event) => selectRuntimeProvider(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5">{runtimeProviders.map((provider) => <option key={provider.providerCode} value={provider.providerCode}>{registry.find((item) => item.code === provider.providerCode)?.name || provider.providerCode}</option>)}</select></label>
            {runtimeLoading ? <p className="py-8 text-center text-sm text-slate-500">Đang đọc cấu hình runtime…</p> : <>
              {runtimeSelectedProvider?.status === 'not-managed' && <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-5 text-slate-600">Chưa có runtime config được liên kết cho provider này. Không có giá trị nào được suy đoán hoặc lấy từ credential mẫu.</p>}
              {runtimeSelectedProvider?.status !== 'not-managed' && !runtimeFields.length && <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-5 text-slate-600">Chưa có runtime key nào được cấu hình cho provider này.</p>}
              {runtimeSelectedCode === 'vnpay' && !runtimeEditing && <button type="button" onClick={editVnpayRuntime} className="mt-4 rounded-lg border border-blue-300 px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-50">Cấu hình runtime VNPay</button>}
              {runtimeEditing && runtimeSelectedCode === 'vnpay' && <section className="mt-4 space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <div><h3 className="font-semibold text-slate-900">Chỉnh sửa runtime VNPay</h3><p className="mt-1 text-xs leading-5 text-slate-600">Cấu hình lưu mã hóa và áp dụng ngay trên backend. Đổi Hash Secret có thể khiến callback của giao dịch cũ không xác minh được. URL IPN trong cổng quản trị VNPay cần được cập nhật riêng.</p></div>
                {runtimeSelectedProvider?.storeAvailable === false && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">Kho mã hóa credential chưa sẵn sàng.</p>}
                {runtimeFields.filter((field) => field.key !== 'VNPAY_CHECKOUT_ENABLED').map((field) => <label key={field.key} className="block text-sm font-medium text-slate-700">{field.label}<code className="mt-1 block break-all text-xs font-normal text-slate-500">{field.key}</code><input type={field.type === 'secret' ? 'password' : field.type === 'url' ? 'url' : 'text'} autoComplete="new-password" value={field.type === 'secret' ? runtimeSecret : vnpayValues[field.key] || ''} placeholder={field.type === 'secret' && field.configured ? 'Đã cấu hình — nhập giá trị mới để thay' : ''} onChange={(event) => field.type === 'secret' ? setRuntimeSecret(event.target.value) : setVnpayValues((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>)}
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={vnpayCheckoutEnabled} onChange={(event) => setVnpayCheckoutEnabled(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />Cho phép thanh toán VNPay</label>
                <label className="block text-sm font-medium text-slate-700">Xác nhận mật khẩu Super Admin<input type="password" autoComplete="off" value={runtimeReauthPassword} onChange={(event) => setRuntimeReauthPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <div className="flex justify-end gap-2"><button type="button" onClick={() => { setRuntimeEditing(false); setRuntimeSecret(''); setRuntimeReauthPassword(''); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Hủy</button><button type="button" disabled={runtimeSecretBusy || !runtimeReauthPassword || runtimeSelectedProvider?.storeAvailable === false} onClick={() => void saveVnpayRuntime()} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{runtimeSecretBusy ? 'Đang lưu…' : 'Lưu & áp dụng ngay'}</button></div>
              </section>}
              <div className="mt-5 space-y-3">{runtimeFields.map((field) => <div key={field.key} className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-medium text-slate-800">{field.label}</p><code className="mt-1 block break-all text-xs text-slate-500">{field.key}</code><p className="mt-2 break-all text-sm text-slate-700">{field.type === 'secret' ? (runtimeSecret && runtimeRevealKey === field.key ? runtimeSecret : field.configured ? '•••••••• (đã cấu hình)' : 'Chưa cấu hình') : field.value || 'Chưa cấu hình'}</p><p className="mt-1 text-xs text-slate-500">{field.source === 'runtime-default' ? 'Giá trị mặc định runtime' : field.source === 'environment' ? 'Đọc từ biến môi trường' : field.source === 'database' ? 'Đọc từ MongoDB/runtime fallback' : 'Chưa có giá trị'}</p>{field.type === 'secret' && field.configured && <div className="mt-2">{runtimeSecret && runtimeRevealKey === field.key ? <button type="button" onClick={() => { setRuntimeSecret(''); setRuntimeRevealKey(''); }} className="inline-flex items-center rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Ẩn secret</button> : runtimeRevealOpen && runtimeRevealKey === field.key ? <div className="flex flex-col gap-2 sm:flex-row"><input type="password" autoComplete="off" value={runtimeReauthPassword} onChange={(event) => setRuntimeReauthPassword(event.target.value)} placeholder="Nhập lại mật khẩu Super Admin" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button type="button" disabled={runtimeSecretBusy || !runtimeReauthPassword} onClick={() => void revealRuntimeSecret()} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{runtimeSecretBusy ? 'Đang xác thực…' : 'Xác nhận & xem'}</button></div> : <button type="button" onClick={() => { setRuntimeRevealKey(field.key); setRuntimeRevealOpen(true); setRuntimeSecret(''); }} className="inline-flex items-center rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Hiện secret</button>}</div>}</div>)}</div>
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{runtimeSelectedCode === 'vnpay' ? 'Cấu hình VNPay được lưu mã hóa và áp dụng ngay; thay Hash Secret có thể khiến callback của giao dịch đang chờ không xác minh được.' : 'Đây là cấu hình đọc từ tiến trình backend hiện tại. Để thay đổi, cập nhật biến môi trường ở nơi triển khai rồi khởi động lại dịch vụ; catalog không sửa `.env`.'}</p>
            </>}
          </> : selected ? <>
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{CATEGORY_LABELS[selected.category]}</p><h2 className="mt-1 text-xl font-semibold text-slate-950">{selected.name}</h2><p className="mt-1 text-sm text-slate-500">{selected.providerCode} · phiên bản {selected.version}</p></div><button type="button" onClick={() => { setSelected(null); setAudit(null); }} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"><X className="h-4 w-4" />Đóng</button></div>
            <div className="mt-5 rounded-xl border border-slate-200 p-4"><p className="text-sm font-semibold text-slate-800">{selected.capability === 'not-implemented' ? 'Chưa tích hợp' : selected.capability === 'not-verified' ? 'Chưa xác minh' : selected.capability === 'launcher-only' ? 'Chỉ có launcher' : selected.capability === 'payment-method' ? 'Phương thức hiện có' : 'Có adapter trong backend'}</p><p className="mt-1 text-sm leading-6 text-slate-600">{selected.capabilityNote}</p><p className="mt-2 text-xs text-slate-500">Catalog không báo trạng thái kết nối hoặc khả năng xử lý giao dịch.</p></div>
            {schemaGuide && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600"><h3 className="font-semibold text-slate-900">Hướng dẫn cấu hình {selected.name}</h3><p className="mt-1">{schemaGuide.note}</p><a href={schemaGuide.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center rounded-lg border border-blue-300 bg-white px-3 py-2 font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{schemaGuide.label} (mở tab mới)</a></div>}
            {configFields.length > 0 && <section className="mt-5 rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Cấu hình đã lưu</h3><p className="mt-1 text-xs text-slate-500">{configVersion ? `Phiên bản cấu hình ${configVersion}` : 'Chưa có cấu hình được lưu.'} · secret được che mặc định.</p></div>{configVersion > 0 && !deleteConfigOpen && <button type="button" onClick={() => setDeleteConfigOpen(true)} className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50">Xóa cấu hình</button>}</div><div className="mt-4 space-y-3">{configFields.map((field) => { const isSecret = field.type === 'secret'; const isConfigured = isSecret ? configuredSecrets.includes(field.key) : Boolean(configValues[field.key]); return <div key={field.key} className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-medium text-slate-800">{field.label}</p><code className="mt-1 block break-all text-xs text-slate-500">{field.key}</code><p className="mt-2 break-all text-sm text-slate-700">{isSecret ? (revealedSecrets[field.key] || (isConfigured ? '•••••••• (đã cấu hình)' : 'Chưa cấu hình')) : (configVersion > 0 && configValues[field.key] ? configValues[field.key] : 'Chưa cấu hình')}</p>{isSecret && isConfigured && <div className="mt-2">{revealedSecrets[field.key] ? <button type="button" onClick={() => setRevealedSecrets((current) => { const next = { ...current }; delete next[field.key]; return next; })} className="inline-flex items-center rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Ẩn secret</button> : revealingField === field.key ? <div className="flex flex-wrap gap-2"><input type="password" autoComplete="off" value={reauthPassword} onChange={(event) => setReauthPassword(event.target.value)} placeholder="Nhập lại mật khẩu Siêu Admin" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs" /><button type="button" disabled={!reauthPassword || configActionBusy} onClick={() => void revealSecret(field.key)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white disabled:opacity-50">{configActionBusy ? 'Đang xác minh…' : 'Xác nhận xem'}</button><button type="button" onClick={() => { setRevealingField(null); setReauthPassword(''); }} className="rounded-lg border px-3 py-2 text-xs">Hủy</button></div> : <button type="button" onClick={() => setRevealingField(field.key)} className="inline-flex items-center rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Hiện secret</button>}</div>}</div>; })}</div>{deleteConfigOpen && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3"><p className="text-sm font-medium text-red-900">Xóa toàn bộ cấu hình credentials?</p><p className="mt-1 text-xs leading-5 text-red-800">Thao tác này chỉ xóa key/value của provider, không xóa hồ sơ catalog. Nhập lại mật khẩu Siêu Admin để xác nhận.</p><input type="password" autoComplete="off" value={deleteConfigPassword} onChange={(event) => setDeleteConfigPassword(event.target.value)} placeholder="Mật khẩu Siêu Admin" className="mt-3 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm" /><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => { setDeleteConfigOpen(false); setDeleteConfigPassword(''); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">Hủy</button><button type="button" disabled={!deleteConfigPassword || configActionBusy} onClick={() => void deleteConfiguration()} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{configActionBusy ? 'Đang xóa…' : 'Xác nhận xóa'}</button></div></div>}</section>}
            <section className="mt-5 space-y-4">
              <div><h3 className="text-sm font-semibold text-slate-800">Key-value cấu hình</h3><p className="mt-1 text-xs text-slate-500">Thông tin tham khảo trong catalog và cấu hình runtime được hiển thị riêng.</p></div>
              {(selected.keyValues || []).length > 0 && <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-medium text-slate-800">Key-value trong catalog</h4>
                <dl className="mt-3 space-y-2">{(selected.keyValues || []).map((pair, index) => <div key={`${pair.key}-${index}`} className="grid gap-1 rounded-lg bg-slate-50 p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><dt className="break-all text-xs font-semibold text-slate-600">{pair.key}</dt><dd className="break-all whitespace-pre-wrap text-sm text-slate-800">{pair.value || '—'}</dd></div>)}</dl>
              </div>}
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium text-slate-800">Runtime hiện tại · chỉ đọc</h4>{selected.providerCode === 'vnpay' && <button type="button" disabled={runtimeStatus !== 'loaded'} onClick={() => { setRuntimeEditing(false); setRuntimeView(true); setRuntimeSelectedCode('vnpay'); setRuntimeFields(runtimeProviders.find((provider) => provider.providerCode === 'vnpay')?.fields || []); }} className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-50 disabled:opacity-50">Sửa cấu hình VNPay</button>}<span className="text-xs text-slate-500">{runtimeStatus === 'loading' ? 'Đang tải' : runtimeStatus === 'unavailable' ? 'Không đọc được' : selectedRuntimeProvider?.status === 'configured' ? 'Đã cấu hình' : selectedRuntimeProvider?.status === 'incomplete' ? 'Cấu hình một phần' : selectedRuntimeProvider?.status === 'not-configured' ? 'Chưa cấu hình' : 'Chưa có mapping'}</span></div>
                {runtimeStatus === 'loading' ? <p className="mt-3 text-sm text-slate-500">Đang đọc runtime từ backend…</p> : runtimeStatus === 'unavailable' ? <p className="mt-3 text-sm text-slate-600">Backend hiện không trả được dữ liệu runtime. Kiểm tra route provider-configs/runtime.</p> : selectedRuntimeProvider?.managed ? <>{selectedRuntimeProvider.fields.some((field) => field.configured) ? <dl className="mt-3 space-y-2">{selectedRuntimeProvider.fields.filter((field) => field.configured).map((field) => <div key={field.key} className="grid gap-1 rounded-lg bg-white p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><dt className="break-all text-xs font-semibold text-slate-600">{field.key}</dt><dd className="break-all whitespace-pre-wrap text-sm text-slate-800">{field.type === 'secret' ? '•••••••• (đã cấu hình)' : field.value || '—'}</dd><p className="sm:col-span-2 text-xs text-slate-500">{field.source === 'environment' ? 'Nguồn: biến môi trường' : field.source === 'database' ? 'Nguồn: MongoDB' : 'Nguồn: mặc định runtime'}</p></div>)}</dl> : <p className="mt-2 text-sm text-slate-500">Chưa có runtime key nào được cấu hình cho provider này.</p>}</> : <p className="mt-3 text-sm text-slate-600">Chưa có runtime mapping cho provider này.</p>}
              </div>
            </section>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">{selected.isDeleted ? <button type="button" onClick={() => void restore(selected)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"><ArchiveRestore className="h-4 w-4" />Khôi phục</button> : <><button type="button" disabled={editLoading} onClick={() => void editEntry(selected)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">{editLoading ? 'Đang tải…' : 'Sửa hồ sơ'}</button><button type="button" onClick={() => void remove(selected)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" />Xóa mềm</button></>}</div>
            <div className="mt-6 border-t border-slate-100 pt-5"><div className="mb-3 flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-500" /><h3 className="text-sm font-semibold text-slate-800">Nhật ký</h3></div><div className="space-y-3">{audit?.data.map((record) => <div key={record._id} className="border-l-2 border-slate-200 pl-3 text-xs"><p className="font-medium text-slate-700">{record.action} · v{record.version}</p><p className="mt-1 text-slate-500">{record.changedFields.join(', ')}</p><p className="mt-1 text-slate-500">{record.userName || 'Super Admin'} · {new Date(record.createdAt).toLocaleString()}</p></div>)}{audit && !audit.data.length && <p className="text-xs text-slate-500">Chưa có nhật ký.</p>}</div>{(audit?.pagination.totalPages || 0) > 1 && <div className="mt-4 flex items-center justify-end gap-2 text-xs"><button type="button" disabled={auditPage <= 1} onClick={() => { const nextPage = auditPage - 1; setAuditPage(nextPage); if (selected) void loadAudit(selected, nextPage); }} className="rounded border px-2 py-1 disabled:opacity-40">Trước</button><span>{auditPage} / {audit?.pagination.totalPages}</span><button type="button" disabled={auditPage >= (audit?.pagination.totalPages || 1)} onClick={() => { const nextPage = auditPage + 1; setAuditPage(nextPage); if (selected) void loadAudit(selected, nextPage); }} className="rounded border px-2 py-1 disabled:opacity-40">Sau</button></div>}</div>
          </> : <div className="flex min-h-80 flex-col items-center justify-center text-center"><div className="mb-3 rounded-2xl bg-slate-100 p-3 text-slate-500"><Settings2 className="h-5 w-5" /></div><h2 className="font-semibold text-slate-800">Chọn một hồ sơ</h2><p className="mt-1 max-w-xs text-sm leading-6 text-slate-500">Xem các trường đã lưu, trạng thái tích hợp và nhật ký thay đổi.</p></div>}
          </DialogContent>
        </Dialog>
        <Dialog modal open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Xóa mềm hồ sơ?</DialogTitle></DialogHeader>
            <p className="text-sm leading-6 text-slate-600">Hồ sơ “{deleteTarget?.name}” sẽ được chuyển vào mục đã xóa mềm. Nhật ký vẫn được giữ lại.</p>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">Hủy</button>
              <button type="button" disabled={deleting} onClick={() => void confirmRemove()} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50">{deleting ? 'Đang xóa…' : 'Xóa mềm'}</button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog modal open={Boolean(hardDeleteTarget)} onOpenChange={(open) => !open && !hardDeleting && setHardDeleteTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Xóa vĩnh viễn hồ sơ?</DialogTitle></DialogHeader>
            <p className="text-sm leading-6 text-slate-600">Hồ sơ “{hardDeleteTarget?.name}” và cấu hình credentials liên kết sẽ bị xóa vĩnh viễn. Nhật ký thay đổi được giữ lại; thao tác này không thể hoàn tác.</p>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={hardDeleting} onClick={() => setHardDeleteTarget(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">Hủy</button>
              <button type="button" disabled={hardDeleting} onClick={() => void confirmHardDelete()} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50">{hardDeleting ? 'Đang xóa…' : 'Xóa vĩnh viễn'}</button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default withAdminLayout(ProviderCatalogPage, { permission: 'super-admin', featureName: 'Catalog nhà cung cấp' });
