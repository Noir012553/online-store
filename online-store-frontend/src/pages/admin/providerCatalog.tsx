import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, ChevronLeft, ChevronRight, Clock3, Pencil, Plus, Search, Settings2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '../../lib/i18n';
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

const CATEGORY_KEYS: Record<ProviderCatalogCategory, string> = {
  email: 'category_email',
  payment: 'category_payment',
  shipping: 'category_shipping',
  deploy: 'category_deploy',
  storage: 'category_storage',
  ai: 'category_ai',
};

const EMPTY_FORM: { name: string; keyValues: ProviderCatalogKeyValue[] } = { name: '', keyValues: [] };
const CONFIG_SCHEMA_CODES = new Set(['paypal', 'momo', 'sendgrid', 'vercel', 'render']);
const EDITABLE_RUNTIME_PROVIDERS = new Set(['smtp', 'sendgrid', 'cod', 'vnpay', 'ghn', 'cloudflare_r2', 'cloudflare_ai']);
const SENSITIVE_CATALOG_VALUE = /\b(api[\s_-]*key|access[\s_-]*key|secret|token|password|credential|authorization|bearer)\b/i;

const PROVIDER_METADATA_KEYS: Record<string, string> = {
  smtp: 'smtp', sendgrid: 'sendgrid', cod: 'cod', vnpay: 'vnpay', paypal: 'paypal', momo: 'momo',
  vercel: 'vercel', render: 'render', ghn: 'ghn', cloudflare_tunnel: 'cloudflare_tunnel',
  cloudflare_r2: 'cloudflare_r2', cloudflare_ai: 'cloudflare_ai',
};

const AUDIT_ACTION_KEYS: Record<string, string> = {
  create: 'audit_action_create',
  update: 'audit_action_update',
  delete: 'audit_action_delete',
  'hard-delete': 'audit_action_hard_delete',
  restore: 'audit_action_restore',
};

const RUNTIME_FIELD_METADATA_KEYS: Record<string, string> = {
  EMAIL_SERVICE: 'email_service', EMAIL_HOST: 'email_host', EMAIL_PORT: 'email_port', EMAIL_SECURE: 'email_secure',
  EMAIL_USER: 'email_user', EMAIL_PASSWORD: 'email_password', EMAIL_FROM: 'email_from', SENDGRID_API_KEY: 'sendgrid_api_key',
  VNPAY_TMN_CODE: 'vnpay_tmn_code', VNPAY_HASH_SECRET: 'vnpay_hash_secret', VNPAY_ENDPOINT: 'vnpay_endpoint',
  VNPAY_RETURN_URL: 'vnpay_return_url', VNPAY_CALLBACK_URL: 'vnpay_callback_url', GHN_API_TOKEN: 'ghn_api_token',
  GHN_SHOP_ID: 'ghn_shop_id', GHN_API_URL: 'ghn_api_url', GHN_WAREHOUSE_DISTRICT_ID: 'ghn_warehouse_district_id',
  GHN_WAREHOUSE_WARD_CODE: 'ghn_warehouse_ward_code', GHN_PROVIDER_ACTIVE: 'ghn_provider_active',
  VNPAY_CHECKOUT_ENABLED: 'vnpay_checkout_enabled_runtime', COD_CHECKOUT_ENABLED: 'cod_checkout_enabled',
  R2_UPLOAD_ENABLED: 'r2_upload_enabled', R2_MAX_UPLOAD_COUNT: 'r2_max_upload_count', R2_MAX_UPLOAD_BYTES: 'r2_max_upload_bytes',
  R2_MAX_IMAGE_BYTES: 'r2_max_image_bytes', R2_MAX_VIDEO_BYTES: 'r2_max_video_bytes', R2_MAX_RETRIES: 'r2_max_retries',
  CLOUDFLARE_AI_ENABLED: 'cloudflare_ai_enabled', CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY: 'cloudflare_ai_max_requests_per_day',
  CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY: 'cloudflare_ai_max_input_chars_per_day', CLOUDFLARE_MAX_REQUESTS_PER_SEC: 'cloudflare_max_requests_per_sec',
  CLOUDFLARE_MAX_PARALLEL_REQUESTS: 'cloudflare_max_parallel_requests', CLOUDFLARE_AI_INPUT_CHUNK_SIZE: 'cloudflare_ai_input_chunk_size',
};

export const getServerSideProps = async () => ({ props: {} });

function ProviderCatalogPage() {
  const { t, loadNamespace } = useTranslation();
  const tr = (key: string) => t(key, 'admin-provider-catalog');
  const metadataTranslation = (key: string, fallback: string, index?: string) => {
    const translated = tr(key);
    return translated === key ? fallback : index ? translated.replace('{index}', index) : translated;
  };
  const localizedProviderName = (code: string, fallback: string) => {
    const providerKey = PROVIDER_METADATA_KEYS[code];
    return providerKey ? metadataTranslation(`metadata_provider_${providerKey}_name`, fallback) : fallback;
  };
  const localizedProviderNote = (code: string, fallback: string) => {
    const providerKey = PROVIDER_METADATA_KEYS[code];
    return providerKey ? metadataTranslation(`metadata_provider_${providerKey}_note`, fallback) : fallback;
  };
  const localizedSchemaField = (code: string, field: ProviderConfigField, property: 'label' | 'help') =>
    metadataTranslation(`metadata_schema_${code}_${field.key}_${property}`, property === 'label' ? field.label : field.helpText || '');
  const localizedGuide = (code: string, guide: ProviderSetupGuide, property: 'label' | 'note') =>
    metadataTranslation(`metadata_guide_${code}_${property}`, guide[property]);
  const localizedRuntimeField = (field: ProviderRuntimeField) => {
    let key = RUNTIME_FIELD_METADATA_KEYS[field.key];
    let index: string | undefined;
    if (!key) {
      const dynamicField = field.key.match(/^(R2_ACCOUNT_ID|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|R2_BUCKET_NAME|R2_PUBLIC_BASE_URL)(?:_(\d+))?$/);
      const aiField = field.key.match(/^(CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN|CLOUDFLARE_AI_MODEL)_(\d+)$/);
      if (dynamicField) {
        const names: Record<string, string> = { R2_ACCOUNT_ID: 'r2_account_id', R2_ACCESS_KEY_ID: 'r2_access_key', R2_SECRET_ACCESS_KEY: 'r2_secret_key', R2_BUCKET_NAME: 'r2_bucket', R2_PUBLIC_BASE_URL: 'r2_public_url' };
        key = names[dynamicField[1]];
        index = dynamicField[2] || '1';
      } else if (aiField) {
        const names: Record<string, string> = { CLOUDFLARE_ACCOUNT_ID: 'cloudflare_account_id', CLOUDFLARE_API_TOKEN: 'cloudflare_api_token', CLOUDFLARE_AI_MODEL: 'cloudflare_ai_model' };
        key = names[aiField[1]];
        index = aiField[2];
      }
    }
    return key ? metadataTranslation(`metadata_runtime_${key}_label`, field.label, index) : field.label;
  };

  useEffect(() => {
    void loadNamespace('admin-provider-catalog');
  }, [loadNamespace]);

  const categoryLabel = (value: ProviderCatalogCategory) => tr(CATEGORY_KEYS[value]);
  const auditActionLabel = (action: string) => {
    const key = AUDIT_ACTION_KEYS[action];
    return key ? tr(key) : action;
  };
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
  const [cloudflareAiValues, setCloudflareAiValues] = useState<Record<string, string>>({});
  const [cloudflareAiDirtyKeys, setCloudflareAiDirtyKeys] = useState<string[]>([]);
  const [cloudflareAiPassword, setCloudflareAiPassword] = useState('');
  const [runtimeConfigValues, setRuntimeConfigValues] = useState<Record<string, string>>({});
  const [runtimeConfigDirtyKeys, setRuntimeConfigDirtyKeys] = useState<string[]>([]);
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
      toast.success(`${tr('vnpay_applied')} ${response.data.configurationVersion || 1}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr('vnpay_save_error'));
    } finally {
      setRuntimeSecretBusy(false);
    }
  };

  const editCloudflareAiRuntime = () => {
    const provider = runtimeProviders.find((item) => item.providerCode === 'cloudflare_ai');
    setCloudflareAiValues(Object.fromEntries((provider?.fields || []).map((field) => [field.key, field.type === 'secret' ? '' : field.value || ''])));
    setCloudflareAiPassword('');
    setCloudflareAiDirtyKeys([]);
    setRuntimeSelectedCode('cloudflare_ai');
    setRuntimeFields(provider?.fields || []);
    setRuntimeView(true);
    setRuntimeEditing(true);
    setSelected(null);
    setAudit(null);
  };

  const openRuntimeEditor = (providerCode: string) => {
    const provider = runtimeProviders.find((item) => item.providerCode === providerCode);
    if (!provider || !EDITABLE_RUNTIME_PROVIDERS.has(providerCode) || provider.storeAvailable === false) return;
    if (providerCode === 'vnpay') {
      setRuntimeEditing(false);
      setRuntimeSelectedCode(providerCode);
      setRuntimeFields(provider.fields);
      setRuntimeView(true);
      setSelected(null);
      setAudit(null);
      setRuntimeSecret('');
      setRuntimeReauthPassword('');
      return;
    }
    if (providerCode === 'cloudflare_ai') {
      editCloudflareAiRuntime();
      return;
    }
    setRuntimeSelectedCode(providerCode);
    setRuntimeFields(provider.fields);
    setRuntimeConfigValues(Object.fromEntries(provider.fields.map((field) => [field.key, field.type === 'secret' ? '' : field.value ?? field.defaultValue ?? ''])));
    setRuntimeConfigDirtyKeys([]);
    setRuntimeReauthPassword('');
    setRuntimeView(true);
    setRuntimeEditing(true);
    setSelected(null);
    setAudit(null);
  };

  const saveGenericRuntime = async () => {
    setRuntimeSecretBusy(true);
    try {
      const values: Record<string, string | boolean> = Object.fromEntries(runtimeConfigDirtyKeys.map((key) => {
        const field = runtimeFields.find((item) => item.key === key);
        const value = runtimeConfigValues[key] || '';
        return [key, field?.type === 'boolean' ? value === 'true' : value];
      }));
      const response = await providerConfigurationAPI.saveRuntimeProvider(runtimeSelectedCode, { ...values, password: runtimeReauthPassword });
      const updated = await providerConfigurationAPI.getRuntimeProvider(runtimeSelectedCode);
      setRuntimeProviders((current) => current.map((provider) => provider.providerCode === runtimeSelectedCode ? updated.data : provider));
      setRuntimeFields(updated.data.fields);
      setRuntimeConfigDirtyKeys([]);
      setRuntimeConfigValues(Object.fromEntries(updated.data.fields.map((field) => [field.key, field.type === 'secret' ? '' : field.value ?? field.defaultValue ?? ''])));
      setRuntimeReauthPassword('');
      setRuntimeEditing(false);
      toast.success(`${tr('runtime_applied')} ${response.data.configurationVersion || 1}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr('runtime_save_error'));
    } finally {
      setRuntimeSecretBusy(false);
    }
  };

  const saveCloudflareAiRuntime = async () => {
    setRuntimeSecretBusy(true);
    try {
      const values = Object.fromEntries(cloudflareAiDirtyKeys.map((key) => [key, cloudflareAiValues[key] || '']));
      const response = await providerConfigurationAPI.saveCloudflareAiRuntime({ ...values, password: cloudflareAiPassword });
      const updated = await providerConfigurationAPI.getRuntimeProvider('cloudflare_ai');
      setRuntimeProviders((current) => current.map((provider) => provider.providerCode === 'cloudflare_ai' ? updated.data : provider));
      setRuntimeFields(updated.data.fields);
      setRuntimeEditing(false);
      setCloudflareAiPassword('');
      setCloudflareAiValues({});
      setCloudflareAiDirtyKeys([]);
      toast.success(`${tr('cloudflare_applied')} ${response.data.configurationVersion}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr('cloudflare_save_error'));
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
      toast.error(error instanceof Error ? error.message : tr('reveal_secret_error'));
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
      toast.error(error instanceof Error ? error.message : tr('schema_load_error'));
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
    setForm({ ...EMPTY_FORM, name: provider ? localizedProviderName(code, provider.name) : '' });
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
      toast.error(error instanceof Error ? error.message : tr('audit_load_error'));
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
      toast.error(error instanceof Error ? error.message : tr('edit_profile_error'));
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
      toast.success(configDirty ? (selected ? tr('profile_saved_with_config') : tr('profile_created_with_config')) : (selected ? tr('profile_saved') : tr('profile_created')));
      if (!selected && entry) await loadAudit(entry, 1);
      setEditing(false);
      await Promise.all([loadList(), selected ? loadAudit(selected) : Promise.resolve()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : tr('profile_save_error');
      toast.error(catalogSaved ? `${tr('profile_save_partial')}${message}` : message);
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
      toast.error(error instanceof Error ? error.message : tr('reveal_secret_error'));
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
      toast.success(tr('config_deleted'));
      await loadAudit(selected, 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr('config_delete_error'));
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
      toast.success(tr('profile_soft_deleted'));
      setSelected(null);
      setDeleteTarget(null);
      await loadList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr('profile_delete_error'));
    } finally {
      setDeleting(false);
    }
  };

  const restore = async (entry: ProviderCatalogEntry) => {
    try {
      const response = await providerCatalogAPI.restore(entry._id);
      toast.success(tr('profile_restored'));
      setSelected(response.data);
      setStatus('active');
      setPage(1);
      await loadList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr('profile_restore_error'));
    }
  };

  const confirmHardDelete = async () => {
    if (!hardDeleteTarget || hardDeleting) return;
    setHardDeleting(true);
    try {
      await providerCatalogAPI.hardDelete(hardDeleteTarget._id);
      toast.success(tr('profile_hard_deleted'));
      if (selected?._id === hardDeleteTarget._id) setSelected(null);
      setHardDeleteTarget(null);
      await loadList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr('profile_hard_delete_error'));
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
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{tr('provider_catalog_title')}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{tr('provider_catalog_description')}</p>
        </div>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={loading || Boolean(loadError) || !registry.length} onClick={() => openCreate()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />{tr('add_profile')}</button></div>
      </header>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <strong>{tr('adapter_warning_title')}</strong> {tr('adapter_warning_body')}
      </section>

      <div className="grid gap-6">
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setFilter(() => setStatus('active'))} className={`rounded-full px-4 py-2 text-sm font-medium ${status === 'active' ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>{tr('current_profiles')}</button>
            <button type="button" onClick={() => setFilter(() => setStatus('deleted'))} className={`rounded-full px-4 py-2 text-sm font-medium ${status === 'deleted' ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>{tr('soft_deleted')}</button>
          </div>
          <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_180px]">
            <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" name="providerCatalogSearch" autoComplete="off" value={search} onChange={(event) => setFilter(() => setSearch(event.target.value))} placeholder={tr('search_name_code')} className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" /></label>
            <select value={category} onChange={(event) => setFilter(() => setCategory(event.target.value))} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700"><option value="">{tr('all_categories')}</option>{Object.keys(CATEGORY_KEYS).map((value) => <option value={value} key={value}>{categoryLabel(value as ProviderCatalogCategory)}</option>)}</select>
          </div>
          {loading ? <p className="py-10 text-center text-sm text-slate-500">{tr('loading_catalog')}</p> : loadError ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-8 text-center text-sm text-amber-950"><p className="font-semibold">{loadError === 'backend-missing' ? tr('backend_missing') : tr('catalog_load_failed')}</p><p className="mx-auto mt-2 max-w-md leading-6">{loadError === 'backend-missing' ? tr('backend_missing_help') : tr('catalog_load_help')}</p><button type="button" onClick={() => void loadData()} className="mt-4 rounded-lg border border-amber-400 px-4 py-2 font-medium hover:bg-amber-100">{tr('retry')}</button></div> : items.length ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">{tr('provider')}</th>
                    <th scope="col" className="px-4 py-3 font-semibold">{tr('category')}</th>
                    <th scope="col" className="px-4 py-3 font-semibold">{tr('status')}</th>
                    <th scope="col" className="px-4 py-3 font-semibold">{tr('capability')}</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">{tr('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((entry) => (
                    <tr key={entry._id} className={`transition-colors ${selected?._id === entry._id ? 'bg-red-50/50' : 'hover:bg-slate-50'}`}>
                      <td className="px-4 py-3"><p className="font-medium text-slate-900">{entry.name}</p><p className="mt-1 text-xs text-slate-500">{entry.providerCode} · {tr('profile_version_prefix')}{entry.version}</p></td>
                      <td className="px-4 py-3 text-slate-700">{categoryLabel(entry.category)}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${entry.isDeleted ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-800'}`}>{entry.isDeleted ? tr('soft_deleted') : tr('current')}</span></td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${entry.capability === 'not-implemented' || entry.capability === 'not-verified' || entry.capability === 'launcher-only' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{entry.capability === 'not-implemented' ? tr('not_integrated') : entry.capability === 'not-verified' ? tr('not_verified') : entry.capability === 'launcher-only' ? tr('launcher_only') : entry.capability === 'payment-method' ? tr('existing_payment_method') : tr('has_adapter')}</span><p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{localizedProviderNote(entry.providerCode, entry.capabilityNote)}</p></td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => void openEntry(entry)} aria-label={tr('view')} title={tr('view')} className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-white"><Pencil className="h-4 w-4" aria-hidden="true" /></button>{entry.isDeleted ? <><button type="button" onClick={() => void restore(entry)} aria-label={tr('restore')} title={tr('restore')} className="rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50"><ArchiveRestore className="h-4 w-4" aria-hidden="true" /></button><button type="button" onClick={() => setHardDeleteTarget(entry)} aria-label={tr('hard_delete')} title={tr('hard_delete')} className="rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></> : <button type="button" onClick={() => void remove(entry)} aria-label={tr('soft_delete')} title={tr('soft_delete')} className="rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : status === 'active' && pageInfo.total === 0 && availableProviders.length ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="font-semibold text-slate-800">{tr('no_saved_profiles')}</p><p className="mt-1 text-sm leading-5 text-slate-600">{tr('registry_profiles_help')}</p></div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="px-4 py-3 font-semibold">{tr('provider')}</th><th scope="col" className="px-4 py-3 font-semibold">{tr('category_code')}</th><th scope="col" className="px-4 py-3 font-semibold">{tr('capability')}</th><th scope="col" className="px-4 py-3 text-right font-semibold">{tr('actions')}</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{availableProviders.map((provider) => <tr key={provider.code} className="hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-900">{localizedProviderName(provider.code, provider.name)}</td><td className="px-4 py-3 text-slate-600">{categoryLabel(provider.category)}<span className="mt-1 block text-xs text-slate-500">{provider.code}</span></td><td className="px-4 py-3"><span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{provider.adapter === 'not-implemented' ? tr('not_integrated') : provider.adapter === 'not-verified' ? tr('not_verified') : provider.adapter === 'launcher-only' ? tr('launcher_only') : provider.adapter === 'payment-method' ? tr('existing_payment_method') : tr('has_adapter')}</span><p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{localizedProviderNote(provider.code, provider.note)}</p></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => openCreate(provider.code)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">{tr('create_profile')}</button></td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{tr('no_matching_profiles')}</div>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-sm text-slate-500">
            <span className="text-xs">{pageInfo.total} {tr('catalog_profiles')} · {tr('page')} {pageInfo.page} / {Math.max(pageInfo.totalPages, 1)}</span><span className="text-xs">{tr('runtime')}: {runtimeStatus === 'loading' ? tr('reading') : runtimeStatus === 'unavailable' ? tr('cannot_read') : `${runtimeProviders.filter((provider) => provider.status === 'configured').length} ${tr('configured_count')} · ${runtimeProviders.filter((provider) => provider.status === 'not-managed').length} ${tr('not_managed_count')}`}</span>
            <div className="flex gap-2"><button type="button" aria-label={tr('previous_page')} disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-md border p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><button type="button" aria-label={tr('next_page')} disabled={page >= pageInfo.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-md border p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div>
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
            <DialogHeader className="sr-only"><DialogTitle>{editing ? (selected ? tr('edit_profile_title') : tr('add_profile_title')) : runtimeView ? tr('runtime_config_title') : selected?.name || tr('profile_details_title')}</DialogTitle></DialogHeader>
          {editing ? <>
            <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">{selected ? tr('edit_profile') : tr('add_profile')}</h2><button type="button" onClick={() => setEditing(false)} aria-label={tr('close_form')} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
            {!selected && <label className="mb-4 block text-sm font-medium text-slate-700">{tr('provider')}<select value={selectedCode} onChange={(event) => { const code = event.target.value; setSelectedCode(code); const match = registry.find((provider) => provider.code === code); if (match) setForm((current) => ({ ...current, name: localizedProviderName(code, match.name) })); void loadProviderConfig(code); }} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal">{registry.map((provider) => <option key={provider.code} value={provider.code}>{categoryLabel(provider.category)} · {localizedProviderName(provider.code, provider.name)} ({provider.code})</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">{tr('registry_allowlist_help')}</span></label>}
            {selected && <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{categoryLabel(selected.category)} · {selected.providerCode}</div>}
            <label className="mb-4 block text-sm font-medium text-slate-700">{tr('profile_name')}<input value={form.name} maxLength={100} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
            <section className="space-y-3">
              <div><h3 className="text-sm font-semibold text-slate-800">{tr('catalog_key_values_title')}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{tr('catalog_reference_help')}</p></div>
              {catalogKeyValues.map((pair, index) => <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] sm:items-end">
                <label className="block text-sm font-medium text-slate-700">{tr('key')}<input maxLength={100} value={pair.key} onChange={(event) => setForm((current) => ({ ...current, keyValues: (current.keyValues || []).map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item) }))} placeholder={tr('example_dashboard')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <label className="block text-sm font-medium text-slate-700">{tr('value')}<input maxLength={2048} value={pair.value} onChange={(event) => setForm((current) => ({ ...current, keyValues: (current.keyValues || []).map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) }))} placeholder={tr('reference_value_placeholder')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <button type="button" onClick={() => setForm((current) => ({ ...current, keyValues: (current.keyValues || []).filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`${tr('delete_key_value_row')} ${index + 1}`} className="rounded-lg border border-red-200 p-2.5 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>)}
              {!selected && <button type="button" disabled={catalogKeyValues.length >= 50} onClick={() => setForm((current) => ({ ...current, keyValues: [...(current.keyValues || []), { key: '', value: '' }] }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{tr('add_key_value')}</button>}
              {catalogKeyValues.some((pair) => SENSITIVE_CATALOG_VALUE.test(pair.key) || SENSITIVE_CATALOG_VALUE.test(pair.value)) && <p role="alert" className="text-xs text-red-700">{tr('credentials_catalog_warning')}</p>}
            </section>
            {configFields.length > 0 && <section className="mt-5 space-y-4 rounded-xl border border-slate-200 p-4">
              <div><h3 className="font-semibold text-slate-900">{tr('configure')} {selectedRegistry ? localizedProviderName(selectedRegistry.code, selectedRegistry.name) : ''}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{tr('config_fields_help')}</p>{schemaGuide && <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"><p>{localizedGuide(selectedCode, schemaGuide, 'note')}</p><a href={schemaGuide.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center rounded-lg border border-blue-300 bg-white px-3 py-2 font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{localizedGuide(selectedCode, schemaGuide, 'label')} {tr('open_new_tab')}</a></div>}</div>
              {!configStoreAvailable && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">{tr('secrets_unavailable')}</p>}
              {configFields.map((field) => <label key={field.key} className="block text-sm font-medium text-slate-700">
                <span>{localizedSchemaField(selectedCode, field, 'label')}{field.required ? ' *' : ''}</span>
                <code className="mt-1 block break-all text-xs font-normal text-slate-500">{field.key}</code>
                {field.helpText && <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{localizedSchemaField(selectedCode, field, 'help')}</span>}
                {field.type === 'select' ? <select value={configValues[field.key] || ''} onChange={(event) => { setConfigDirty(true); setConfigValues((current) => ({ ...current, [field.key]: event.target.value })); }} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal">{field.options?.map((option) => <option value={option} key={option}>{option}</option>)}</select> : <input type={field.type === 'secret' ? 'password' : field.type === 'url' ? 'url' : 'text'} autoComplete="new-password" value={configValues[field.key] || ''} placeholder={field.type === 'secret' && configuredSecrets.includes(field.key) ? tr('saved_rotate_placeholder') : field.defaultValue || ''} onChange={(event) => { setConfigDirty(true); setConfigValues((current) => ({ ...current, [field.key]: event.target.value })); }} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />}
              </label>)}
            </section>}
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>{tr('no_production_credentials')}</strong> {tr('catalog_config_warning')}</div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm">{tr('cancel')}</button><button type="button" disabled={saving || hasInvalidKeyValues || !form.name.trim() || (!selected && !selectedRegistry) || (configDirty && ((['paypal', 'momo', 'sendgrid', 'vercel', 'render'].includes(selectedCode) && !configStoreAvailable) || configFields.some((field) => field.required && field.type !== 'secret' && !configValues[field.key]) || configFields.some((field) => field.required && field.type === 'secret' && !configValues[field.key] && !configuredSecrets.includes(field.key))))} onClick={() => void save()} className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? tr('saving') : tr('save_profile')}</button></div>
          </> : runtimeView ? <>
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{tr('runtime_source')}: {runtimeSelectedProvider?.status === 'not-managed' ? tr('runtime_not_managed') : tr('runtime_source_env_db')}</p><h2 className="mt-1 text-xl font-semibold text-slate-950">{localizedProviderName(runtimeSelectedCode, registry.find((provider) => provider.code === runtimeSelectedCode)?.name || runtimeSelectedCode)} {tr('runtime')}</h2><p className="mt-1 text-sm text-slate-500">{tr('status')}: {runtimeSelectedProvider?.status === 'configured' ? tr('runtime_configured') : runtimeSelectedProvider?.status === 'incomplete' ? tr('runtime_partial') : runtimeSelectedProvider?.status === 'not-configured' ? tr('not_configured') : tr('no_runtime_mapping')} · {tr('runtime_not_catalog')}</p></div><button type="button" onClick={() => { setRuntimeView(false); setRuntimeSecret(''); setRuntimeRevealOpen(false); setRuntimeRevealKey(''); setRuntimeReauthPassword(''); }} aria-label={tr('close_runtime_config')} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
            <label className="mt-5 block text-sm font-medium text-slate-700">{tr('provider')}<select value={runtimeSelectedCode} onChange={(event) => selectRuntimeProvider(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5">{runtimeProviders.map((provider) => <option key={provider.providerCode} value={provider.providerCode}>{localizedProviderName(provider.providerCode, registry.find((item) => item.code === provider.providerCode)?.name || provider.providerCode)}</option>)}</select></label>
            {runtimeLoading ? <p className="py-8 text-center text-sm text-slate-500">{tr('runtime_loading')}</p> : <>
              {runtimeSelectedProvider?.status === 'not-managed' && <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-5 text-slate-600">{tr('runtime_unlinked')}</p>}
              {runtimeSelectedProvider?.status !== 'not-managed' && !runtimeFields.length && <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-5 text-slate-600">{tr('no_runtime_keys')}</p>}
              {runtimeSelectedCode === 'vnpay' && !runtimeEditing && <button type="button" onClick={editVnpayRuntime} className="mt-4 rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-50">{tr('configure_vnpay')}</button>}
              {runtimeSelectedCode === 'cloudflare_ai' && !runtimeEditing && <button type="button" disabled={runtimeSelectedProvider?.storeAvailable === false} onClick={editCloudflareAiRuntime} className="mt-4 rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-50 disabled:opacity-50">{tr('edit_cloudflare_runtime')}</button>}
              {runtimeEditing && runtimeSelectedCode === 'vnpay' && <section className="mt-4 space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <div><h3 className="font-semibold text-slate-900">{tr('edit_vnpay_runtime')}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{tr('vnpay_runtime_help')}</p></div>
                {runtimeSelectedProvider?.storeAvailable === false && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{tr('credential_store_unavailable')}</p>}
                {runtimeFields.filter((field) => field.key !== 'VNPAY_CHECKOUT_ENABLED').map((field) => <label key={field.key} className="block text-sm font-medium text-slate-700">{localizedRuntimeField(field)}<code className="mt-1 block break-all text-xs font-normal text-slate-500">{field.key}</code><input type={field.type === 'secret' ? 'password' : field.type === 'url' ? 'url' : 'text'} autoComplete="new-password" value={field.type === 'secret' ? runtimeSecret : vnpayValues[field.key] || ''} placeholder={field.type === 'secret' && field.configured ? tr('configured_replace_placeholder') : ''} onChange={(event) => field.type === 'secret' ? setRuntimeSecret(event.target.value) : setVnpayValues((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>)}
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={vnpayCheckoutEnabled} onChange={(event) => setVnpayCheckoutEnabled(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />{tr('vnpay_checkout_enabled')}</label>
                <label className="block text-sm font-medium text-slate-700">{tr('confirm_password')}<input type="password" autoComplete="off" value={runtimeReauthPassword} onChange={(event) => setRuntimeReauthPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <div className="flex justify-end gap-2"><button type="button" onClick={() => { setRuntimeEditing(false); setRuntimeSecret(''); setRuntimeReauthPassword(''); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">{tr('cancel')}</button><button type="button" disabled={runtimeSecretBusy || !runtimeReauthPassword || runtimeSelectedProvider?.storeAvailable === false} onClick={() => void saveVnpayRuntime()} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{runtimeSecretBusy ? tr('saving') : tr('save_apply')}</button></div>
              </section>}
              {runtimeEditing && !['vnpay', 'cloudflare_ai'].includes(runtimeSelectedCode) && <section className="mt-4 space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <div><h3 className="font-semibold text-slate-900">{tr('edit_runtime_config')}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{tr('runtime_config_help')}</p></div>
                {runtimeFields.map((field) => <label key={field.key} className="block text-sm font-medium text-slate-700">{localizedRuntimeField(field)}<code className="mt-1 block break-all text-xs font-normal text-slate-500">{field.key}</code>{field.type === 'boolean' ? <input type="checkbox" checked={runtimeConfigValues[field.key] === 'true'} onChange={(event) => { setRuntimeConfigValues((current) => ({ ...current, [field.key]: String(event.target.checked) })); setRuntimeConfigDirtyKeys((current) => current.includes(field.key) ? current : [...current, field.key]); }} className="mt-2 h-4 w-4 rounded border-slate-300" /> : field.type === 'select' ? <select value={runtimeConfigValues[field.key] || field.defaultValue || ''} onChange={(event) => { setRuntimeConfigValues((current) => ({ ...current, [field.key]: event.target.value })); setRuntimeConfigDirtyKeys((current) => current.includes(field.key) ? current : [...current, field.key]); }} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal">{(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input type={field.type === 'secret' ? 'password' : field.type === 'url' ? 'url' : 'text'} autoComplete="new-password" value={runtimeConfigValues[field.key] || ''} placeholder={field.type === 'secret' && field.configured ? tr('configured_replace_placeholder') : field.defaultValue || ''} onChange={(event) => { const value = event.target.value; setRuntimeConfigValues((current) => ({ ...current, [field.key]: value })); setRuntimeConfigDirtyKeys((current) => field.type === 'secret' && !value ? current.filter((key) => key !== field.key) : current.includes(field.key) ? current : [...current, field.key]); }} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />}</label>)}
                <label className="block text-sm font-medium text-slate-700">{tr('confirm_password')}<input type="password" autoComplete="off" value={runtimeReauthPassword} onChange={(event) => setRuntimeReauthPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
                <div className="flex justify-end gap-2"><button type="button" onClick={() => { setRuntimeEditing(false); setRuntimeReauthPassword(''); setRuntimeConfigDirtyKeys([]); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">{tr('cancel')}</button><button type="button" disabled={runtimeSecretBusy || !runtimeReauthPassword || !runtimeConfigDirtyKeys.length || runtimeSelectedProvider?.storeAvailable === false} onClick={() => void saveGenericRuntime()} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{runtimeSecretBusy ? tr('saving') : tr('save_apply')}</button></div>
              </section>}
              {runtimeEditing && runtimeSelectedCode === 'cloudflare_ai' && <section className="mt-4 space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <div><h3 className="font-semibold text-slate-900">{tr('edit_cloudflare_runtime')}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{tr('cloudflare_runtime_help')}</p></div>
                {runtimeSelectedProvider?.storeAvailable === false && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{tr('credential_store_unavailable')}</p>}
                {runtimeFields.map((field) => <label key={field.key} className="block text-sm font-medium text-slate-700">{localizedRuntimeField(field)}<code className="mt-1 block break-all text-xs font-normal text-slate-500">{field.key}</code><input type={field.type === 'secret' ? 'password' : field.type === 'url' ? 'url' : 'text'} autoComplete="off" value={cloudflareAiValues[field.key] || ''} placeholder={field.type === 'secret' && field.configured ? tr('configured_replace_keep_placeholder') : ''} onChange={(event) => { const value = event.target.value; setCloudflareAiValues((current) => ({ ...current, [field.key]: value })); setCloudflareAiDirtyKeys((current) => field.type === 'secret' && !value ? current.filter((key) => key !== field.key) : current.includes(field.key) ? current : [...current, field.key]); }} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal" /></label>)}
                <label className="block text-sm font-medium text-slate-700">{tr('confirm_password')}<input type="password" autoComplete="off" value={cloudflareAiPassword} onChange={(event) => setCloudflareAiPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <div className="flex justify-end gap-2"><button type="button" onClick={() => { setRuntimeEditing(false); setCloudflareAiPassword(''); setCloudflareAiDirtyKeys([]); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">{tr('cancel')}</button><button type="button" disabled={runtimeSecretBusy || !cloudflareAiPassword || !cloudflareAiDirtyKeys.length || runtimeSelectedProvider?.storeAvailable === false} onClick={() => void saveCloudflareAiRuntime()} className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{runtimeSecretBusy ? tr('saving') : tr('save_apply')}</button></div>
              </section>}
              <div className="mt-5 space-y-3">{runtimeFields.map((field) => <div key={field.key} className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-medium text-slate-800">{localizedRuntimeField(field)}</p><code className="mt-1 block break-all text-xs text-slate-500">{field.key}</code><p className="mt-2 break-all text-sm text-slate-700">{field.type === 'secret' ? (runtimeSecret && runtimeRevealKey === field.key ? runtimeSecret : field.configured ? tr('masked_configured') : tr('not_configured')) : field.value || tr('not_configured')}</p><p className="mt-1 text-xs text-slate-500">{field.source === 'runtime-default' ? tr('runtime_default') : field.source === 'environment' ? tr('source_environment') : field.source === 'database' ? tr('source_database') : tr('no_value')}</p>{field.type === 'secret' && field.configured && <div className="mt-2">{runtimeSecret && runtimeRevealKey === field.key ? <button type="button" onClick={() => { setRuntimeSecret(''); setRuntimeRevealKey(''); }} className="inline-flex items-center rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{tr('hide_secret')}</button> : runtimeRevealOpen && runtimeRevealKey === field.key ? <div className="flex flex-col gap-2 sm:flex-row"><input type="password" autoComplete="off" value={runtimeReauthPassword} onChange={(event) => setRuntimeReauthPassword(event.target.value)} placeholder={tr('reauth_password_placeholder')} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button type="button" disabled={runtimeSecretBusy || !runtimeReauthPassword} onClick={() => void revealRuntimeSecret()} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{runtimeSecretBusy ? tr('verifying') : tr('confirm_reveal')}</button></div> : <button type="button" onClick={() => { setRuntimeRevealKey(field.key); setRuntimeRevealOpen(true); setRuntimeSecret(''); }} className="inline-flex items-center rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{tr('reveal_secret')}</button>}</div>}</div>)}</div>
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{runtimeSelectedCode === 'vnpay' ? tr('vnpay_runtime_warning') : runtimeSelectedCode === 'cloudflare_ai' ? tr('cloudflare_runtime_warning') : tr('runtime_env_readonly')}</p>
            </>}
          </> : selected ? <>
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{categoryLabel(selected.category)}</p><h2 className="mt-1 text-xl font-semibold text-slate-950">{selected.name}</h2><p className="mt-1 text-sm text-slate-500">{selected.providerCode} · {tr('version')} {selected.version}</p></div><button type="button" onClick={() => { setSelected(null); setAudit(null); }} aria-label={tr('close')} title={tr('close')} className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700"><X className="h-4 w-4" aria-hidden="true" /></button></div>
            <div className="mt-5 rounded-xl border border-slate-200 p-4"><p className="text-sm font-semibold text-slate-800">{selected.capability === 'not-implemented' ? tr('not_integrated') : selected.capability === 'not-verified' ? tr('not_verified') : selected.capability === 'launcher-only' ? tr('launcher_only') : selected.capability === 'payment-method' ? tr('existing_payment_method') : tr('has_adapter_backend')}</p><p className="mt-1 text-sm leading-6 text-slate-600">{localizedProviderNote(selected.providerCode, selected.capabilityNote)}</p><p className="mt-2 text-xs text-slate-500">{tr('catalog_connection_warning')}</p></div>
            {schemaGuide && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600"><h3 className="font-semibold text-slate-900">{tr('setup_guide_title')} {localizedProviderName(selected.providerCode, selected.name)}</h3><p className="mt-1">{localizedGuide(selectedCode, schemaGuide, 'note')}</p><a href={schemaGuide.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center rounded-lg border border-blue-300 bg-white px-3 py-2 font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{localizedGuide(selectedCode, schemaGuide, 'label')} {tr('open_new_tab')}</a></div>}
            {configFields.length > 0 && <section className="mt-5 rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{tr('saved_configuration')}</h3><p className="mt-1 text-xs text-slate-500">{configVersion ? `${tr('config_version_prefix')} ${configVersion}` : tr('no_saved_config')} · {tr('secrets_masked')}</p></div>{configVersion > 0 && !deleteConfigOpen && <button type="button" onClick={() => setDeleteConfigOpen(true)} className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50">{tr('delete_configuration')}</button>}</div><div className="mt-4 space-y-3">{configFields.map((field) => { const isSecret = field.type === 'secret'; const isConfigured = isSecret ? configuredSecrets.includes(field.key) : Boolean(configValues[field.key]); return <div key={field.key} className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-medium text-slate-800">{localizedSchemaField(selected?.providerCode || selectedCode, field, 'label')}</p><code className="mt-1 block break-all text-xs text-slate-500">{field.key}</code><p className="mt-2 break-all text-sm text-slate-700">{isSecret ? (revealedSecrets[field.key] || (isConfigured ? tr('masked_configured') : tr('not_configured'))) : (configVersion > 0 && configValues[field.key] ? configValues[field.key] : tr('not_configured'))}</p>{isSecret && isConfigured && <div className="mt-2">{revealedSecrets[field.key] ? <button type="button" onClick={() => setRevealedSecrets((current) => { const next = { ...current }; delete next[field.key]; return next; })} className="inline-flex items-center rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{tr('hide_secret')}</button> : revealingField === field.key ? <div className="flex flex-wrap gap-2"><input type="password" autoComplete="off" value={reauthPassword} onChange={(event) => setReauthPassword(event.target.value)} placeholder={tr('reauth_password_placeholder')} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs" /><button type="button" disabled={!reauthPassword || configActionBusy} onClick={() => void revealSecret(field.key)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white disabled:opacity-50">{configActionBusy ? 'Đang xác minh…' : tr('confirm_reveal')}</button><button type="button" onClick={() => { setRevealingField(null); setReauthPassword(''); }} className="rounded-lg border px-3 py-2 text-xs">{tr('cancel')}</button></div> : <button type="button" onClick={() => setRevealingField(field.key)} className="inline-flex items-center rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{tr('reveal_secret')}</button>}</div>}</div>; })}</div>{deleteConfigOpen && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3"><p className="text-sm font-medium text-red-900">{tr('delete_config_confirm_title')}</p><p className="mt-1 text-xs leading-5 text-red-800">{tr('delete_config_confirm_body')}</p><input type="password" autoComplete="off" value={deleteConfigPassword} onChange={(event) => setDeleteConfigPassword(event.target.value)} placeholder={tr('reauth_password_placeholder')} className="mt-3 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm" /><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => { setDeleteConfigOpen(false); setDeleteConfigPassword(''); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">{tr('cancel')}</button><button type="button" disabled={!deleteConfigPassword || configActionBusy} onClick={() => void deleteConfiguration()} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{configActionBusy ? tr('deleting') : 'Xác nhận xóa'}</button></div></div>}</section>}
            <section className="mt-5 space-y-4">
              <div><h3 className="text-sm font-semibold text-slate-800">{tr('configuration_key_values')}</h3><p className="mt-1 text-xs text-slate-500">{tr('config_sections_help')}</p></div>
              {(selected.keyValues || []).length > 0 && <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-medium text-slate-800">{tr('catalog_key_values')}</h4>
                <dl className="mt-3 space-y-2">{(selected.keyValues || []).map((pair, index) => <div key={`${pair.key}-${index}`} className="grid gap-1 rounded-lg bg-slate-50 p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><dt className="break-all text-xs font-semibold text-slate-600">{pair.key}</dt><dd className="break-all whitespace-pre-wrap text-sm text-slate-800">{pair.value || '—'}</dd></div>)}</dl>
              </div>}
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium text-slate-800">{tr('current_runtime')}{selected.providerCode === 'cloudflare_ai' ? '' : tr('read_only_suffix')}</h4><button type="button" disabled={runtimeStatus !== 'loaded' || !EDITABLE_RUNTIME_PROVIDERS.has(selected.providerCode) || (selected.providerCode !== 'cod' && selectedRuntimeProvider?.storeAvailable === false)} title={!EDITABLE_RUNTIME_PROVIDERS.has(selected.providerCode) ? tr('runtime_edit_unsupported') : undefined} onClick={() => openRuntimeEditor(selected.providerCode)} className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-50 disabled:opacity-50">{EDITABLE_RUNTIME_PROVIDERS.has(selected.providerCode) ? tr('edit_runtime_config') : tr('runtime_edit_unsupported')}</button><span className="text-xs text-slate-500">{runtimeStatus === 'loading' ? tr('loading') : runtimeStatus === 'unavailable' ? tr('cannot_read') : selectedRuntimeProvider?.status === 'configured' ? tr('runtime_status_configured') : selectedRuntimeProvider?.status === 'incomplete' ? tr('runtime_partial') : selectedRuntimeProvider?.status === 'not-configured' ? tr('not_configured') : tr('no_mapping')}</span></div>
                {runtimeStatus === 'loading' ? <p className="mt-3 text-sm text-slate-500">{tr('runtime_reading_backend')}</p> : runtimeStatus === 'unavailable' ? <p className="mt-3 text-sm text-slate-600">{tr('runtime_backend_unavailable')}</p> : selectedRuntimeProvider?.managed ? <>{selectedRuntimeProvider.fields.some((field) => field.configured) ? <dl className="mt-3 space-y-2">{selectedRuntimeProvider.fields.filter((field) => field.configured).map((field) => <div key={field.key} className="grid gap-1 rounded-lg bg-white p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><dt className="break-all text-xs font-semibold text-slate-600">{localizedRuntimeField(field)}</dt><dd className="break-all whitespace-pre-wrap text-sm text-slate-800">{field.type === 'secret' ? tr('masked_configured') : field.value || '—'}</dd><p className="sm:col-span-2 text-xs text-slate-500">{field.source === 'environment' ? tr('source_label_environment') : field.source === 'database' ? tr('source_label_database') : tr('source_label_runtime')}</p></div>)}</dl> : <p className="mt-2 text-sm text-slate-500">{tr('no_runtime_keys')}</p>}</> : <p className="mt-3 text-sm text-slate-600">{tr('no_runtime_mapping')}</p>}
              </div>
            </section>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">{selected.isDeleted ? <button type="button" onClick={() => void restore(selected)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"><ArchiveRestore className="h-4 w-4" />{tr('restore')}</button> : <><button type="button" disabled={editLoading} onClick={() => void editEntry(selected)} className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-50 disabled:opacity-50">{editLoading ? tr('loading') : tr('edit_profile')}</button><button type="button" onClick={() => void remove(selected)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" />{tr('soft_delete')}</button></>}</div>
            <div className="mt-6 border-t border-slate-100 pt-5"><div className="mb-3 flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-500" /><h3 className="text-sm font-semibold text-slate-800">{tr('audit_log')}</h3></div><div className="space-y-3">{audit?.data.map((record) => <div key={record._id} className="border-l-2 border-slate-200 pl-3 text-xs"><p className="font-medium text-slate-700">{auditActionLabel(record.action)} · v{record.version}</p><p className="mt-1 text-slate-500">{record.changedFields.join(', ')}</p><p className="mt-1 text-slate-500">{record.userName || tr('super_admin')} · {new Date(record.createdAt).toLocaleString()}</p></div>)}{audit && !audit.data.length && <p className="text-xs text-slate-500">{tr('no_audit_log')}</p>}</div>{(audit?.pagination.totalPages || 0) > 1 && <div className="mt-4 flex items-center justify-end gap-2 text-xs"><button type="button" disabled={auditPage <= 1} onClick={() => { const nextPage = auditPage - 1; setAuditPage(nextPage); if (selected) void loadAudit(selected, nextPage); }} className="rounded border px-2 py-1 disabled:opacity-40">{tr('previous')}</button><span>{auditPage} / {audit?.pagination.totalPages}</span><button type="button" disabled={auditPage >= (audit?.pagination.totalPages || 1)} onClick={() => { const nextPage = auditPage + 1; setAuditPage(nextPage); if (selected) void loadAudit(selected, nextPage); }} className="rounded border px-2 py-1 disabled:opacity-40">{tr('next')}</button></div>}</div>
          </> : <div className="flex min-h-80 flex-col items-center justify-center text-center"><div className="mb-3 rounded-2xl bg-slate-100 p-3 text-slate-500"><Settings2 className="h-5 w-5" /></div><h2 className="font-semibold text-slate-800">{tr('select_profile')}</h2><p className="mt-1 max-w-xs text-sm leading-6 text-slate-500">{tr('select_profile_help')}</p></div>}
          </DialogContent>
        </Dialog>
        <Dialog modal open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{tr('soft_delete_title')}</DialogTitle></DialogHeader>
            <p className="text-sm leading-6 text-slate-600">{tr('soft_delete_prefix')}{deleteTarget?.name}{tr('soft_delete_body')}</p>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">{tr('cancel')}</button>
              <button type="button" disabled={deleting} onClick={() => void confirmRemove()} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50">{deleting ? tr('deleting') : tr('soft_delete')}</button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog modal open={Boolean(hardDeleteTarget)} onOpenChange={(open) => !open && !hardDeleting && setHardDeleteTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{tr('hard_delete_title')}</DialogTitle></DialogHeader>
            <p className="text-sm leading-6 text-slate-600">{tr('hard_delete_prefix')}{hardDeleteTarget?.name}{tr('hard_delete_body')}</p>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={hardDeleting} onClick={() => setHardDeleteTarget(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">{tr('cancel')}</button>
              <button type="button" disabled={hardDeleting} onClick={() => void confirmHardDelete()} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50">{hardDeleting ? tr('deleting') : tr('hard_delete_action')}</button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default withAdminLayout(ProviderCatalogPage, { permission: 'super-admin', featureName: 'Catalog nhà cung cấp' });
