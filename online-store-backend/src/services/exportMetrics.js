const startedAt = Date.now();

const counters = {
  enqueued: 0,
  started: 0,
  succeeded: 0,
  failed: 0,
  cancelled: 0,
  retried: 0,
  cleanupRuns: 0,
  cleanupErrors: 0,
};

const durations = {
  count: 0,
  totalMs: 0,
  maxMs: 0,
};

const recordExportEvent = (event, durationMs) => {
  if (Object.prototype.hasOwnProperty.call(counters, event)) counters[event] += 1;
  if (Number.isFinite(durationMs)) {
    durations.count += 1;
    durations.totalMs += durationMs;
    durations.maxMs = Math.max(durations.maxMs, durationMs);
  }
};

const getExportMetrics = () => ({
  uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  counters: { ...counters },
  durations: {
    count: durations.count,
    totalMs: durations.totalMs,
    maxMs: durations.maxMs,
    averageMs: durations.count ? Math.round(durations.totalMs / durations.count) : 0,
  },
});

const getExportMetricsPrometheus = () => {
  const metrics = getExportMetrics();
  const lines = [
    '# HELP export_jobs_total Export jobs by lifecycle event.',
    '# TYPE export_jobs_total counter',
  ];
  Object.entries(metrics.counters).forEach(([event, value]) => {
    lines.push(`export_jobs_total{event="${event}"} ${value}`);
  });
  lines.push('# HELP export_job_duration_ms Export job duration summary.', '# TYPE export_job_duration_ms summary');
  lines.push(`export_job_duration_ms_count ${metrics.durations.count}`);
  lines.push(`export_job_duration_ms_sum ${metrics.durations.totalMs}`);
  lines.push(`export_job_duration_ms_max ${metrics.durations.maxMs}`);
  return `${lines.join('\n')}\n`;
};

module.exports = { recordExportEvent, getExportMetrics, getExportMetricsPrometheus };
