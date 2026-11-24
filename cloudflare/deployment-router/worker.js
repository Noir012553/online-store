const MODES = new Set(["tunnel", "vercel-render"]);
const CONTROL_PATHS = new Set([
  "/__deployment/status",
  "/__deployment/preflight",
  "/__deployment/mode",
]);
const PUBLIC_HOSTS = new Set(["manln.online", "backend.manln.online"]);
const HEALTH_PATHS = {
  tunnelFrontend: "/",
  tunnelBackend: "/",
  vercelFrontend: "/",
  renderBackend: "/",
};
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
]);
const MODE_STORAGE_KEY = "mode";

class ConfigurationError extends Error {}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function validOrigin(value, name, production) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConfigurationError(`Missing ${name}`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConfigurationError(`Invalid ${name}`);
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    (production && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.hostname.endsWith(".")
  ) {
    throw new ConfigurationError(`Unsafe ${name}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (PUBLIC_HOSTS.has(hostname)) {
    throw new ConfigurationError(`${name} must not use a Worker public hostname`);
  }
  return parsed.origin;
}

function healthPath(value, fallback, name) {
  const path = value === undefined || value === "" ? fallback : value;
  if (typeof path !== "string" || !/^\/(?!\/)[^\\?#\s]*$/.test(path)) {
    throw new ConfigurationError(`Invalid ${name}`);
  }
  return path;
}

function getRoutingConfig(env) {
  const production = env.NODE_ENV !== "development" && env.NODE_ENV !== "test";
  return {
    origins: {
      tunnelFrontend: validOrigin(env.TUNNEL_FRONTEND_ORIGIN, "TUNNEL_FRONTEND_ORIGIN", production),
      tunnelBackend: validOrigin(env.TUNNEL_BACKEND_ORIGIN, "TUNNEL_BACKEND_ORIGIN", production),
      vercelFrontend: validOrigin(env.VERCEL_FRONTEND_ORIGIN, "VERCEL_FRONTEND_ORIGIN", production),
      renderBackend: validOrigin(env.RENDER_BACKEND_ORIGIN, "RENDER_BACKEND_ORIGIN", production),
    },
    healthPaths: {
      tunnelFrontend: healthPath(env.TUNNEL_FRONTEND_HEALTH_PATH, HEALTH_PATHS.tunnelFrontend, "TUNNEL_FRONTEND_HEALTH_PATH"),
      tunnelBackend: healthPath(env.TUNNEL_BACKEND_HEALTH_PATH, HEALTH_PATHS.tunnelBackend, "TUNNEL_BACKEND_HEALTH_PATH"),
      vercelFrontend: healthPath(env.VERCEL_FRONTEND_HEALTH_PATH, HEALTH_PATHS.vercelFrontend, "VERCEL_FRONTEND_HEALTH_PATH"),
      renderBackend: healthPath(env.RENDER_BACKEND_HEALTH_PATH, HEALTH_PATHS.renderBackend, "RENDER_BACKEND_HEALTH_PATH"),
    },
  };
}

function getConfig(env) {
  if (!env.DEPLOYMENT_STATE || typeof env.DEPLOYMENT_STATE.idFromName !== "function" ||
      typeof env.DEPLOYMENT_STATE.get !== "function") {
    throw new ConfigurationError("Missing deployment Durable Object binding");
  }
  if (typeof env.DEPLOYMENT_CONTROL_TOKEN !== "string" ||
      env.DEPLOYMENT_CONTROL_TOKEN.length < 16) {
    throw new ConfigurationError("Missing or weak control token binding");
  }

  return {
    ...getRoutingConfig(env),
    stateBinding: env.DEPLOYMENT_STATE,
    token: env.DEPLOYMENT_CONTROL_TOKEN,
  };
}

function constantTimeTokenEquals(expected, provided) {
  const encoder = new TextEncoder();
  const left = encoder.encode(expected);
  const right = encoder.encode(provided);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    diff |= (left[i] || 0) ^ (right[i] || 0);
  }
  return diff === 0;
}

function authorized(request, expected) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return Boolean(match && constantTimeTokenEquals(expected, match[1]));
}

function modeOrigins(mode, origins) {
  if (mode === "tunnel") {
    return { frontend: origins.tunnelFrontend, backend: origins.tunnelBackend };
  }
  if (mode === "vercel-render") {
    return { frontend: origins.vercelFrontend, backend: origins.renderBackend };
  }
  return null;
}

function parseModeBody(request) {
  return request.json().then((body) => {
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !Object.hasOwn(body, "mode") || !MODES.has(body.mode)) {
      return null;
    }
    return body.mode;
  }).catch(() => null);
}

async function preflight(mode, origins, healthPaths) {
  const selected = modeOrigins(mode, origins);
  if (!selected) return false;
  const frontendKey = mode === "tunnel" ? "tunnelFrontend" : "vercelFrontend";
  const backendKey = mode === "tunnel" ? "tunnelBackend" : "renderBackend";
  const checks = [
    [selected.frontend, healthPaths[frontendKey]],
    [selected.backend, healthPaths[backendKey]],
  ];

  const results = await Promise.all(checks.map(async ([origin, path]) => {
    try {
      const response = await fetch(`${origin}${path}`, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
      return response.status >= 200 && response.status < 300;
    } catch {
      return false;
    }
  }));
  return results.every(Boolean);
}

function getStateStub(binding) {
  const id = binding.idFromName("global-deployment-mode");
  return binding.get(id);
}

async function requestState(binding, path, method, mode) {
  const headers = new Headers();
  let body;
  if (mode !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify({ mode });
  }
  return getStateStub(binding).fetch(new Request(`https://deployment-state.internal${path}`, {
    method,
    headers,
    body,
  }));
}

async function controlRoute(request, config, path) {
  if (!CONTROL_PATHS.has(path)) return json({ error: "Not found" }, 404);

  if (path === "/__deployment/status" && request.method === "GET") {
    return requestState(config.stateBinding, "/status", "GET");
  }

  if (path === "/__deployment/preflight" && request.method === "POST") {
    const mode = await parseModeBody(request);
    if (!mode) return json({ error: "Body must contain only an exact mode" }, 400);
    return requestState(config.stateBinding, "/preflight", "POST", mode);
  }

  if (path === "/__deployment/mode" && request.method === "POST") {
    const mode = await parseModeBody(request);
    if (!mode) return json({ error: "Body must contain only an exact mode" }, 400);
    return requestState(config.stateBinding, "/mode", "POST", mode);
  }

  return json({ error: "Method not allowed" }, 405);
}

export class DeploymentState {
  constructor(state, env) {
    this.state = state;
    this.config = getRoutingConfig(env);
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/status" && request.method === "GET") {
      return this.state.blockConcurrencyWhile(async () => {
        const mode = await this.state.storage.get(MODE_STORAGE_KEY);
        if (!MODES.has(mode)) return json({ error: "Deployment mode is not configured" }, 503);
        return json({ mode });
      });
    }

    if ((path === "/preflight" || path === "/mode") && request.method === "POST") {
      const mode = await parseModeBody(request);
      if (!mode) return json({ error: "Body must contain only an exact mode" }, 400);

      if (path === "/preflight") {
        const passed = await preflight(mode, this.config.origins, this.config.healthPaths);
        return json({ mode, passed }, passed ? 200 : 502);
      }

      return this.state.blockConcurrencyWhile(async () => {
        const passed = await preflight(mode, this.config.origins, this.config.healthPaths);
        if (!passed) {
          return json({ error: "Preflight failed; deployment mode was not changed" }, 502);
        }
        await this.state.storage.put(MODE_STORAGE_KEY, mode);
        return json({ mode, changed: true });
      });
    }

    return json({ error: "Not found" }, 404);
  }
}

function stripUnsafeHeaders(headers) {
  const connectionHeaders = (headers.get("connection") || "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  for (const name of [...headers.keys()]) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase()) || connectionHeaders.includes(name.toLowerCase())) {
      headers.delete(name);
    }
  }
}

async function proxy(request, origin) {
  if (request.method === "CONNECT") return json({ error: "Unsupported method" }, 405);
  const incomingUrl = new URL(request.url);
  const targetUrl = `${origin}${incomingUrl.pathname}${incomingUrl.search}`;
  const headers = new Headers(request.headers);
  stripUnsafeHeaders(headers);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstreamRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
    duplex: hasBody ? "half" : undefined,
  });
  return fetch(upstreamRequest);
}

export default {
  async fetch(request, env) {
    let config;
    try {
      config = getConfig(env);
    } catch {
      return json({ error: "Deployment router is not configured safely" }, 503);
    }

    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/__deployment" || path.startsWith("/__deployment/")) {
      if (!authorized(request, config.token)) return json({ error: "Unauthorized" }, 401);
      try {
        return await controlRoute(request, config, path);
      } catch {
        return json({ error: "Deployment control operation failed" }, 503);
      }
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    let route;
    if (hostname === "manln.online") route = "frontend";
    else if (hostname === "backend.manln.online") route = "backend";
    else return json({ error: "Unknown host" }, 421);

    try {
      const modeResponse = await requestState(config.stateBinding, "/status", "GET");
      if (!modeResponse.ok) return modeResponse;
      const { mode } = await modeResponse.json();
      const selected = modeOrigins(mode, config.origins);
      if (!selected) return json({ error: "Deployment mode is not configured" }, 503);
      return await proxy(request, selected[route]);
    } catch {
      return json({ error: "Upstream request failed" }, 502);
    }
  },
};
