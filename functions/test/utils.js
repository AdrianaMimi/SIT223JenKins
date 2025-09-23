import { vi } from "vitest";

export function mockReq(overrides = {}) {
  return {
    method: "POST",
    headers: {},
    body: {},
    // onRequest adds these sometimes; keep harmless defaults:
    query: {},
    path: "/",
    ...overrides,
  };
}

export function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.headersSent = false;
  res._headers = Object.create(null);
  const listeners = Object.create(null);

  // ---- Node-like header API used by cors/vary ----
  res.setHeader = (name, value) => {
    res._headers[String(name).toLowerCase()] = value;
  };
  res.getHeader = (name) => res._headers[String(name).toLowerCase()];
  res.removeHeader = (name) => {
    delete res._headers[String(name).toLowerCase()];
  };
  res.writeHead = (code, headers = {}) => {
    res.statusCode = code;
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    return res;
  };
  res.set = vi.fn((name, value) => { res.setHeader(name, value); return res; });
  res.get = vi.fn((name) => res.getHeader(name));

  // ---- events used by firebase wrapper ----
  res.on = vi.fn((event, cb) => {
    (listeners[event] ||= []).push(cb);
    return res;
  });
  const fire = (event) => {
    (listeners[event] || []).forEach((cb) => { try { cb(); } catch { } });
  };

  // ---- body writers ----
  res.status = vi.fn((code) => { res.statusCode = code; return res; });
  res.json = vi.fn((obj) => { res.body = obj; res.headersSent = true; fire("finish"); return res; });
  res.send = vi.fn((txt) => { res.body = txt; res.headersSent = true; fire("finish"); return res; });
  res.end = vi.fn((data) => { if (data !== undefined) res.body = data; res.headersSent = true; fire("finish"); return res; });

  return res;
}
