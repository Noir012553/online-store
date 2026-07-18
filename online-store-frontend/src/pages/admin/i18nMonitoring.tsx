import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, CheckCircle, TrendingUp, TrendingDown, Activity, Zap } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { getAuthToken } from '../../lib/api';

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

const I18nMonitoringContent = () => {
  const { t, loadNamespace, locale } = useTranslation();
  const router = useRouter();

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

  useEffect(() => {
    loadNamespace('admin-i18n-monitoring').catch(err => {
      // Error handled by namespace loading
    });

    const token = getAuthToken();
    if (!token) {
      router.push('/auth/login');
      return;
    }

    fetchHealthData();

    if (autoRefresh) {
      const interval = setInterval(fetchHealthData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, loadNamespace]);

  const fetchHealthData = async () => {
    try {
      const token = getAuthToken();
      if (!token) {
        router.push('/auth/login');
        return;
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
      setHealth(data);

      // Keep last 20 metrics for chart
      setMetricsHistory(prev => {
        const updated = [...prev, data.metrics];
        return updated.slice(-20);
      });

      setLoading(false);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error(t('error_fetching_health_data', 'admin-errors'), error);
      }
      setMessage({
        type: 'error',
        text: error.message || t('admin_monitoring_fetch_error'),
      });
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="monitoring-loading">
        <div className="monitoring-spinner"></div>
        <p>{t('admin_monitoring_loading', 'admin-i18n-monitoring')}</p>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="monitoring-error">
        <AlertCircle size={48} />
        <p>{t('admin_monitoring_error')}</p>
        <button onClick={fetchHealthData} className="monitoring-retry-btn">
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
    <div className="monitoring-container">
      <div className="monitoring-header">
        <div>
          <h1 className="monitoring-title">
            {t('admin_monitoring_title')}
          </h1>
          <p className="monitoring-subtitle">
            {t('admin_monitoring_subtitle')}
          </p>
        </div>
        <div className="monitoring-controls">
          <button
            onClick={fetchHealthData}
            className="monitoring-refresh-btn"
            disabled={loading}
            title={t('admin_monitoring_refresh')}
          >
            <RefreshCw size={18} className={loading ? 'monitoring-spin' : ''} />
            {t('admin_monitoring_refresh')}
          </button>

          <label className="monitoring-auto-refresh">
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
              className="monitoring-interval-select"
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
        <div className={`monitoring-message monitoring-message-${message.type}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="monitoring-message-close">×</button>
        </div>
      )}

      {/* System Status Card */}
      <div className="monitoring-status-card" style={{ borderLeftColor: statusColor[health.status] }}>
        <div className="monitoring-status-header">
          <div className="monitoring-status-info">
            {getStatusIcon(health.status)}
            <div>
              <h2>{t('admin_monitoring_system_status')}</h2>
              <p className="monitoring-status-text" style={{ color: statusColor[health.status] }}>
                {t(`admin_monitoring_status_${health.status}`, health.status.toUpperCase())}
              </p>
            </div>
          </div>
          <div className="monitoring-status-time">
            <small>{new Date(health.metrics.timestamp).toLocaleTimeString()}</small>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="monitoring-metrics-grid">
        {/* Error Rate */}
        <div className="monitoring-metric-card">
          <div className="monitoring-metric-header">
            <h3>{t('admin_monitoring_error_rate')}</h3>
            {metricsHistory.length >= 2 && getTrendIcon(
              health.metrics.errorRate,
              metricsHistory[metricsHistory.length - 2].errorRate
            )}
          </div>
          <div className="monitoring-metric-value">
            {health.metrics.errorRate.toFixed(2)}%
          </div>
          <div className={`monitoring-metric-status ${health.metrics.errorRate > 5 ? 'critical' : health.metrics.errorRate > 1 ? 'warning' : 'healthy'}`}>
            {health.metrics.errorRate > 5
              ? t('admin_monitoring_critical')
              : health.metrics.errorRate > 1
              ? t('admin_monitoring_warning')
              : t('admin_monitoring_normal')}
          </div>
          <div className="monitoring-metric-bar">
            <div
              className="monitoring-metric-fill"
              style={{
                width: `${Math.min(health.metrics.errorRate, 100)}%`,
                backgroundColor: health.metrics.errorRate > 5 ? '#ef4444' : health.metrics.errorRate > 1 ? '#f59e0b' : '#10b981',
              }}
            ></div>
          </div>
        </div>

        {/* Cache Hit Rate */}
        <div className="monitoring-metric-card">
          <div className="monitoring-metric-header">
            <h3>{t('admin_monitoring_cache_hit_rate')}</h3>
            {metricsHistory.length >= 2 && getTrendIcon(
              health.metrics.cacheHitRate,
              metricsHistory[metricsHistory.length - 2].cacheHitRate
            )}
          </div>
          <div className="monitoring-metric-value">
            {health.metrics.cacheHitRate.toFixed(2)}%
          </div>
          <div className={`monitoring-metric-status ${health.metrics.cacheHitRate < 80 ? 'critical' : health.metrics.cacheHitRate < 90 ? 'warning' : 'healthy'}`}>
            {health.metrics.cacheHitRate < 80
              ? t('admin_monitoring_critical')
              : health.metrics.cacheHitRate < 90
              ? t('admin_monitoring_warning')
              : t('admin_monitoring_healthy')}
          </div>
          <div className="monitoring-metric-bar">
            <div
              className="monitoring-metric-fill"
              style={{
                width: `${Math.min(health.metrics.cacheHitRate, 100)}%`,
                backgroundColor: health.metrics.cacheHitRate < 80 ? '#ef4444' : health.metrics.cacheHitRate < 90 ? '#f59e0b' : '#10b981',
              }}
            ></div>
          </div>
        </div>

        {/* API Latency */}
        <div className="monitoring-metric-card">
          <div className="monitoring-metric-header">
            <h3>{t('admin_monitoring_api_latency')}</h3>
            {metricsHistory.length >= 2 && getTrendIcon(
              health.metrics.apiLatency,
              metricsHistory[metricsHistory.length - 2].apiLatency
            )}
          </div>
          <div className="monitoring-metric-value">
            {health.metrics.apiLatency.toFixed(0)}ms
          </div>
          <div className={`monitoring-metric-status ${health.metrics.apiLatency > 2000 ? 'critical' : health.metrics.apiLatency > 1000 ? 'warning' : 'healthy'}`}>
            {health.metrics.apiLatency > 2000
              ? t('admin_monitoring_critical')
              : health.metrics.apiLatency > 1000
              ? t('admin_monitoring_warning')
              : t('admin_monitoring_normal')}
          </div>
          <div className="monitoring-metric-bar">
            <div
              className="monitoring-metric-fill"
              style={{
                width: `${Math.min((health.metrics.apiLatency / 5000) * 100, 100)}%`,
                backgroundColor: health.metrics.apiLatency > 2000 ? '#ef4444' : health.metrics.apiLatency > 1000 ? '#f59e0b' : '#10b981',
              }}
            ></div>
          </div>
        </div>

        {/* Queue Length */}
        <div className="monitoring-metric-card">
          <div className="monitoring-metric-header">
            <h3>{t('admin_monitoring_queue_length')}</h3>
          </div>
          <div className="monitoring-metric-value">
            {health.metrics.queueLength}
          </div>
          <div className={`monitoring-metric-status ${health.metrics.queueLength > 100 ? 'critical' : health.metrics.queueLength > 50 ? 'warning' : 'healthy'}`}>
            {health.metrics.queueLength > 100
              ? t('admin_monitoring_critical')
              : health.metrics.queueLength > 50
              ? t('admin_monitoring_warning')
              : t('admin_monitoring_normal')}
          </div>
          <div className="monitoring-metric-bar">
            <div
              className="monitoring-metric-fill"
              style={{
                width: `${Math.min((health.metrics.queueLength / 200) * 100, 100)}%`,
                backgroundColor: health.metrics.queueLength > 100 ? '#ef4444' : health.metrics.queueLength > 50 ? '#f59e0b' : '#10b981',
              }}
            ></div>
          </div>
        </div>

        {/* Database Latency */}
        <div className="monitoring-metric-card">
          <div className="monitoring-metric-header">
            <h3>{t('admin_monitoring_db_latency')}</h3>
            {metricsHistory.length >= 2 && getTrendIcon(
              health.metrics.databaseLatency,
              metricsHistory[metricsHistory.length - 2].databaseLatency
            )}
          </div>
          <div className="monitoring-metric-value">
            {health.metrics.databaseLatency.toFixed(0)}ms
          </div>
          <div className={`monitoring-metric-status ${health.metrics.databaseLatency > 500 ? 'critical' : health.metrics.databaseLatency > 200 ? 'warning' : 'healthy'}`}>
            {health.metrics.databaseLatency > 500
              ? t('admin_monitoring_critical')
              : health.metrics.databaseLatency > 200
              ? t('admin_monitoring_warning')
              : t('admin_monitoring_normal')}
          </div>
          <div className="monitoring-metric-bar">
            <div
              className="monitoring-metric-fill"
              style={{
                width: `${Math.min((health.metrics.databaseLatency / 1000) * 100, 100)}%`,
                backgroundColor: health.metrics.databaseLatency > 500 ? '#ef4444' : health.metrics.databaseLatency > 200 ? '#f59e0b' : '#10b981',
              }}
            ></div>
          </div>
        </div>

        {/* Memory Usage */}
        <div className="monitoring-metric-card">
          <div className="monitoring-metric-header">
            <h3>{t('admin_monitoring_memory_usage')}</h3>
          </div>
          <div className="monitoring-metric-value">
            {health.metrics.memoryUsage.toFixed(0)}MB
          </div>
          <div className={`monitoring-metric-status ${health.metrics.memoryUsage > 1024 ? 'critical' : health.metrics.memoryUsage > 512 ? 'warning' : 'healthy'}`}>
            {health.metrics.memoryUsage > 1024
              ? t('admin_monitoring_critical')
              : health.metrics.memoryUsage > 512
              ? t('admin_monitoring_warning')
              : t('admin_monitoring_normal')}
          </div>
          <div className="monitoring-metric-bar">
            <div
              className="monitoring-metric-fill"
              style={{
                width: `${Math.min((health.metrics.memoryUsage / 2048) * 100, 100)}%`,
                backgroundColor: health.metrics.memoryUsage > 1024 ? '#ef4444' : health.metrics.memoryUsage > 512 ? '#f59e0b' : '#10b981',
              }}
            ></div>
          </div>
        </div>
      </div>

      {/* Request Statistics */}
      <div className="monitoring-stats-section">
        <h2>{t('admin_monitoring_request_stats')}</h2>
        <div className="monitoring-stats-grid">
          <div className="monitoring-stat-item">
            <div className="monitoring-stat-label">{t('admin_monitoring_total_requests')}</div>
            <div className="monitoring-stat-value">{health.metrics.totalRequests.toLocaleString()}</div>
            <small>{t('admin_monitoring_success')}: {health.metrics.successCount} | {t('admin_monitoring_failure')}: {health.metrics.failureCount}</small>
          </div>
          <div className="monitoring-stat-item">
            <div className="monitoring-stat-label">{t('admin_monitoring_rate_limited')}</div>
            <div className="monitoring-stat-value">{health.metrics.rateLimitedRequests}</div>
            <small>{((health.metrics.rateLimitedRequests / health.metrics.totalRequests) * 100).toFixed(2)}% {t('admin_monitoring_of_total')}</small>
          </div>
          <div className="monitoring-stat-item">
            <div className="monitoring-stat-label">{t('admin_monitoring_retried')}</div>
            <div className="monitoring-stat-value">{health.metrics.retriedRequests}</div>
            <small>{((health.metrics.retriedRequests / health.metrics.totalRequests) * 100).toFixed(2)}% {t('admin_monitoring_of_total')}</small>
          </div>
        </div>
      </div>

      {/* Language Metrics */}
      {Object.keys(health.languageMetrics).length > 0 && (
        <div className="monitoring-language-section">
          <h2>{t('admin_monitoring_language_metrics')}</h2>
          <div className="monitoring-language-grid">
            {Object.entries(health.languageMetrics).map(([lang, metrics]) => (
              <div key={lang} className="monitoring-language-card">
                <div className="monitoring-language-header">
                  <h3>{t(`locale_label_${lang}`, 'admin-translation')}</h3>
                  <span className={`monitoring-language-status ${metrics.errorRate > 5 ? 'critical' : metrics.errorRate > 1 ? 'warning' : 'healthy'}`}>
                    {metrics.errorRate.toFixed(2)}% {t('admin_monitoring_error_percent')}
                  </span>
                </div>
                <div className="monitoring-language-metrics">
                  <div>
                    <span className="monitoring-language-label">{t('admin_monitoring_translations')}</span>
                    <span className="monitoring-language-value">{metrics.translationCount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="monitoring-language-label">{t('admin_monitoring_cache_size')}</span>
                    <span className="monitoring-language-value">{(metrics.cacheSize / 1024 / 1024).toFixed(2)}MB</span>
                  </div>
                  <div>
                    <span className="monitoring-language-label">{t('admin_monitoring_last_updated')}</span>
                    <span className="monitoring-language-value">{new Date(metrics.lastUpdated).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts */}
      {health.alerts.length > 0 && (
        <div className="monitoring-alerts-section">
          <h2>{t('admin_monitoring_alerts')}</h2>
          <div className="monitoring-alerts-list">
            {health.alerts.map(alert => (
              <div key={alert.id} className={`monitoring-alert monitoring-alert-${alert.level}`}>
                <div className="monitoring-alert-icon">
                  {alert.level === 'error' && <AlertCircle size={20} />}
                  {alert.level === 'warning' && <AlertCircle size={20} />}
                  {alert.level === 'info' && <Activity size={20} />}
                </div>
                <div className="monitoring-alert-content">
                  <p className="monitoring-alert-message">{alert.message}</p>
                  <small>{new Date(alert.timestamp).toLocaleString()}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .monitoring-container {
          padding: 20px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .monitoring-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }

        .monitoring-title {
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 4px 0;
          color: #1a1a1a;
        }

        .monitoring-subtitle {
          font-size: 14px;
          color: #666;
          margin: 0;
        }

        .monitoring-controls {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
        }

        .monitoring-refresh-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background-color: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .monitoring-refresh-btn:hover:not(:disabled) {
          background-color: #e8e8e8;
          border-color: #999;
        }

        .monitoring-refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .monitoring-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .monitoring-auto-refresh {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 14px;
          color: #333;
        }

        .monitoring-interval-select {
          padding: 8px 12px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
        }

        .monitoring-message {
          padding: 12px 16px;
          border-radius: 6px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
        }

        .monitoring-message-success {
          background-color: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .monitoring-message-error {
          background-color: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .monitoring-message-info {
          background-color: #d1ecf1;
          color: #0c5460;
          border: 1px solid #bee5eb;
        }

        .monitoring-message-close {
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          font-size: 20px;
          padding: 0;
          line-height: 1;
        }

        .monitoring-loading,
        .monitoring-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          color: #666;
        }

        .monitoring-spinner {
          border: 3px solid #f3f3f3;
          border-top: 3px solid #007bff;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        .monitoring-retry-btn {
          margin-top: 16px;
          padding: 10px 20px;
          background-color: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .monitoring-retry-btn:hover {
          background-color: #0056b3;
        }

        .monitoring-status-card {
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 24px;
          border-left: 4px solid;
        }

        .monitoring-status-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .monitoring-status-info {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .monitoring-status-info h2 {
          margin: 0;
          font-size: 18px;
        }

        .monitoring-status-text {
          margin: 4px 0 0 0;
          font-size: 14px;
          font-weight: 600;
        }

        .monitoring-status-time {
          text-align: right;
        }

        .monitoring-metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .monitoring-metric-card {
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 16px;
        }

        .monitoring-metric-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .monitoring-metric-header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #333;
        }

        .monitoring-metric-value {
          font-size: 28px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 8px;
        }

        .monitoring-metric-status {
          display: inline-block;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 4px;
          margin-bottom: 12px;
        }

        .monitoring-metric-status.healthy {
          background-color: #d4edda;
          color: #155724;
        }

        .monitoring-metric-status.warning {
          background-color: #fff3cd;
          color: #856404;
        }

        .monitoring-metric-status.critical {
          background-color: #f8d7da;
          color: #721c24;
        }

        .monitoring-metric-bar {
          height: 8px;
          background-color: #f0f0f0;
          border-radius: 4px;
          overflow: hidden;
        }

        .monitoring-metric-fill {
          height: 100%;
          transition: width 0.3s ease;
        }

        .monitoring-stats-section,
        .monitoring-language-section,
        .monitoring-alerts-section {
          margin-bottom: 24px;
        }

        .monitoring-stats-section h2,
        .monitoring-language-section h2,
        .monitoring-alerts-section h2 {
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 16px 0;
          color: #1a1a1a;
        }

        .monitoring-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .monitoring-stat-item {
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 16px;
        }

        .monitoring-stat-label {
          font-size: 12px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .monitoring-stat-value {
          font-size: 28px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 8px;
        }

        .monitoring-stat-item small {
          display: block;
          font-size: 12px;
          color: #999;
        }

        .monitoring-language-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
        }

        .monitoring-language-card {
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 16px;
        }

        .monitoring-language-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid #eee;
        }

        .monitoring-language-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
        }

        .monitoring-language-status {
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 4px;
        }

        .monitoring-language-status.healthy {
          background-color: #d4edda;
          color: #155724;
        }

        .monitoring-language-status.warning {
          background-color: #fff3cd;
          color: #856404;
        }

        .monitoring-language-status.critical {
          background-color: #f8d7da;
          color: #721c24;
        }

        .monitoring-language-metrics {
          display: grid;
          gap: 12px;
        }

        .monitoring-language-metrics > div {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .monitoring-language-label {
          font-size: 12px;
          color: #666;
        }

        .monitoring-language-value {
          font-size: 14px;
          font-weight: 600;
          color: #333;
        }

        .monitoring-alerts-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .monitoring-alert {
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 12px;
          display: flex;
          gap: 12px;
        }

        .monitoring-alert-icon {
          flex-shrink: 0;
          display: flex;
          align-items: center;
        }

        .monitoring-alert-error .monitoring-alert-icon {
          color: #ef4444;
        }

        .monitoring-alert-warning .monitoring-alert-icon {
          color: #f59e0b;
        }

        .monitoring-alert-info .monitoring-alert-icon {
          color: #3b82f6;
        }

        .monitoring-alert-content {
          flex: 1;
          min-width: 0;
        }

        .monitoring-alert-message {
          margin: 0;
          font-size: 14px;
          color: #333;
        }

        .monitoring-alert small {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: #999;
        }

        @media (max-width: 768px) {
          .monitoring-header {
            flex-direction: column;
          }

          .monitoring-controls {
            width: 100%;
            justify-content: flex-start;
          }

          .monitoring-metrics-grid {
            grid-template-columns: 1fr;
          }

          .monitoring-stats-grid {
            grid-template-columns: 1fr;
          }

          .monitoring-language-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
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
