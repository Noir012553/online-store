const backendPlatforms = Object.freeze([
  { code: 'cloudflare-tunnel', name: 'Cloudflare Tunnel' },
  { code: 'render', name: 'Render' },
  { code: 'railway', name: 'Railway' },
  { code: 'fly-io', name: 'Fly.io' },
]);

const frontendPlatforms = Object.freeze([
  { code: 'cloudflare-tunnel', name: 'Cloudflare Tunnel' },
  { code: 'cloudflare-pages', name: 'Cloudflare Pages' },
  { code: 'vercel', name: 'Vercel' },
  { code: 'netlify', name: 'Netlify' },
  { code: 'render', name: 'Render' },
]);

const defaultDeploymentTargets = Object.freeze({
  backend: 'cloudflare-tunnel',
  frontend: 'cloudflare-tunnel',
});

module.exports = { backendPlatforms, frontendPlatforms, defaultDeploymentTargets };
