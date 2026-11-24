import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

const TOKEN = "a-control-token-that-is-long-enough";
const ORIGINS = {
  TUNNEL_FRONTEND_ORIGIN: "https://tunnel-frontend.example.net",
  TUNNEL_BACKEND_ORIGIN: "https://tunnel-backend.example.net",
  VERCEL_FRONTEND_ORIGIN: "https://store.vercel.app",
  RENDER_BACKEND_ORIGIN: "https://api.onrender.com",
};

function setup(mode = "tunnel") {
  const values = new Map([["mode", mode]]);
  const writes = [];
  const env = {
    ...ORIGINS,
    NODE_ENV: "production",
    DEPLOYMENT_CONTROL_TOKEN: TOKEN,
    DEPLOYMENT_KV: {
      async get(key) { return values.get(key) ?? null; },
      async put(key, value) { writes.push([key, value]); values.set(key, value); },
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

test("preflight failure prevents a mode change", async () => {
  const { env, values, writes } = setup();
  await withFetch(async () => new Response("unhealthy", { status: 503 }), async () => {
    const response = await worker.fetch(request("/__deployment/mode", {
      method: "POST", body: { mode: "vercel-render" },
    }), env);
    assert.equal(response.status, 502);
    assert.equal(values.get("mode"), "tunnel");
    assert.deepEqual(writes, []);
  });
});

test("mode changes only to exact allowlisted values after both checks pass", async () => {
  const { env, values, writes } = setup();
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
      method: "POST", body: { mode: "vercel-render" },
    }), env);
    assert.equal(valid.status, 200);
    assert.equal(values.get("mode"), "vercel-render");
    assert.deepEqual(writes, [["mode", "vercel-render"]]);
    assert.deepEqual(probed.sort(), [
      "https://api.onrender.com/health",
      "https://store.vercel.app/",
    ]);
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
