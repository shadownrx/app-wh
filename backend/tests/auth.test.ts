import request from "supertest";
import { app, resetDb, register, completeProfile, setLocation, prisma } from "./helpers";

describe("auth", () => {
  const server = app();

  beforeAll(async () => {
    await resetDb();
  });


  it("rejects minors", async () => {
    const res = await register(server, { email: "kid@test.local", dateOfBirth: "2015-01-01" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/18/);
  });

  it("registers, logs in, verifies email and resets password", async () => {
    const res = await register(server, { email: "luna@auth.test", name: "Luna" });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.age).toBeGreaterThanOrEqual(18);

    const login = await request(server).post("/api/auth/login").send({
      email: "luna@auth.test",
      password: "Password123!",
    });
    expect(login.status).toBe(200);

    const tokenRow = await prisma.emailToken.findFirst({
      where: { type: "VERIFY_EMAIL" },
      orderBy: { createdAt: "desc" },
    });
    expect(tokenRow).toBeTruthy();
    const inbox = await request(server).get("/api/auth/dev-inbox");
    const mail = inbox.body.inbox.find((m: { to: string }) => m.to === "luna@auth.test");
    const verifyToken = String(mail.body.match(/Token: ([a-f0-9]+)/)?.[1] ?? mail.body.match(/cuenta: ([a-f0-9]+)/)?.[1]);
    const verify = await request(server).post("/api/auth/verify-email").send({ token: verifyToken });
    expect(verify.status).toBe(200);

    await request(server).post("/api/auth/forgot-password").send({ email: "luna@auth.test" });
    const resetMail = (await request(server).get("/api/auth/dev-inbox")).body.inbox
      .filter((m: { to: string }) => m.to === "luna@auth.test")
      .pop();
    const resetToken = String(resetMail.body.match(/reset: ([a-f0-9]+)/i)?.[1]);
    const reset = await request(server)
      .post("/api/auth/reset-password")
      .send({ token: resetToken, password: "NewPass123!" });
    expect(reset.status).toBe(200);

    const oldLogin = await request(server).post("/api/auth/login").send({
      email: "luna@auth.test",
      password: "Password123!",
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(server).post("/api/auth/login").send({
      email: "luna@auth.test",
      password: "NewPass123!",
    });
    expect(newLogin.status).toBe(200);

    const me = await completeProfile(server, newLogin.body.accessToken);
    expect(me.status).toBe(200);
    await setLocation(server, newLogin.body.accessToken);
  });
});
