import { Activity, ArrowLeftRight, CircleAlert, LoaderCircle, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { Button } from '../../components/ui/button';
import { deploymentAPI, type DeploymentAuditEvent, type DeploymentControlPlaneEvent, type DeploymentJob, type DeploymentStatus } from '../../lib/api';

export const getServerSideProps = async () => ({ props: {} });

const terminalStatuses = new Set(['succeeded', 'failed']);
const formatTime = (value?: number | string | null) => value ? new Date(value).toLocaleString() : '—';

const getDeploymentErrorMessage = (error: unknown, fallback: string) => {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === 'DEPLOYMENT_ROUTER_NOT_CONFIGURED') {
    return 'Cloudflare Tunnel hiện tại vẫn có; phần chưa cấu hình là Worker deployment router (DEPLOYMENT_ROUTER_URL và DEPLOYMENT_CONTROL_TOKEN ở backend). Vì vậy trang chưa đọc được trạng thái điều phối và cutover/rollback vẫn bị khóa.';
  }
  if (code === 'DEPLOYMENT_ROUTER_UNAVAILABLE') {
    return 'Cloudflare Tunnel hiện tại vẫn có; chưa kết nối được Worker deployment router. Kiểm tra Worker và cấu hình backend; cutover/rollback vẫn bị khóa.';
  }
  return error instanceof Error ? error.message : fallback;
};

function DeploymentAdminPage() {
  const [status, setStatus] = useState<DeploymentStatus | null>(null);
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
