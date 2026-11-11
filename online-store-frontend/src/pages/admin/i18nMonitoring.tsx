import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, AlertCircle, CheckCircle, TrendingUp, TrendingDown, Activity, Zap } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { getAuthToken } from '../../lib/api';
import { getUserFriendlyErrorMessage } from '../../lib/errorHandler';
import { formatNumber } from '../../lib/utils';
import { getIntlLocale } from '../../lib/localeUtils';
import { HamsterLoader } from '../../components/HamsterLoader';
import styles from '../../css/pages/admin/i18nMonitoring.module.css';

interface HealthMetrics {
  timestamp: string;
  errorRate: number;
  cacheHitRate: number;
  apiLatency: number;
  queueLength: number;
  databaseLatency: number;
  memoryUsage: number;
  successCount: number;
  failureCount: number;
  totalRequests: number;
  rateLimitedRequests: number;
  retriedRequests: number;
}

interface LanguageMetrics {
  [language: string]: {
    errorRate: number;
    translationCount: number;
    cacheSize: number;
    lastUpdated: string;
  };
}

interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical';
  metrics: HealthMetrics;
  languageMetrics: LanguageMetrics;
  alerts: Array<{
    id: string;
    level: 'warning' | 'error' | 'info';
    message: string;
    timestamp: string;
  }>;
}

const messageTypeClasses = {
  success: styles.monitoringMessageSuccess,
  error: styles.monitoringMessageError,
  info: styles.monitoringMessageInfo,
};

const metricStatusClasses = {
  healthy: styles.healthy,
  warning: styles.warning,
  critical: styles.critical,
};

const alertLevelClasses = {
  warning: styles.monitoringAlertWarning,
  error: styles.monitoringAlertError,
  info: styles.monitoringAlertInfo,
};

const I18nMonitoringContent = () => {
  const { t, loadNamespace, locale } = useTranslation();

  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10000); // 10 seconds
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const [metricsHistory, setMetricsHistory] = useState<HealthMetrics[]>([]);
  const [selectedTimeRange, setSelectedTimeRange] = useState('1h'); // 1h, 6h, 24h

  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
  const fetchRequestIdRef = useRef(0);

  const fetchHealthData = useCallback(async () => {
    const requestId = ++fetchRequestIdRef.current;
    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error('auth_required');
      }

      const response = await fetch(`${API_BASE}/api/health/i18n?lang=${locale}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(t('admin_monitoring_fetch_failed'));
      }

      const data: SystemHealth = await response.json();
      if (requestId !== fetchRequestIdRef.current) return;
      setHealth(data);

      // Keep last 20 metrics for chart
      setMetricsHistory(prev => {
        const updated = [...prev, data.metrics];
        return updated.slice(-20);
      });

      setLoading(false);
    } catch (error) {
      if (requestId !== fetchRequestIdRef.current) return;
      if (process.env.NODE_ENV === 'development') {
        console.error(t('error_fetching_health_data', 'admin-errors'), error);
      }
      setMessage({
        type: 'error',
        text: getUserFriendlyErrorMessage(error, t),
      });
      setLoading(false);
    }
  }, [API_BASE, locale, t]);

  useEffect(() => {
    loadNamespace('admin-i18n-monitoring').catch(() => {});
    fetchHealthData();

    const interval = autoRefresh ? setInterval(fetchHealthData, refreshInterval) : null;
    return () => {
      if (interval) clearInterval(interval);
      fetchRequestIdRef.current += 1;
    };
  }, [autoRefresh, refreshInterval, loadNamespace, fetchHealthData]);

  if (loading) {
    return (
      <div className={styles.monitoringLoading}>
        <HamsterLoader size={96} className="mb-4" />
        <p>{t('admin_monitoring_loading', 'admin-i18n-monitoring')}</p>
      </div>
    );
  }

  if (!health) {
    return (
      <div className={styles.monitoringError}>
        <AlertCircle size={48} />
        <p>{t('admin_monitoring_error')}</p>
        <button onClick={fetchHealthData} className={styles.monitoringRetryBtn}>
          {t('admin_monitoring_retry')}
        </button>
      </div>
    );
  }

  const statusColor = {
    healthy: '#10b981',
    warning: '#f59e0b',
    critical: '#ef4444',
  };

  const getStatusIcon = (status: string) => {
    if (status === 'healthy') return <CheckCircle size={20} color={statusColor.healthy} />;
    if (status === 'warning') return <AlertCircle size={20} color={statusColor.warning} />;
    return <AlertCircle size={20} color={statusColor.critical} />;
  };

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) return <TrendingUp size={16} color="#ef4444" />;
    if (current < previous) return <TrendingDown size={16} color="#10b981" />;
    return null;
  };

  return (
    <div className={styles.monitoringContainer}>
      <div className={styles.monitoringHeader}>
        <div>
          <h1 className={styles.monitoringTitle}>
            {t('admin_monitoring_title')}
          </h1>
          <p className={styles.monitoringSubtitle}>
            {t('admin_monitoring_subtitle')}
          </p>
        </div>
        <div className={styles.monitoringControls}>
          <button
            onClick={fetchHealthData}
            className={styles.monitoringRefreshBtn}
            disabled={loading}
            title={t('admin_monitoring_refresh')}
          >
            <RefreshCw size={18} className={loading ? styles.monitoringSpin : undefined} />
            {t('admin_monitoring_refresh')}
          </button>

          <label className={styles.monitoringAutoRefresh}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            <span>{t('admin_monitoring_auto_refresh')}</span>
          </label>

          {autoRefresh && (
            <select
              value={refreshInterval}
              onChange={e => setRefreshInterval(Number(e.target.value))}
              className={styles.monitoringIntervalSelect}
            >
              <option value={5000}>{t('admin_monitoring_interval_5s')}</option>
              <option value={10000}>{t('admin_monitoring_interval_10s')}</option>
              <option value={30000}>{t('admin_monitoring_interval_30s')}</option>
              <option value={60000}>{t('admin_monitoring_interval_1m')}</option>
            </select>
          )}
        </div>
      </div>

      {message && (
        <div className={`${styles.monitoringMessage} ${messageTypeClasses[message.type]}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className={styles.monitoringMessageClose}>×</button>
        </div>
      )}

      {/* System Status Card */}
      <div className={styles.monitoringStatusCard} style={{ borderLeftColor: statusColor[health.status] }}>
        <div className={styles.monitoringStatusHeader}>
          <div className={styles.monitoringStatusInfo}>
            {getStatusIcon(health.status)}
            <div>
              <h2>{t('admin_monitoring_system_status')}</h2>
              <p className={styles.monitoringStatusText} style={{ color: statusColor[health.status] }}>
                {t(`admin_monitoring_status_${health.status}`, 'admin-i18n-monitoring')}
              </p>
            </div>
          </div>
          <div className={styles.monitoringStatusTime}>
            <small>{new Intl.DateTimeFormat(getIntlLocale(locale), {
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
            }).format(new Date(health.metrics.timestamp))}</small>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className={styles.monitoringMetricsGrid}>
        {/* Error Rate */}
        <div className={styles.monitoringMetricCard}>
          <div className={styles.monitoringMetricHeader}>
            <h3>{t('admin_monitoring_error_rate')}</h3>
            {metricsHistory.length >= 2 && getTrendIcon(
              health.metrics.errorRate,
              metricsHistory[metricsHistory.length - 2].errorRate
            )}
          </div>
          <div className={styles.monitoringMetricValue}>
            {formatNumber(health.metrics.errorRate, locale, 2)}%
          </div>
          <div className={`${styles.monitoringMetricStatus} ${metricStatusClasses[health.metrics.errorRate > 5 ? 'critical' : health.metrics.errorRate > 1 ? 'warning' : 'healthy']}`}>
            {health.metrics.errorRate > 5
              ? t('admin_monitoring_critical')
              : health.metrics.errorRate > 1
              ? t('admin_monitoring_warning')
              : t('admin_monitoring_normal')}
          </div>
          <div className={styles.monitoringMetricBar}>
            <div
              className={styles.monitoringMetricFill}
              style={{
                width: `${Math.min(health.metrics.errorRate, 100)}%`,
                backgroundColor: health.metrics.errorRate > 5 ? '#ef4444' : health.metrics.errorRate > 1 ? '#f59e0b' : '#10b981',
              }}
            ></div>
          </div>
        </div>

        {/* Cache Hit Rate */}
        <div className={styles.monitoringMetricCard}>
          <div className={styles.monitoringMetricHeader}>
            <h3>{t('admin_monitoring_cache_hit_rate')}</h3>
            {metricsHistory.length >= 2 && getTrendIcon(
              health.metrics.cacheHitRate,
              metricsHistory[metricsHistory.length - 2].cacheHitRate
            )}
          </div>
          <div className={styles.monitoringMetricValue}>
            {formatNumber(health.metrics.cacheHitRate, locale, 2)}%
          </div>
          <div className={`${styles.monitoringMetricStatus} ${metricStatusClasses[health.metrics.cacheHitRate < 80 ? 'critical' : health.metrics.cacheHitRate < 90 ? 'warning' : 'healthy']}`}>
            {health.metrics.cacheHitRate < 80
              ? t('admin_monitoring_critical')
              : health.metrics.cacheHitRate < 90
              ? t('admin_monitoring_warning')
              : t('admin_monitoring_healthy')}
          </div>
          <div className={styles.monitoringMetricBar}>
            <div
              className={styles.monitoringMetricFill}
              style={{
                width: `${Math.min(health.metrics.cacheHitRate, 100)}%`,
                backgroundColor: health.metrics.cacheHitRate < 80 ? '#ef4444' : health.metrics.cacheHitRate < 90 ? '#f59e0b' : '#10b981',
              }}
            ></div>
          </div>
        </div>

        {/* API Latency */}
        <div className={styles.monitoringMetricCard}>
          <div className={styles.monitoringMetricHeader}>
            <h3>{t('admin_monitoring_api_latency')}</h3>
            {metricsHistory.length >= 2 && getTrendIcon(
              health.metrics.apiLatency,
              metricsHistory[metricsHistory.length - 2].apiLatency
            )}
          </div>
          <div className={styles.monitoringMetricValue}>
            {formatNumber(health.metrics.apiLatency, locale, 0)}ms
          </div>
          <div className={`${styles.monitoringMetricStatus} ${metricStatusClasses[health.metrics.apiLatency > 2000 ? 'critical' : health.metrics.apiLatency > 1000 ? 'warning' : 'healthy']}`}>
            {health.metrics.apiLatency > 2000
              ? t('admin_monitoring_critical')
              : health.metrics.apiLatency > 1000
              ? t('admin_monitoring_warning')
              : t('admin_monitoring_normal')}
          </div>
          <div className={styles.monitoringMetricBar}>
            <div
              className={styles.monitoringMetricFill}
              style={{
                width: `${Math.min((health.metrics.apiLatency / 5000) * 100, 100)}%`,
                backgroundColor: health.metrics.apiLatency > 2000 ? '#ef4444' : health.metrics.apiLatency > 1000 ? '#f59e0b' : '#10b981',
              }}
            ></div>
          </div>
        </div>

        {/* Queue Length */}
        <div className={styles.monitoringMetricCard}>
          <div className={styles.monitoringMetricHeader}>
            <h3>{t('admin_monitoring_queue_length')}</h3>
          </div>
          <div className={styles.monitoringMetricValue}>
            {health.metrics.queueLength}
          </div>
          <div className={`${styles.monitoringMetricStatus} ${metricStatusClasses[health.metrics.queueLength > 100 ? 'critical' : health.metrics.queueLength > 50 ? 'warning' : 'healthy']}`}>
            {health.metrics.queueLength > 100
              ? t('admin_monitoring_critical')
              : health.metrics.queueLength > 50
              ? t('admin_monitoring_warning')
              : t('admin_monitoring_normal')}
          </div>
          <div className={styles.monitoringMetricBar}>
            <div
              className={styles.monitoringMetricFill}
              style={{
                width: `${Math.min((health.metrics.queueLength / 200) * 100, 100)}%`,
                backgroundColor: health.metrics.queueLength > 100 ? '#ef4444' : health.metrics.queueLength > 50 ? '#f59e0b' : '#10b981',
              }}
            ></div>
          </div>
        </div>

        {/* Database Latency */}
        <div className={styles.monitoringMetricCard}>
          <div className={styles.monitoringMetricHeader}>
            <h3>{t('admin_monitoring_db_latency')}</h3>
            {metricsHistory.length >= 2 && getTrendIcon(
              health.metrics.databaseLatency,
              metricsHistory[metricsHistory.length - 2].databaseLatency
            )}
          </div>
          <div className={styles.monitoringMetricValue}>
            {formatNumber(health.metrics.databaseLatency, locale, 0)}ms
          </div>
          <div className={`${styles.monitoringMetricStatus} ${metricStatusClasses[health.metrics.databaseLatency > 500 ? 'critical' : health.metrics.databaseLatency > 200 ? 'warning' : 'healthy']}`}>
            {health.metrics.databaseLatency > 500
              ? t('admin_monitoring_critical')
              : health.metrics.databaseLatency > 200
              ? t('admin_monitoring_warning')
              : t('admin_monitoring_normal')}
          </div>
          <div className={styles.monitoringMetricBar}>
            <div
              className={styles.monitoringMetricFill}
              style={{
                width: `${Math.min((health.metrics.databaseLatency / 1000) * 100, 100)}%`,
                backgroundColor: health.metrics.databaseLatency > 500 ? '#ef4444' : health.metrics.databaseLatency > 200 ? '#f59e0b' : '#10b981',
              }}
            ></div>
          </div>
        </div>

        {/* Memory Usage */}
        <div className={styles.monitoringMetricCard}>
          <div className={styles.monitoringMetricHeader}>
            <h3>{t('admin_monitoring_memory_usage')}</h3>
          </div>
          <div className={styles.monitoringMetricValue}>
            {formatNumber(health.metrics.memoryUsage, locale, 0)}MB
          </div>
          <div className={`${styles.monitoringMetricStatus} ${metricStatusClasses[health.metrics.memoryUsage > 1024 ? 'critical' : health.metrics.memoryUsage > 512 ? 'warning' : 'healthy']}`}>
            {health.metrics.memoryUsage > 1024
              ? t('admin_monitoring_critical')
              : health.metrics.memoryUsage > 512
              ? t('admin_monitoring_warning')
              : t('admin_monitoring_normal')}
          </div>
          <div className={styles.monitoringMetricBar}>
            <div
              className={styles.monitoringMetricFill}
              style={{
                width: `${Math.min((health.metrics.memoryUsage / 2048) * 100, 100)}%`,
                backgroundColor: health.metrics.memoryUsage > 1024 ? '#ef4444' : health.metrics.memoryUsage > 512 ? '#f59e0b' : '#10b981',
              }}
            ></div>
          </div>
        </div>
      </div>

      {/* Request Statistics */}
      <div className={styles.monitoringStatsSection}>
        <h2>{t('admin_monitoring_request_stats')}</h2>
        <div className={styles.monitoringStatsGrid}>
          <div className={styles.monitoringStatItem}>
            <div className={styles.monitoringStatLabel}>{t('admin_monitoring_total_requests')}</div>
            <div className={styles.monitoringStatValue}>{health.metrics.totalRequests.toLocaleString()}</div>
            <small>{t('admin_monitoring_success')}: {health.metrics.successCount} | {t('admin_monitoring_failure')}: {health.metrics.failureCount}</small>
          </div>
          <div className={styles.monitoringStatItem}>
            <div className={styles.monitoringStatLabel}>{t('admin_monitoring_rate_limited')}</div>
            <div className={styles.monitoringStatValue}>{health.metrics.rateLimitedRequests}</div>
            <small>{((health.metrics.rateLimitedRequests / health.metrics.totalRequests) * 100).toFixed(2)}% {t('admin_monitoring_of_total')}</small>
          </div>
          <div className={styles.monitoringStatItem}>
            <div className={styles.monitoringStatLabel}>{t('admin_monitoring_retried')}</div>
            <div className={styles.monitoringStatValue}>{health.metrics.retriedRequests}</div>
            <small>{((health.metrics.retriedRequests / health.metrics.totalRequests) * 100).toFixed(2)}% {t('admin_monitoring_of_total')}</small>
          </div>
        </div>
      </div>

      {/* Language Metrics */}
      {Object.keys(health.languageMetrics).length > 0 && (
        <div className={styles.monitoringLanguageSection}>
          <h2>{t('admin_monitoring_language_metrics')}</h2>
          <div className={styles.monitoringLanguageGrid}>
            {Object.entries(health.languageMetrics).map(([lang, metrics]) => (
              <div key={lang} className={styles.monitoringLanguageCard}>
                <div className={styles.monitoringLanguageHeader}>
                  <h3>{t(`locale_label_${lang}`, 'admin-translation')}</h3>
                  <span className={`${styles.monitoringLanguageStatus} ${metricStatusClasses[metrics.errorRate > 5 ? 'critical' : metrics.errorRate > 1 ? 'warning' : 'healthy']}`}>
                    {metrics.errorRate.toFixed(2)}% {t('admin_monitoring_error_percent')}
                  </span>
                </div>
                <div className={styles.monitoringLanguageMetrics}>
                  <div>
                    <span className={styles.monitoringLanguageLabel}>{t('admin_monitoring_translations')}</span>
                    <span className={styles.monitoringLanguageValue}>{metrics.translationCount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className={styles.monitoringLanguageLabel}>{t('admin_monitoring_cache_size')}</span>
                    <span className={styles.monitoringLanguageValue}>{(metrics.cacheSize / 1024 / 1024).toFixed(2)}MB</span>
                  </div>
                  <div>
                    <span className={styles.monitoringLanguageLabel}>{t('admin_monitoring_last_updated')}</span>
                    <span className={styles.monitoringLanguageValue}>{new Date(metrics.lastUpdated).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts */}
      {health.alerts.length > 0 && (
        <div className={styles.monitoringAlertsSection}>
          <h2>{t('admin_monitoring_alerts')}</h2>
          <div className={styles.monitoringAlertsList}>
            {health.alerts.map(alert => (
              <div key={alert.id} className={`${styles.monitoringAlert} ${alertLevelClasses[alert.level]}`}>
                <div className={styles.monitoringAlertIcon}>
                  {alert.level === 'error' && <AlertCircle size={20} />}
                  {alert.level === 'warning' && <AlertCircle size={20} />}
                  {alert.level === 'info' && <Activity size={20} />}
                </div>
                <div className={styles.monitoringAlertContent}>
                  <p className={styles.monitoringAlertMessage}>{alert.message}</p>
                  <small>{new Date(alert.timestamp).toLocaleString()}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


    </div>
  );
};

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default withAdminLayout(I18nMonitoringContent, {
  permission: 'manage:translations',
  featureName: 'i18n Monitoring',
});
