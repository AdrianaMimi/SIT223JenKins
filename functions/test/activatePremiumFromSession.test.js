import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockReq, mockRes } from "./utils.js";

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApps: () => [], 
}));

vi.mock("firebase-functions/params", () => ({
  defineSecret: () => ({ value: () => "sk_test_FAKE" }),
}));

const verifyIdToken = vi.fn();
const getUser = vi.fn();
const setCustomUserClaims = vi.fn();
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifyIdToken, getUser, setCustomUserClaims }),
}));

const retrieve = vi.fn();
class FakeStripe {
  constructor() {}
  checkout = { sessions: { retrieve } };
}
vi.mock("stripe", () => ({ default: FakeStripe }));

let mod;
beforeEach(async () => {
  vi.resetModules();
  verifyIdToken.mockReset();
  getUser.mockReset();
  setCustomUserClaims.mockReset();
  retrieve.mockReset();
  mod = await import("../index.js");
});

describe("activatePremiumFromSession", () => {
  it("returns 405 on GET", async () => {
    const req = mockReq({ method: "GET" });
    const res = mockRes();
    await mod.activatePremiumFromSession(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 401 when not authenticated", async () => {
    const req = mockReq({ body: { session_id: "cs_1" } });
    const res = mockRes();
    verifyIdToken.mockRejectedValue(new Error("bad token"));
    await mod.activatePremiumFromSession(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 400 if session_id missing", async () => {
    const req = mockReq({ headers: { authorization: "Bearer abc" }, body: {} });
    const res = mockRes();
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    await mod.activatePremiumFromSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 200 and sets premium claim on success", async () => {
    const req = mockReq({
      headers: { authorization: "Bearer abc" },
      body: { session_id: "cs_1" },
    });
    const res = mockRes();
    verifyIdToken.mockResolvedValue({ uid: "u1" });
    retrieve.mockResolvedValue({
      payment_status: "paid",
      mode: "subscription",
      metadata: { firebase_uid: "u1" },
    });
    getUser.mockResolvedValue({ customClaims: { old: true } });

    await mod.activatePremiumFromSession(req, res);

    expect(setCustomUserClaims).toHaveBeenCalledWith("u1", {
      old: true,
      premium: true,
    });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
