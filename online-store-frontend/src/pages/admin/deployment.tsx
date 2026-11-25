import { Activity, ArrowLeftRight, ChevronDown, CircleAlert, LoaderCircle, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState, type InputHTMLAttributes } from 'react';
import { toast } from 'sonner';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { Button } from '../../components/ui/button';
import { deploymentAPI, type DeploymentAuditEvent, type DeploymentControlPlaneEvent, type DeploymentJob, type DeploymentRouterConfig, type DeploymentStatus } from '../../lib/api';

export const getServerSideProps = async () => ({ props: {} });

const terminalStatuses = new Set(['succeeded', 'failed']);
const suggestionStorageKey = 'deployment-config-suggestions-v1';
type DeploymentSuggestions = {
  TUNNEL_FRONTEND_ORIGIN: string[];
  TUNNEL_BACKEND_ORIGIN: string[];
  VERCEL_FRONTEND_ORIGIN: string[];
  RENDER_BACKEND_ORIGIN: string[];
  routerUrls: string[];
  runnerIds: string[];
  runnerTokenPaths: string[];
};
type SuggestionOption = { value: string; label: string };
const emptySuggestions: DeploymentSuggestions = {
  TUNNEL_FRONTEND_ORIGIN: [],
  TUNNEL_BACKEND_ORIGIN: [],
  VERCEL_FRONTEND_ORIGIN: [],
  RENDER_BACKEND_ORIGIN: [],
  routerUrls: [],
  runnerIds: [],
  runnerTokenPaths: [],
};
const formatTime = (value?: number | string | null) => value ? new Date(value).toLocaleString() : '—';

type SuggestionInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'list'> & {
  value: string;
  suggestions: SuggestionOption[];
  onChange: (value: string) => void;
  onValueBlur?: (value: string) => void;
};

function SuggestionInput({ value, suggestions, onChange, onValueBlur, className, ...inputProps }: SuggestionInputProps) {
  const [open, setOpen] = useState(false);
  const [filterMatches, setFilterMatches] = useState(false);
  const filteredSuggestions = suggestions
    .filter((suggestion) => !filterMatches || suggestion.value !== value)
    .filter((suggestion) => !filterMatches || !value || suggestion.value.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 8);

  return (
    <div className="relative mt-1">
      <input
        {...inputProps}
        value={value}
        onFocus={() => { setOpen(true); setFilterMatches(false); }}
        onBlur={(event) => { onValueBlur?.(event.currentTarget.value); setOpen(false); }}
        onChange={(event) => { onChange(event.target.value); setFilterMatches(true); setOpen(true); }}
        className={`${className || ''} pr-10`}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      <button
        type="button"
        aria-label="Hiện gợi ý"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { setFilterMatches(false); setOpen((current) => !current); }}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filteredSuggestions.length ? filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion.value}
              type="button"
              role="option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(suggestion.value); onValueBlur?.(suggestion.value); setOpen(false); }}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              <span className="block truncate">{suggestion.label}</span>
              {suggestion.label !== suggestion.value && <span className="block truncate text-xs text-slate-500">{suggestion.value}</span>}
            </button>
          )) : (
            <p className="px-3 py-2 text-sm text-slate-500">Không có gợi ý khớp nội dung đang nhập; xóa nội dung để xem các mẫu.</p>
          )}
        </div>
      )}
    </div>
  );
}

const getDeploymentErrorMessage = (error: unknown, fallback: string) => {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === 'DEPLOYMENT_ROUTER_NOT_CONFIGURED') {
    return 'Cloudflare Tunnel hiện tại vẫn có; phần chưa cấu hình là Worker deployment router (DEPLOYMENT_ROUTER_URL và DEPLOYMENT_CONTROL_TOKEN ở backend). Vì vậy trang chưa đọc được trạng thái điều phối và cutover/rollback vẫn bị khóa.';
  }
  if (code === 'DEPLOYMENT_ROUTER_UNAVAILABLE') {
    return 'Cloudflare Tunnel hiện tại vẫn có; chưa kết nối được Worker deployment router. Kiểm tra Worker và cấu hình backend; cutover/rollback vẫn bị khóa.';
  }
  if (code === 'DEPLOYMENT_ROUTER_CONFIG_STORE_UNAVAILABLE' || code === 'PROVIDER_CONFIG_STORE_UNAVAILABLE') {
    return 'Kho cấu hình mã hóa chưa sẵn sàng. Backend cần PROVIDER_CONFIG_ENCRYPTION_KEY hợp lệ trước khi lưu token.';
  }
  if (code === 'INVALID_DEPLOYMENT_ROUTER_URL') return 'URL Worker phải là HTTPS origin, không có đường dẫn, query hoặc thông tin đăng nhập.';
  if (code === 'DEPLOYMENT_CONTROL_TOKEN_REQUIRED') return 'Nhập control token mới trước khi lưu vì hiện chưa có token cấu hình.';
  if (code === 'INVALID_DEPLOYMENT_CONTROL_TOKEN') return 'Control token phải dài từ 32 đến 2048 ký tự.';
  if (code === 'INVALID_DEPLOYMENT_ORIGIN') return 'Origin phải là HTTPS origin hợp lệ, không có đường dẫn, query hoặc thông tin đăng nhập.';
  if (code === 'INVALID_DEPLOYMENT_RUNNER_ID') return 'Runner ID chỉ được chứa chữ, số, dấu chấm, gạch ngang hoặc gạch dưới (tối đa 128 ký tự).';
  if (code === 'INVALID_DEPLOYMENT_RUNNER_TOKEN') return 'Runner token phải dài từ 16 đến 2048 ký tự.';
  if (code === 'INVALID_DEPLOYMENT_RUNNER_TOKEN_FILE') return 'Đường dẫn file token runner không hợp lệ hoặc quá dài.';
  if (code === 'INVALID_DEPLOYMENT_CHECKLIST') return 'Giá trị checklist không hợp lệ.';
  if (code === 'ROUTE_NOT_FOUND') return 'Backend đang chạy chưa có API cấu hình deployment. Cần triển khai phiên bản backend có /api/admin/deployment/config.';
  if (code === 'REAUTHENTICATION_FAILED') return 'Mật khẩu Super Admin không chính xác.';
  return error instanceof Error ? error.message : fallback;
};

function DeploymentAdminPage() {
  const [status, setStatus] = useState<DeploymentStatus | null>(null);
  const [routerConfig, setRouterConfig] = useState<DeploymentRouterConfig | null>(null);
  const [routerUrl, setRouterUrl] = useState('');
  const [controlToken, setControlToken] = useState('');
  const [runnerToken, setRunnerToken] = useState('');
  const [workerOrigins, setWorkerOrigins] = useState<DeploymentRouterConfig['workerOrigins']>({
    TUNNEL_FRONTEND_ORIGIN: '',
    TUNNEL_BACKEND_ORIGIN: '',
    VERCEL_FRONTEND_ORIGIN: '',
    RENDER_BACKEND_ORIGIN: '',
  });
  const [runnerId, setRunnerId] = useState('laptop-store-windows-01');
  const [runnerTokenFilePath, setRunnerTokenFilePath] = useState('');
  const [readinessChecklist, setReadinessChecklist] = useState<DeploymentRouterConfig['readinessChecklist']>({
    WORKER_DEPLOYED: false,
    RUNNER_CONFIGURED: false,
    STAGING_VERIFIED: false,
  });
  const [suggestions, setSuggestions] = useState(emptySuggestions);
  const [reauthPassword, setReauthPassword] = useState('');
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState('');
  const [job, setJob] = useState<DeploymentJob | null>(null);
  const [audit, setAudit] = useState<DeploymentAuditEvent[]>([]);
  const [controlPlaneEvents, setControlPlaneEvents] = useState<DeploymentControlPlaneEvent[]>([]);
  const [preflight, setPreflight] = useState<Record<string, boolean | null>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await deploymentAPI.getConfig();
      setRouterConfig(response.data);
      setRouterUrl(response.data.routerUrl);
      setWorkerOrigins(response.data.workerOrigins);
      setRunnerId(response.data.runnerId);
      setRunnerTokenFilePath(response.data.runnerTokenFilePath);
      setReadinessChecklist(response.data.readinessChecklist);
      setConfigError('');
    } catch (requestError) {
      setConfigError(getDeploymentErrorMessage(requestError, 'Không thể tải cấu hình control plane.'));
    }
    try {
      const [current, events] = await Promise.all([deploymentAPI.getStatus(), deploymentAPI.getAudit()]);
      setStatus(current);
      setJob(current.activeJob);
      setAudit(events.data || []);
      setControlPlaneEvents(events.controlPlaneEvents || []);
    } catch (requestError) {
      setError(getDeploymentErrorMessage(requestError, 'Không thể tải trạng thái deploy.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(suggestionStorageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      setSuggestions(Object.fromEntries(Object.keys(emptySuggestions).map((key) => [
        key,
        Array.isArray(parsed?.[key]) ? parsed[key].filter((value: unknown) => typeof value === 'string').slice(0, 8) : [],
      ])) as typeof emptySuggestions);
    } catch {
      setSuggestions(emptySuggestions);
    }
  }, []);

  const rememberSuggestion = (key: keyof typeof emptySuggestions, value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    const next = [normalized, ...suggestions[key].filter((item) => item !== normalized)].slice(0, 8);
    const updated = { ...suggestions, [key]: next };
    setSuggestions(updated);
    try {
      localStorage.setItem(suggestionStorageKey, JSON.stringify(updated));
    } catch {
      return;
    }
  };

  useEffect(() => {
    if (!job || terminalStatuses.has(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const updated = await deploymentAPI.getJob(job.id);
        setJob(updated);
        if (terminalStatuses.has(updated.status)) {
          const [current, events] = await Promise.all([deploymentAPI.getStatus(), deploymentAPI.getAudit()]);
          setStatus(current);
          setAudit(events.data || []);
          setControlPlaneEvents(events.controlPlaneEvents || []);
          toast[updated.status === 'succeeded' ? 'success' : 'error'](
            updated.status === 'succeeded' ? 'Luồng deploy đã hoàn tất.' : 'Tác vụ deploy thất bại; cần kiểm tra vận hành.',
          );
        }
      } catch {
        setError('Mất kết nối tới control plane khi theo dõi job.');
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [job]);

  const saveRouterConfig = async () => {
    setConfigSaving(true);
    setConfigError('');
    try {
      await deploymentAPI.saveConfig({
        routerUrl,
        controlToken,
        workerOrigins,
        runnerId,
        runnerToken,
        runnerTokenFilePath,
        readinessChecklist,
        password: reauthPassword,
      });
      setControlToken('');
      setRunnerToken('');
      setReauthPassword('');
      toast.success('Đã lưu cấu hình. Các token được mã hóa; cần đồng bộ thủ công với Worker và runner.');
      await loadData();
    } catch (requestError) {
      setConfigError(getDeploymentErrorMessage(requestError, 'Không thể lưu cấu hình Worker.'));
    } finally {
      setConfigSaving(false);
    }
  };

  const runPreflight = async (mode: DeploymentStatus['mode']) => {
    setBusy(`preflight:${mode}`);
    try {
      const result = await deploymentAPI.preflight(mode);
      setPreflight((current) => ({ ...current, [mode]: result.passed }));
      toast[result.passed ? 'success' : 'error'](result.passed ? `Preflight ${mode} đạt.` : `Preflight ${mode} không đạt.`);
    } catch (requestError) {
      setPreflight((current) => ({ ...current, [mode]: false }));
      toast.error(getDeploymentErrorMessage(requestError, 'Preflight thất bại.'));
    } finally {
      setBusy(null);
    }
  };

  const startCutover = async () => {
    if (!window.confirm('Xác nhận chuyển toàn bộ traffic production sang Vercel + Render? Chỉ tiếp tục trong maintenance window đã phê duyệt.')) return;
    setBusy('cutover');
    try {
      const created = await deploymentAPI.cutover();
      setJob(created);
      toast.info(`Đã tạo job ${created.id}.`);
    } catch (requestError) {
      toast.error(getDeploymentErrorMessage(requestError, 'Không thể tạo job cutover.'));
      await loadData();
    } finally {
      setBusy(null);
    }
  };

  const startRollback = async () => {
    if (!window.confirm('Trước tiên hãy dừng backend Render trong dashboard của nhà cung cấp để tránh hai backend cùng ghi database. Bạn xác nhận Render đã dừng và muốn khởi động lại frontend/backend Tunnel?')) return;
    setBusy('rollback');
    try {
      const created = await deploymentAPI.rollback();
      setJob(created);
      toast.info(`Đã tạo job rollback ${created.id}.`);
    } catch (requestError) {
      toast.error(getDeploymentErrorMessage(requestError, 'Không thể tạo job rollback.'));
      await loadData();
    } finally {
      setBusy(null);
    }
  };

  const buildSuggestions = (values: string[], sample: SuggestionOption) => Array.from(new Set([sample.value, ...values].filter(Boolean)))
    .map((value) => value === sample.value ? sample : { value, label: value });
  const originSuggestions = {
    TUNNEL_FRONTEND_ORIGIN: buildSuggestions([workerOrigins.TUNNEL_FRONTEND_ORIGIN, ...suggestions.TUNNEL_FRONTEND_ORIGIN], {
      value: 'https://tunnel-frontend.example.com', label: 'Mẫu Tunnel frontend — thay bằng hostname origin đã provision',
    }),
    TUNNEL_BACKEND_ORIGIN: buildSuggestions([workerOrigins.TUNNEL_BACKEND_ORIGIN, ...suggestions.TUNNEL_BACKEND_ORIGIN], {
      value: 'https://tunnel-backend.example.com', label: 'Mẫu Tunnel backend — thay bằng hostname origin đã provision',
    }),
    VERCEL_FRONTEND_ORIGIN: buildSuggestions([workerOrigins.VERCEL_FRONTEND_ORIGIN, ...suggestions.VERCEL_FRONTEND_ORIGIN], {
      value: 'https://your-project.vercel.app', label: 'Mẫu Vercel — thay bằng URL thực trong Vercel',
    }),
    RENDER_BACKEND_ORIGIN: buildSuggestions([workerOrigins.RENDER_BACKEND_ORIGIN, ...suggestions.RENDER_BACKEND_ORIGIN], {
      value: 'https://your-service.onrender.com', label: 'Mẫu Render — thay bằng URL thực trong Render',
    }),
  };
  const routerUrlSuggestions = buildSuggestions([routerUrl, ...suggestions.routerUrls], {
    value: 'https://deployment-router.account-subdomain.workers.dev', label: 'Mẫu Worker — thay account subdomain bằng URL thực',
  });
  const runnerIdSuggestions = buildSuggestions([runnerId, ...suggestions.runnerIds], {
    value: 'laptop-store-windows-01', label: 'Runner ID đã xác nhận trong source',
  });
  const runnerPathSuggestions = buildSuggestions([runnerTokenFilePath, ...suggestions.runnerTokenPaths], {
    value: 'C:\\ProgramData\\LaptopStore\\runner-token.dpapi', label: 'Mẫu Windows path — khớp với vị trí file DPAPI thực tế',
  });
  const activeJob = job && !terminalStatuses.has(job.status);
  const cutoverReady = status?.switchEnabled === true && status.mode === 'tunnel' && status.runnerOnline && preflight['vercel-render'] === true && !activeJob;
  const rollbackReady = status?.switchEnabled === true && status.mode === 'vercel-render' && status.runnerOnline && !activeJob;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-red-600">Super Admin</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Chuyển luồng triển khai</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Điều khiển routing Vercel + Render qua control plane độc lập. Màn hình này không thay đổi DNS hoặc cấu hình nhà cung cấp.</p>
        </div>
        <Button variant="outline" onClick={() => void loadData()} disabled={loading || Boolean(busy)}>
          {loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Tải lại
        </Button>
      </div>

      {error && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><CircleAlert className="mr-2 inline size-4" />{error}</div>}

      <section aria-labelledby="deployment-setup-title" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="deployment-setup-title" className="text-lg font-semibold text-slate-900">Cấu hình deployment</h2>
        <p className="mt-1 text-sm text-slate-600">Các mẫu trong dropdown dùng hostname giữ chỗ, không phải URL thật; thay bằng URL đã cấp trên Cloudflare, Vercel hoặc Render trước khi lưu. Giá trị mới được ghi nhớ riêng theo từng loại ô; token bí mật không được đưa vào gợi ý. Lưu tại đây không tự cập nhật Cloudflare hoặc WinSW.</p>
        {configError && <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{configError}</p>}
        {routerConfig && <p className="mt-3 text-xs text-slate-500">Backend URL: {routerConfig.routerUrlSource === 'unset' ? 'chưa cấu hình' : `nguồn ${routerConfig.routerUrlSource}`} · Control token: {routerConfig.controlTokenValid ? `đã cấu hình (${routerConfig.controlTokenSource})` : 'chưa hợp lệ hoặc chưa cấu hình'} · Runner token: {routerConfig.runnerTokenConfigured ? 'đã lưu mã hóa' : 'chưa lưu'} · Kho mã hóa: {routerConfig.storeAvailable ? 'sẵn sàng' : 'chưa sẵn sàng'}</p>}
        {routerConfig && !routerConfig.storeAvailable && <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Backend cần <code>PROVIDER_CONFIG_ENCRYPTION_KEY</code> gồm 64 ký tự hex để lưu cấu hình mã hóa.</p>}
        <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void saveRouterConfig(); }}>
          <ol className="grid gap-4 md:grid-cols-2">
            <li className="rounded-lg border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">1. Cloudflare Worker</h3>
              <p className="mt-1 text-sm text-slate-600">Nhập HTTPS origins và secrets cho Worker <code>deployment-router</code>. Durable Object binding <code>DEPLOYMENT_STATE</code> vẫn được quản lý qua Wrangler.</p>
              <div className="mt-3 grid gap-3">
                {([
                  ['TUNNEL_FRONTEND_ORIGIN', 'Tunnel frontend origin'],
                  ['TUNNEL_BACKEND_ORIGIN', 'Tunnel backend origin'],
                  ['VERCEL_FRONTEND_ORIGIN', 'Vercel frontend origin'],
                  ['RENDER_BACKEND_ORIGIN', 'Render backend origin'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block text-sm font-medium text-slate-800">{label}
                    <SuggestionInput type="url" value={workerOrigins[key]} suggestions={originSuggestions[key]} onChange={(value) => setWorkerOrigins((current) => ({ ...current, [key]: value }))} onValueBlur={(value) => rememberSuggestion(key, value)} placeholder="https://example.com" className="w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
                    <span className="mt-1 block text-xs font-normal text-slate-500">HTTPS origin riêng, không có path/query.</span>
                  </label>
                ))}
                <label className="block text-sm font-medium text-slate-800">DEPLOYMENT_RUNNER_ID
                  <SuggestionInput required maxLength={128} value={runnerId} suggestions={runnerIdSuggestions} onChange={setRunnerId} onValueBlur={(value) => rememberSuggestion('runnerIds', value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
                </label>
                <label className="block text-sm font-medium text-slate-800">DEPLOYMENT_RUNNER_TOKEN mới
                  <input type="password" autoComplete="new-password" maxLength={2048} value={runnerToken} onChange={(event) => setRunnerToken(event.target.value)} placeholder={routerConfig?.runnerTokenConfigured ? 'Để trống để giữ token hiện tại' : 'Tối thiểu 16 ký tự'} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
                  <span className="mt-1 block text-xs font-normal text-slate-500">Token được lưu mã hóa; cần đồng bộ cùng giá trị vào Cloudflare Secret và file DPAPI của runner.</span>
                </label>
              </div>
            </li>
            <li className="rounded-lg border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">2. Backend API</h3>
              <p className="mt-1 text-sm text-slate-600">Các trường này được backend dùng trực tiếp; cấu hình database ưu tiên environment variables.</p>
              <div className="mt-3 grid gap-3">
                <label className="block text-sm font-medium text-slate-800">DEPLOYMENT_ROUTER_URL
                  <SuggestionInput type="url" required maxLength={2048} value={routerUrl} suggestions={routerUrlSuggestions} onChange={setRouterUrl} onValueBlur={(value) => rememberSuggestion('routerUrls', value)} placeholder="https://<worker-host>" className="w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
                  <span className="mt-1 block text-xs font-normal text-slate-500">HTTPS origin của Worker, không có path, query hoặc thông tin đăng nhập.</span>
                </label>
                <label className="block text-sm font-medium text-slate-800">DEPLOYMENT_CONTROL_TOKEN mới
                  <input type="password" required={!routerConfig?.controlTokenValid} autoComplete="new-password" maxLength={2048} value={controlToken} onChange={(event) => setControlToken(event.target.value)} placeholder={routerConfig?.controlTokenValid ? 'Để trống để giữ token hiện tại' : 'Từ 32 đến 2048 ký tự'} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
                  <span className="mt-1 block text-xs font-normal text-slate-500">Token được lưu mã hóa và phải khớp Cloudflare Worker Secret.</span>
                </label>
                <p className="text-xs text-slate-600"><code>DEPLOYMENT_SWITCH_ENABLED=false</code> cho đến khi staging được duyệt.</p>
              </div>
            </li>
            <li className="rounded-lg border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">3. Windows runner</h3>
              <p className="mt-1 text-sm text-slate-600">Các giá trị cần đồng bộ trong cấu hình WinSW service. Runner ID phải trùng với Worker.</p>
              <div className="mt-3 grid gap-3">
                <label className="block text-sm font-medium text-slate-800">DEPLOYMENT_ROUTER_URL
                  <SuggestionInput type="url" required value={routerUrl} suggestions={routerUrlSuggestions} onChange={setRouterUrl} onValueBlur={(value) => rememberSuggestion('routerUrls', value)} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-normal text-slate-600" />
                </label>
                <label className="block text-sm font-medium text-slate-800">DEPLOYMENT_RUNNER_ID
                  <input readOnly value={runnerId} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-normal text-slate-600" />
                </label>
                <label className="block text-sm font-medium text-slate-800">DEPLOYMENT_RUNNER_TOKEN_DPAPI_FILE
                  <SuggestionInput maxLength={1024} value={runnerTokenFilePath} suggestions={runnerPathSuggestions} onChange={setRunnerTokenFilePath} onValueBlur={(value) => rememberSuggestion('runnerTokenPaths', value)} placeholder="Đường dẫn file DPAPI trên máy runner" className="w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
                </label>
              </div>
            </li>
            <li className="rounded-lg border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">4. Kiểm tra trước khi bật switch</h3>
              <p className="mt-1 text-sm text-slate-600">Checklist được lưu để theo dõi vận hành; đánh dấu chỉ xác nhận thủ công, không thay thế preflight hoặc staging.</p>
              <div className="mt-3 space-y-3">
                {([
                  ['WORKER_DEPLOYED', 'Đã áp dụng và deploy cấu hình Worker'],
                  ['RUNNER_CONFIGURED', 'Đã cấu hình, khởi động runner và xác nhận online'],
                  ['STAGING_VERIFIED', 'Đã chạy preflight Tunnel và Vercel + Render, staging đạt'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={readinessChecklist[key]} onChange={(event) => setReadinessChecklist((current) => ({ ...current, [key]: event.target.checked }))} className="mt-1" />
                    <span>{label}</span>
                  </label>
                ))}
                <p className="text-xs text-slate-600">Tunnel origin phải là HTTPS hostname riêng; không dùng <code>127.0.0.1</code> hoặc hostname production đi qua chính Worker.</p>
              </div>
            </li>
          </ol>
          <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-800">Mật khẩu Super Admin để xác nhận lưu
              <input type="password" required autoComplete="current-password" value={reauthPassword} onChange={(event) => setReauthPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
            </label>
            <div className="flex items-end">
              <Button type="submit" disabled={configSaving || loading || !routerConfig?.storeAvailable || !routerUrl.trim() || !reauthPassword}>
                {configSaving && <LoaderCircle className="animate-spin" />} Lưu cấu hình deployment
              </Button>
            </div>
          </div>
        </form>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Luồng đang hoạt động</p>
          <p className="mt-2 text-xl font-semibold text-slate-900">{loading ? 'Đang kiểm tra…' : status?.mode || 'Không khả dụng'}</p>
          <p className="mt-1 text-xs text-slate-500">Nguồn trạng thái: Durable Object</p>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Windows runner</p>
          <p className={`mt-2 text-xl font-semibold ${status?.runnerOnline ? 'text-emerald-700' : 'text-red-700'}`}>{loading ? 'Đang kiểm tra…' : status?.runnerOnline ? 'Đang trực tuyến' : 'Ngoại tuyến'}</p>
          <p className="mt-1 text-xs text-slate-500">Heartbeat: {formatTime(status?.lastRunnerHeartbeatAt)}</p>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Job gần nhất</p>
          <p className="mt-2 break-all text-sm font-semibold text-slate-900">{job?.id || 'Chưa có job trong phiên này'}</p>
          <p className="mt-1 text-xs text-slate-500">{job ? `${job.action} · ${job.status}` : 'Job có thể theo dõi bằng ID.'}</p>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-slate-700" /><h2 className="text-lg font-semibold">Preflight</h2></div>
        <p className="mt-1 text-sm text-slate-600">Chỉ kiểm tra health endpoint đã cấu hình; đây không thay thế kiểm thử staging các luồng đăng nhập, thanh toán, callback và websocket.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {(['vercel-render', 'tunnel'] as const).map((mode) => (
            <div key={mode} className="flex items-center gap-3 rounded-lg border p-3">
              <span className="font-medium">{mode}</span>
              <span className={`text-sm ${preflight[mode] === true ? 'text-emerald-700' : preflight[mode] === false ? 'text-red-700' : 'text-slate-400'}`}>
                {preflight[mode] === true ? 'Đạt' : preflight[mode] === false ? 'Không đạt' : 'Chưa chạy'}
              </span>
              <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void runPreflight(mode)}>
                {busy === `preflight:${mode}` && <LoaderCircle className="animate-spin" />} Kiểm tra
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-300 bg-slate-50 p-5">
        <div className="flex items-center gap-2"><Activity className="size-5" /><h2 className="text-lg font-semibold">Thao tác production</h2></div>
        <p className="mt-1 text-sm text-slate-600">Chỉ thao tác trong cửa sổ bảo trì đã phê duyệt. Nếu runner hoặc control plane không sẵn sàng, thao tác sẽ bị từ chối.</p>
        {!status?.switchEnabled && <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Switch đang khóa. Backend chỉ chấp nhận cutover/rollback khi DEPLOYMENT_SWITCH_ENABLED được bật sau khi hoàn tất kiểm thử staging và xác nhận vận hành.</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button disabled={!cutoverReady || Boolean(busy)} onClick={() => void startCutover()}>
            {busy === 'cutover' ? <LoaderCircle className="animate-spin" /> : <ArrowLeftRight />} Cutover sang Vercel + Render
          </Button>
          <Button variant="destructive" disabled={!rollbackReady || Boolean(busy)} onClick={() => void startRollback()}>
            {busy === 'rollback' ? <LoaderCircle className="animate-spin" /> : <RotateCcw />} Khởi chạy rollback về Tunnel
          </Button>
        </div>
        {activeJob && <p role="status" className="mt-4 text-sm font-medium text-blue-800">Job {job.id}: {job.action} · {job.status}{job.recovery ? ' · khôi phục tự động' : ''}</p>}
        {job && terminalStatuses.has(job.status) && <p className="mt-4 text-sm text-slate-600">Job {job.id} kết thúc với trạng thái {job.status}.</p>}
      </section>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4"><h2 className="text-lg font-semibold">Audit API Super Admin</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3">Thời điểm</th><th className="px-5 py-3">Tác vụ</th><th className="px-5 py-3">Admin</th><th className="px-5 py-3">Luồng / job</th><th className="px-5 py-3">Kết quả</th></tr></thead>
            <tbody className="divide-y">
              {audit.map((event) => <tr key={event._id}><td className="px-5 py-3 whitespace-nowrap">{formatTime(event.createdAt)}</td><td className="px-5 py-3">{event.action}</td><td className="px-5 py-3">{event.actorName}</td><td className="px-5 py-3">{event.mode || '—'}{event.jobId ? ` · ${event.jobId}` : ''}</td><td className="px-5 py-3">{event.outcome}</td></tr>)}
              {audit.length === 0 && <tr><td className="px-5 py-6 text-center text-slate-500" colSpan={5}>Chưa có bản ghi audit.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4"><h2 className="text-lg font-semibold">Sự kiện control plane</h2><p className="mt-1 text-sm text-slate-500">Lịch sử độc lập trên Durable Object, lưu tối đa 100 sự kiện gần nhất.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3">Thời điểm</th><th className="px-5 py-3">Sự kiện</th><th className="px-5 py-3">Mode / job</th><th className="px-5 py-3">Actor</th></tr></thead>
            <tbody className="divide-y">
              {controlPlaneEvents.map((event) => <tr key={event.id}><td className="px-5 py-3 whitespace-nowrap">{formatTime(event.timestamp)}</td><td className="px-5 py-3">{event.type}{event.passed === undefined ? '' : event.passed ? ' · đạt' : ' · không đạt'}</td><td className="px-5 py-3">{event.mode || '—'}{event.jobId ? ` · ${event.jobId}` : ''}</td><td className="px-5 py-3">{event.actorId || '—'}</td></tr>)}
              {controlPlaneEvents.length === 0 && <tr><td className="px-5 py-6 text-center text-slate-500" colSpan={4}>Chưa có sự kiện control plane.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default withAdminLayout(DeploymentAdminPage, { permission: 'super-admin', featureName: 'Deployment switching' });
