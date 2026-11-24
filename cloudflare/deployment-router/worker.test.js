import test from "node:test";
import assert from "node:assert/strict";
import worker, { DeploymentState } from "./worker.js";

const TOKEN = "a-control-token-that-is-long-enough";
const RUNNER_TOKEN = "a-runner-token-that-is-long-enough";
const ORIGINS = {
  TUNNEL_FRONTEND_ORIGIN: "https://tunnel-frontend.example.net",
  TUNNEL_BACKEND_ORIGIN: "https://tunnel-backend.example.net",
  VERCEL_FRONTEND_ORIGIN: "https://store.vercel.app",
  RENDER_BACKEND_ORIGIN: "https://api.onrender.com",
};

function setup(mode = "tunnel") {
  const values = new Map([["mode", mode]]);
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
    NODE_ENV: "production",
  });
  const env = {
    ...ORIGINS,
    NODE_ENV: "production",
    DEPLOYMENT_CONTROL_TOKEN: TOKEN,
    DEPLOYMENT_RUNNER_TOKEN: RUNNER_TOKEN,
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

test("preflight endpoint reports failed health checks", async () => {
  const { env } = setup();
  await withFetch(async () => new Response("unhealthy", { status: 503 }), async () => {
    const response = await worker.fetch(request("/__deployment/preflight", {
      method: "POST", body: { mode: "tunnel" },
    }), env);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { mode: "tunnel", passed: false });
  });
});

test("preflight and mode endpoints reject extra JSON keys", async () => {
  const { env, writes } = setup();
  for (const path of ["/__deployment/preflight", "/__deployment/mode"]) {
    const response = await worker.fetch(request(path, {
      method: "POST", body: { mode: "tunnel", extra: "ignored" },
    }), env);
    assert.equal(response.status, 400);
  }
  assert.deepEqual(writes, []);
});

test("preflight failure prevents a mode change", async () => {
  const { env, values, writes } = setup("vercel-render");
  await withFetch(async () => new Response("unhealthy", { status: 503 }), async () => {
    const response = await worker.fetch(request("/__deployment/mode", {
      method: "POST", body: { mode: "tunnel" },
    }), env);
    assert.equal(response.status, 502);
    assert.equal(values.get("mode"), "vercel-render");
    assert.deepEqual(writes, []);
  });
});

test("mode endpoint only rolls back to tunnel after both checks pass", async () => {
  const { env, values, writes } = setup("vercel-render");
  const probed = [];
  await withFetch(async (input) => {
    probed.push(String(input instanceof Request ? input.url : input));
    return new Response("ok", { status: 200 });
  }, async () => {
    const invalid = await worker.fetch(request("/__deployment/mode", {
      method: "POST", body: { mode: "https://attacker.example" },
    }), env);
    assert.equal(invalid.status, 400);
    assert.equal(writes.length, 0);

    const valid = await worker.fetch(request("/__deployment/mode", {
      method: "POST", body: { mode: "tunnel" },
    }), env);
    assert.equal(valid.status, 200);
    assert.equal(values.get("mode"), "tunnel");
    assert.deepEqual(writes, [["mode", "tunnel"]]);
    assert.deepEqual(probed.sort(), [
      "https://tunnel-backend.example.net/",
      "https://tunnel-frontend.example.net/",
    ]);
  });
});

test("simultaneous rollback requests leave the mode on the preflighted target", async () => {
  const { env, values, writes } = setup("vercel-render");
  await withFetch(async () => new Response("ok", { status: 200 }), async () => {
    const responses = await Promise.all([
      worker.fetch(request("/__deployment/mode", { method: "POST", body: { mode: "tunnel" } }), env),
      worker.fetch(request("/__deployment/mode", { method: "POST", body: { mode: "tunnel" } }), env),
    ]);
    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
    assert.equal(values.get("mode"), "tunnel");
    assert.deepEqual(writes, [["mode", "tunnel"], ["mode", "tunnel"]]);
  });
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
    assert.deepEqual(await otherRunner.json(), { job: null });
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
    assert.deepEqual(await completion.json(), { id, status: "failed", action: "stopTunnelApps" });
    assert.equal(values.get("mode"), "tunnel");
    assert.deepEqual(await (await worker.fetch(request(`/__deployment/jobs/${id}`), env)).json(), {
      id, status: "failed", action: "stopTunnelApps",
    });
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
    assert.deepEqual(await failedPreflight.json(), { id, status: "failed", action: "stopTunnelApps" });
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

test("a user-supplied destination and unknown hosts never select an upstream", async () => {
  const { env } = setup();
  let calls = 0;
  await withFetch(async (input) => {
    calls++;
    assert.equal(input.url, "https://tunnel-frontend.example.net/anything?url=https%3A%2F%2Fevil.example");
    return new Response("ok");
  }, async () => {
    const queryAttempt = await worker.fetch(request("/anything?url=https%3A%2F%2Fevil.example"), env);
    const unknownHost = await worker.fetch(request("/anything", { host: "evil.example" }), env);
    assert.equal(queryAttempt.status, 200);
    assert.equal(unknownHost.status, 421);
    assert.equal(calls, 1);
  });
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
