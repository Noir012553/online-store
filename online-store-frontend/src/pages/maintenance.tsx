import { useEffect, useState } from 'react';
import { settingsAPI } from '../lib/api';

export const getServerSideProps = async () => ({ props: {} });

export default function MaintenancePage() {
  const [maintenance, setMaintenance] = useState<{ enabled: boolean; message: string; scheduledStart: string | null; scheduledEnd: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    settingsAPI.getPublic().then((settings) => {
      if (active) setMaintenance(settings.maintenance);
    }).catch(() => {
      if (active) setMaintenance({ enabled: true, message: '', scheduledStart: null, scheduledEnd: null });
    });
    return () => { active = false; };
  }, []);

  const formatTime = (value: string | null) => value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-white">
      <section className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl shadow-black/30 sm:p-12">
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/15 text-2xl font-bold text-red-300" aria-hidden="true">M</div>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-red-300">Đang bảo trì</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Chúng tôi sẽ sớm quay lại</h1>
        <p className="mx-auto mt-5 max-w-xl whitespace-pre-wrap text-base leading-7 text-slate-300">
          {maintenance?.message || 'Website đang được nâng cấp để phục vụ bạn tốt hơn. Vui lòng quay lại sau.'}
        </p>
        {(maintenance?.scheduledStart || maintenance?.scheduledEnd) && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-slate-300">
            <p className="font-medium text-white">Thời gian dự kiến</p>
            <p className="mt-2">
              {maintenance.scheduledStart ? formatTime(maintenance.scheduledStart) : 'Chưa xác định'}
              {' – '}
              {maintenance.scheduledEnd ? formatTime(maintenance.scheduledEnd) : 'Chưa xác định'}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
