const cloudflareAiService = require('../services/cloudflareAiService');

class HealthController {
  static async checkCloudflareHealth(req, res) {
    try {
      const health = cloudflareAiService.getHealth();
      const statusCode = health.status === 'healthy' ? 200 : 503;

      res.status(statusCode).json({
        service: 'cloudflare-ai',
        ...health,
      });
    } catch (error) {
      res.status(500).json({
        service: 'cloudflare-ai',
        status: 'error',
        error: error.message,
      });
    }
  }

  static async getCloudflareStats(req, res) {
    try {
      const stats = cloudflareAiService.getStats();

      res.json({
        service: 'cloudflare-ai',
        timestamp: new Date().toISOString(),
        ...stats,
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  }

  static async resetCloudflareStats(req, res) {
    try {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
          message: 'Only admins can reset stats',
        });
      }

      cloudflareAiService.resetStats();

      res.json({
        message: 'Cloudflare stats reset successfully',
        stats: cloudflareAiService.getStats(),
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  }

  static async getSystemHealth(req, res) {
    try {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      const cloudflareHealth = cloudflareAiService.getHealth();
      const configInfo = cloudflareAiService.getConfigInfo();

      res.json({
        service: 'backend',
        status: cloudflareHealth.status === 'healthy' ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: {
          seconds: Math.floor(uptime),
          hours: Math.floor(uptime / 3600),
          days: Math.floor(uptime / 86400),
        },
        memory: {
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        },
        cloudflare: cloudflareHealth,
        cloudflareConfig: configInfo,
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message,
      });
    }
  }

  static async getCloudflareConfig(req, res) {
    try {
      const configInfo = cloudflareAiService.getConfigInfo();
      res.json(configInfo);
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  }
}

module.exports = HealthController;
