/**
 * Get Client IP từ Cloudflare Tunnel
 * 
 * Cloudflare Tunnel sẽ set header 'cf-connecting-ip' với IP client
 */
function getClientIp(req) {
  // Lấy IP từ Cloudflare header
  return req.headers['cf-connecting-ip'] || req.ip || '0.0.0.0';
}

module.exports = { getClientIp };
