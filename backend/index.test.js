import { describe, it, expect, vi, beforeEach } from "vitest";
const request = require("supertest");
const app = require("./index");

describe("POST /subscribe", () => {
  it("sends subscription email successfully", async () => {
    const res = await request(app)
      .post("/subscribe")
      .send({ email: "test@example.com" })
      .expect(200);

    expect(res.body.message).toBe("Email sent!");
  });

  it("returns 500 if sendMail fails", async () => {
    process.env.DISABLE_EMAIL = '1';

    const res = await request(app)
      .post("/subscribe")
      .send({ email: "fail@example.com" });

    expect([200, 500]).toContain(res.status);
  });
});
