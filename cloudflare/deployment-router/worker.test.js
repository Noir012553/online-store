import test from "node:test";
import assert from "node:assert/strict";
import worker, { DeploymentState } from "./worker.js";

const TOKEN = "a-control-token-that-is-long-enough";
const RUNNER_TOKEN = "a-runner-token-that-is-long-enough";
const TUNNEL_ACCESS_CLIENT_ID = "access-client-id.example";
const TUNNEL_ACCESS_CLIENT_SECRET = "a-tunnel-access-client-secret";
const RUNNER_ID = "runner-1";
const ORIGINS = {
  TUNNEL_FRONTEND_ORIGIN: "https://tunnel-frontend.example.net",
  TUNNEL_BACKEND_ORIGIN: "https://tunnel-backend.example.net",
  VERCEL_FRONTEND_ORIGIN: "https://store.vercel.app",
  RENDER_BACKEND_ORIGIN: "https://api.onrender.com",
};

function setup(mode = "tunnel") {
  const values = new Map([
    ["mode", mode],
    ["runnerHeartbeat", { runnerId: RUNNER_ID, lastHeartbeatAt: Date.now() }],
  ]);
  const writes = [];
  const serialState = {
    storage: {
      async get(key) { return values.get(key) ?? null; },
      async put(key, value) { writes.push([key, value]); values.set(key, value); },
      async delete(key) { values.delete(key); },
      async transaction(callback) {
        return callback({
          async put(key, value) { writes.push([key, value]); values.set(key, value); },
          async delete(key) { values.delete(key); },
          async get(key) { return values.get(key) ?? null; },
        });
      },
    },
    queue: Promise.resolve(),
    blockConcurrencyWhile(callback) {
      const operation = this.queue.then(callback);
      this.queue = operation.then(() => undefined, () => undefined);
      return operation;
    },
  };
  const stateObject = new DeploymentState(serialState, {
    ...ORIGINS,
    TUNNEL_ACCESS_CLIENT_ID,
    TUNNEL_ACCESS_CLIENT_SECRET,
    NODE_ENV: "production",
  });
  const env = {
    ...ORIGINS,
    TUNNEL_ACCESS_CLIENT_ID,
    TUNNEL_ACCESS_CLIENT_SECRET,
    NODE_ENV: "production",
    DEPLOYMENT_CONTROL_TOKEN: TOKEN,
    DEPLOYMENT_RUNNER_TOKEN: RUNNER_TOKEN,
    DEPLOYMENT_RUNNER_ID: RUNNER_ID,
    DEPLOYMENT_STATE: {
      idFromName(name) { assert.equal(name, "global-deployment-mode"); return name; },
      get(id) {
        assert.equal(id, "global-deployment-mode");
        return { fetch: (request) => stateObject.fetch(request) };
      },
    },
  };
  return { env, values, writes };
}

function request(path, { method = "GET", host = "manln.online", token = TOKEN, body, headers = {} } = {}) {
  const requestHeaders = new Headers(headers);
  if (token !== null) requestHeaders.set("authorization", `Bearer ${token}`);
  if (body !== undefined) requestHeaders.set("content-type", "application/json");
  return new Request(`https://${host}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function runnerRequest(path, { method = "GET", token = RUNNER_TOKEN, runnerId = "runner-1", leaseVersion, body } = {}) {
  const headers = { "x-deployment-runner-id": runnerId };
  if (leaseVersion !== undefined) headers["x-deployment-lease-version"] = String(leaseVersion);
  return request(path, { method, token, body, headers });
}

async function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("management endpoints require the configured bearer token", async () => {
  const { env } = setup();
  const response = await worker.fetch(request("/__deployment/status", { token: "wrong" }), env);
  assert.equal(response.status, 401);
});

test("missing bindings fail closed before proxying or exposing status", async () => {
  const response = await worker.fetch(request("/__deployment/status"), {});
  assert.equal(response.status, 503);
});

test("preflight endpoint reports failed health checks and authenticates Tunnel origins", async () => {
  const { env } = setup();
  await withFetch(async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("CF-Access-Client-Id"), TUNNEL_ACCESS_CLIENT_ID);
    assert.equal(new Headers(init?.headers).get("CF-Access-Client-Secret"), TUNNEL_ACCESS_CLIENT_SECRET);
    return new Response("unhealthy", { status: 503 });
  }, async () => {
    const response = await worker.fetch(request("/__deployment/preflight", {
      method: "POST", body: { mode: "tunnel" },
    }), env);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { mode: "tunnel", passed: false });
  });
});

test("Vercel and Render preflight never sends Tunnel Access credentials", async () => {
  const { env } = setup();
  await withFetch(async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.has("CF-Access-Client-Id"), false);
    assert.equal(headers.has("CF-Access-Client-Secret"), false);
    return new Response("ok");
  }, async () => {
    const response = await worker.fetch(request("/__deployment/preflight", {
      method: "POST", body: { mode: "vercel-render" },
    }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { mode: "vercel-render", passed: true });
  });
});

test("preflight rejects extra JSON keys and direct mode changes are disabled", async () => {
  const { env, writes } = setup();
  const preflight = await worker.fetch(request("/__deployment/preflight", {
    method: "POST", body: { mode: "tunnel", extra: "ignored" },
  }), env);
  const directMode = await worker.fetch(request("/__deployment/mode", {
    method: "POST", body: { mode: "tunnel" },
  }), env);
  assert.equal(preflight.status, 400);
  assert.equal(directMode.status, 409);
  assert.deepEqual(writes, []);
});

test("preflight failure does not change the active deployment mode", async () => {
  const { env, values, writes } = setup("vercel-render");
  await withFetch(async () => new Response("unhealthy", { status: 503 }), async () => {
    const response = await worker.fetch(request("/__deployment/preflight", {
      method: "POST", body: { mode: "tunnel" },
    }), env);
    assert.equal(response.status, 502);
    assert.equal(values.get("mode"), "vercel-render");
    assert.equal(writes.some(([key]) => key === "mode"), false);
  });
});

test("direct mode changes cannot bypass service restart", async () => {
  const { env, values, writes } = setup("vercel-render");
  const response = await worker.fetch(request("/__deployment/mode", {
    method: "POST", body: { mode: "tunnel" },
  }), env);
  assert.equal(response.status, 409);
  assert.equal(values.get("mode"), "vercel-render");
  assert.equal(writes.some(([key]) => key === "mode"), false);
});

test("rollback queues the fixed start action before restoring Tunnel routing", async () => {
  const { env, values } = setup("vercel-render");
  await withFetch(async () => new Response("ok", { status: 200 }), async () => {
    const response = await worker.fetch(request("/__deployment/rollback", {
      method: "POST", body: { confirmed: true, renderStopped: true },
    }), env);
    assert.equal(response.status, 202);
    const job = await response.json();
    assert.equal(job.action, "startTunnelApps");
    const claim = await (await worker.fetch(runnerRequest("/__deployment/runner/job"), env)).json();
    assert.equal(claim.job.action, "startTunnelApps");
    const completion = await worker.fetch(runnerRequest(`/__deployment/runner/job/${job.id}/complete`, {
      method: "POST", leaseVersion: claim.job.leaseVersion, body: { result: "started" },
    }), env);
    assert.equal((await completion.json()).status, "succeeded");
    assert.equal(values.get("mode"), "tunnel");
  });
});

test("stale runner heartbeat blocks cutover", async () => {
  const { env, values } = setup();
  values.set("runnerHeartbeat", { runnerId: RUNNER_ID, lastHeartbeatAt: Date.now() - 120_000 });
  const response = await worker.fetch(request("/__deployment/cutover", {
    method: "POST", body: { mode: "vercel-render", confirmed: true },
  }), env);
  assert.equal(response.status, 503);
  assert.equal(values.has("activeJob"), false);
});

test("runner endpoints require their separate bearer token", async () => {
  const { env } = setup();
  const response = await worker.fetch(runnerRequest("/__deployment/runner/job", { token: TOKEN }), env);
  assert.equal(response.status, 401);
});

test("cutover creates a queued opaque job only from tunnel after target health passes", async () => {
  const otherMode = setup("vercel-render");
  let probes = 0;
  await withFetch(async () => { probes++; return new Response("ok"); }, async () => {
    const notTunnel = await worker.fetch(request("/__deployment/cutover", {
      method: "POST", body: { mode: "vercel-render", confirmed: true },
    }), otherMode.env);
    assert.equal(notTunnel.status, 409);
    assert.equal(probes, 0);
  });

  const { env, values } = setup();
  await withFetch(async () => new Response("unhealthy", { status: 503 }), async () => {
    const unhealthy = await worker.fetch(request("/__deployment/cutover", {
      method: "POST", body: { mode: "vercel-render", confirmed: true },
    }), env);
    assert.equal(unhealthy.status, 502);
    assert.equal(values.has("activeJob"), false);
  });

  await withFetch(async () => new Response("ok"), async () => {
    const invalid = await worker.fetch(request("/__deployment/cutover", {
      method: "POST", body: { mode: "vercel-render", confirmed: true, command: "stop" },
    }), env);
    assert.equal(invalid.status, 400);
    const created = await worker.fetch(request("/__deployment/cutover", {
      method: "POST", body: { mode: "vercel-render", confirmed: true },
    }), env);
    assert.equal(created.status, 202);
    const job = await created.json();
    assert.match(job.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual({ status: job.status, action: job.action }, { status: "queued", action: "stopTunnelApps" });
    assert.equal(JSON.stringify(job).includes("https://"), false);
    const status = await worker.fetch(request(`/__deployment/jobs/${job.id}`), env);
    assert.deepEqual(await status.json(), job);
  });
});

test("only one active job can be created and runner leases prevent competing claims", async () => {
  const { env } = setup();
  await withFetch(async () => new Response("ok"), async () => {
    const posts = await Promise.all([1, 2].map(() => worker.fetch(request("/__deployment/cutover", {
      method: "POST", body: { mode: "vercel-render", confirmed: true },
    }), env)));
    assert.deepEqual(posts.map((response) => response.status).sort(), [202, 409]);
    const claimedResponse = await worker.fetch(runnerRequest("/__deployment/runner/job"), env);
    const claimed = await claimedResponse.json();
    assert.equal(claimedResponse.status, 200);
    assert.equal(claimed.job.action, "stopTunnelApps");
    const otherRunner = await worker.fetch(runnerRequest("/__deployment/runner/job", { runnerId: "runner-2" }), env);
    assert.equal(otherRunner.status, 401);
    const sameRunner = await worker.fetch(runnerRequest("/__deployment/runner/job"), env);
    assert.deepEqual(await sameRunner.json(), claimed);
  });
});

test("failed runner completion marks job failed and leaves mode unchanged", async () => {
  const { env, values } = setup();
  await withFetch(async () => new Response("ok"), async () => {
    const created = await worker.fetch(request("/__deployment/cutover", {
      method: "POST", body: { mode: "vercel-render", confirmed: true },
    }), env);
    const { id } = await created.json();
    const claim = await (await worker.fetch(runnerRequest("/__deployment/runner/job"), env)).json();
    const invalid = await worker.fetch(runnerRequest(`/__deployment/runner/job/${id}/complete`, {
      method: "POST", leaseVersion: claim.job.leaseVersion, body: { result: "stopped", extra: true },
    }), env);
    assert.equal(invalid.status, 400);
    const completion = await worker.fetch(runnerRequest(`/__deployment/runner/job/${id}/complete`, {
      method: "POST", leaseVersion: claim.job.leaseVersion, body: { result: "failed" },
    }), env);
    assert.deepEqual(await completion.json(), { id, status: "queued", action: "startTunnelApps", recovery: true });
    assert.equal(values.get("mode"), "tunnel");
    const currentJob = await (await worker.fetch(request(`/__deployment/jobs/${id}`), env)).json();
    assert.equal(currentJob.status, "queued");
    assert.equal(currentJob.action, "startTunnelApps");
    assert.equal(currentJob.recovery, true);
  });
});

test("stopped completion changes mode only after successful completion preflight", async () => {
  const { env, values } = setup();
  let healthy = true;
  await withFetch(async () => new Response(healthy ? "ok" : "unhealthy", { status: healthy ? 200 : 503 }), async () => {
    const created = await worker.fetch(request("/__deployment/cutover", {
      method: "POST", body: { mode: "vercel-render", confirmed: true },
    }), env);
    const { id } = await created.json();
    const claim = await (await worker.fetch(runnerRequest("/__deployment/runner/job"), env)).json();
    healthy = false;
    const failedPreflight = await worker.fetch(runnerRequest(`/__deployment/runner/job/${id}/complete`, {
      method: "POST", leaseVersion: claim.job.leaseVersion, body: { result: "stopped" },
    }), env);
    assert.deepEqual(await failedPreflight.json(), { id, status: "queued", action: "startTunnelApps", recovery: true });
    assert.equal(values.get("mode"), "tunnel");
  });

  const successful = setup();
  await withFetch(async () => new Response("ok"), async () => {
    const created = await worker.fetch(request("/__deployment/cutover", {
      method: "POST", body: { mode: "vercel-render", confirmed: true },
    }), successful.env);
    const { id } = await created.json();
    const claim = await (await worker.fetch(runnerRequest("/__deployment/runner/job"), successful.env)).json();
    const completion = await worker.fetch(runnerRequest(`/__deployment/runner/job/${id}/complete`, {
      method: "POST", leaseVersion: claim.job.leaseVersion, body: { result: "stopped" },
    }), successful.env);
    assert.deepEqual(await completion.json(), { id, status: "succeeded", action: "stopTunnelApps" });
    assert.equal(successful.values.get("mode"), "vercel-render");
  });
});

test("ordinary routing preserves path, query, method and body while selecting the host binding", async () => {
  const { env } = setup("vercel-render");
  await withFetch(async (input, init) => {
    const upstream = input instanceof Request ? input : new Request(input, init);
    assert.equal(upstream.url, "https://api.onrender.com/orders/42?view=full&x=1");
    assert.equal(upstream.method, "POST");
    assert.equal(await upstream.text(), "payload");
    assert.notEqual(upstream.headers.get("host"), "attacker.example");
    assert.equal(upstream.headers.get("x-forwarded-host"), null);
    return new Response("proxied", { status: 201 });
  }, async () => {
    const response = await worker.fetch(new Request(
      "https://backend.manln.online/orders/42?view=full&x=1",
      { method: "POST", headers: { host: "attacker.example", "x-forwarded-host": "evil" }, body: "payload" },
    ), env);
    assert.equal(response.status, 201);
    assert.equal(await response.text(), "proxied");
  });
});

test("public routing hosts can be configured without changing their default routes", async () => {
  const { env } = setup();
  env.DEPLOYMENT_PUBLIC_FRONTEND_HOST = "shop.example.com";
  env.DEPLOYMENT_PUBLIC_BACKEND_HOST = "api.example.com";
  let calls = 0;
  await withFetch(async (input) => {
    calls++;
    assert.equal(input.url, "https://tunnel-frontend.example.net/products");
    return new Response("proxied");
  }, async () => {
    const configuredHost = await worker.fetch(request("/products", { host: "shop.example.com" }), env);
    const previousHost = await worker.fetch(request("/products"), env);
    assert.equal(configuredHost.status, 200);
    assert.equal(previousHost.status, 421);
    assert.equal(calls, 1);
  });
});

test("configured public hostnames cannot be used as upstream origins", async () => {
  const { env } = setup();
  env.DEPLOYMENT_PUBLIC_FRONTEND_HOST = "shop.example.com";
  env.TUNNEL_FRONTEND_ORIGIN = "https://shop.example.com";
  const response = await worker.fetch(request("/"), env);
  assert.equal(response.status, 503);
});

test("WebSocket upgrade headers are forwarded to the selected upstream", async () => {
  const { env } = setup("vercel-render");
  await withFetch(async (input) => {
    const upstream = input instanceof Request ? input : new Request(input);
    assert.equal(upstream.url, "https://api.onrender.com/socket.io/?EIO=4&transport=websocket");
    assert.equal(upstream.headers.get("upgrade"), "websocket");
    assert.equal(upstream.headers.get("connection"), "Upgrade");
    assert.equal(upstream.headers.get("sec-websocket-version"), "13");
    assert.equal(upstream.headers.get("sec-websocket-key"), "dGhlIHNhbXBsZSBub25jZQ==");
    assert.equal(upstream.headers.has("CF-Access-Client-Id"), false);
    assert.equal(upstream.headers.has("CF-Access-Client-Secret"), false);
    return new Response("proxied");
  }, async () => {
    const response = await worker.fetch(new Request(
      "https://backend.manln.online/socket.io/?EIO=4&transport=websocket",
      { headers: {
        connection: "keep-alive, Upgrade",
        upgrade: "websocket",
        "sec-websocket-version": "13",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      } },
    ), env);
    assert.equal(response.status, 200);
  });
});

test("a user-supplied destination and unknown hosts never select an upstream", async () => {
  const { env } = setup();
  let calls = 0;
  await withFetch(async (input) => {
    calls++;
    assert.equal(input.url, "https://tunnel-frontend.example.net/anything?url=https%3A%2F%2Fevil.example");
    assert.equal(input.headers.get("CF-Access-Client-Id"), TUNNEL_ACCESS_CLIENT_ID);
    assert.equal(input.headers.get("CF-Access-Client-Secret"), TUNNEL_ACCESS_CLIENT_SECRET);
    return new Response("ok");
  }, async () => {
    const queryAttempt = await worker.fetch(request("/anything?url=https%3A%2F%2Fevil.example", {
      headers: {
        "CF-Access-Client-Id": "forged-client-id",
        "CF-Access-Client-Secret": "forged-client-secret",
      },
    }), env);
    const unknownHost = await worker.fetch(request("/anything", { host: "evil.example" }), env);
    assert.equal(queryAttempt.status, 200);
    assert.equal(unknownHost.status, 421);
    assert.equal(calls, 1);
  });
});

test("Tunnel routes fail closed without a complete Access service token", async () => {
  const { env } = setup();
  delete env.TUNNEL_ACCESS_CLIENT_ID;
  delete env.TUNNEL_ACCESS_CLIENT_SECRET;
  let calls = 0;
  await withFetch(async () => { calls++; return new Response("unexpected"); }, async () => {
    const response = await worker.fetch(request("/"), env);
    assert.equal(response.status, 503);
    assert.equal(calls, 0);
  });

  env.TUNNEL_ACCESS_CLIENT_ID = TUNNEL_ACCESS_CLIENT_ID;
  const partial = await worker.fetch(request("/__deployment/status"), env);
  assert.equal(partial.status, 503);
});

test("non-HTTPS origins are rejected in production", async () => {
  const { env } = setup();
  env.TUNNEL_BACKEND_ORIGIN = "http://tunnel-backend.example.net";
  const response = await worker.fetch(request("/"), env);
  assert.equal(response.status, 503);
});

test("public Worker hostnames cannot be configured as Tunnel upstreams", async () => {
  const { env } = setup();
  env.TUNNEL_FRONTEND_ORIGIN = "https://manln.online";
  const response = await worker.fetch(request("/"), env);
  assert.equal(response.status, 503);
});
