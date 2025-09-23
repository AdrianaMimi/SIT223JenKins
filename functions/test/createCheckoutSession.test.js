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
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    verifyIdToken,
    getUser: vi.fn(),
    setCustomUserClaims: vi.fn(),
  }),
}));

const create = vi.fn();
class FakeStripe {
  constructor() {}
  checkout = { sessions: { create } };
}
vi.mock("stripe", () => ({ default: FakeStripe }));

let mod;
beforeEach(async () => {
  vi.resetModules();
  process.env.STRIPE_PRICE_ID = "price_123";
  process.env.GCLOUD_PROJECT = "demo-app";
  verifyIdToken.mockReset();
  create.mockReset();
  mod = await import("../index.js"); // your cloud functions file
});

describe("createCheckoutSession", () => {
  it("returns 405 on GET", async () => {
    const req = mockReq({ method: "GET" });
    const res = mockRes();
    await mod.createCheckoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 401 when no auth", async () => {
    const req = mockReq();
    const res = mockRes();
    verifyIdToken.mockRejectedValue(new Error("bad token"));
    await mod.createCheckoutSession(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 200 and url/id on success", async () => {
    const req = mockReq({ headers: { authorization: "Bearer good" } });
    const res = mockRes();
    verifyIdToken.mockResolvedValue({ uid: "u1", email: "test@example.com" });
    create.mockResolvedValue({ id: "cs_123", url: "http://stripe.fake/cs_123" });

    await mod.createCheckoutSession(req, res);

    expect(res.json).toHaveBeenCalledWith({
      id: "cs_123",
      url: "http://stripe.fake/cs_123",
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        client_reference_id: "u1",
        customer_email: "test@example.com",
      })
    );
  });
});
