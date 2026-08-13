import request from "supertest";
import { app, resetDb, register, completeProfile, setLocation, prisma } from "./helpers";

describe("discovery, matches, dates and economy", () => {
  const server = app();
  let aToken: string;
  let bToken: string;
  let aId: string;
  let bId: string;

  beforeAll(async () => {
    await resetDb();
    const a = await register(server, {
      email: "a@flow.test",
      name: "Ana",
      gender: "WOMAN",
    });
    const b = await register(server, {
      email: "b@flow.test",
      name: "Ben",
      gender: "MAN",
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    aToken = a.body.accessToken;
    bToken = b.body.accessToken;
    aId = a.body.user.id;
    bId = b.body.user.id;
    await completeProfile(server, aToken, { interestedIn: ["MAN"] });
    await completeProfile(server, bToken, { interestedIn: ["WOMAN"], gender: "MAN", name: "Ben" });
    await setLocation(server, aToken);
    await setLocation(server, bToken);
    await prisma.photo.createMany({
      data: [
        { userId: aId, url: "/uploads/a.jpg", position: 0 },
        { userId: bId, url: "/uploads/b.jpg", position: 0 },
      ],
    });
  });


  it("discovers, matches, chats, agrees a date and verifies with QR + confirmations", async () => {
    const feed = await request(server).get("/api/discover").set("Authorization", `Bearer ${aToken}`);
    expect(feed.status).toBe(200);
    expect(feed.body.profiles.some((p: { id: string }) => p.id === bId)).toBe(true);

    const likeA = await request(server)
      .post("/api/discover/swipe")
      .set("Authorization", `Bearer ${aToken}`)
      .send({ targetId: bId, action: "LIKE" });
    expect(likeA.status).toBe(200);
    expect(likeA.body.match).toBeFalsy();

    const likeB = await request(server)
      .post("/api/discover/swipe")
      .set("Authorization", `Bearer ${bToken}`)
      .send({ targetId: aId, action: "LIKE" });
    expect(likeB.status).toBe(200);
    expect(likeB.body.match).toBeTruthy();
    const connectionId = likeB.body.match.id;

    const walletA = await request(server).get("/api/wallet").set("Authorization", `Bearer ${aToken}`);
    expect(walletA.body.balance).toBe(1);

    const matches = await request(server).get("/api/matches").set("Authorization", `Bearer ${aToken}`);
    expect(matches.body.matches[0].status).toBe("MATCH");

    for (let i = 0; i < 5; i++) {
      await request(server)
        .post(`/api/matches/${connectionId}/messages`)
        .set("Authorization", `Bearer ${aToken}`)
        .send({ content: `hola ${i}` });
      await request(server)
        .post(`/api/matches/${connectionId}/messages`)
        .set("Authorization", `Bearer ${bToken}`)
        .send({ content: `hey ${i}` });
    }
    const afterChat = await request(server).get("/api/wallet").set("Authorization", `Bearer ${aToken}`);
    expect(afterChat.body.balance).toBe(4);

    const when = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const proposal = await request(server)
      .post(`/api/matches/${connectionId}/proposals`)
      .set("Authorization", `Bearer ${aToken}`)
      .send({ scheduledAt: when, zone: "Centro", planType: "COFFEE" });
    expect(proposal.status).toBe(201);

    const accept = await request(server)
      .post(`/api/proposals/${proposal.body.id}/respond`)
      .set("Authorization", `Bearer ${bToken}`)
      .send({ action: "ACCEPT" });
    expect(accept.status).toBe(200);

    const qr = await request(server)
      .post(`/api/proposals/${proposal.body.id}/qr`)
      .set("Authorization", `Bearer ${aToken}`)
      .send({});
    expect(qr.status).toBe(200);
    expect(qr.body.token).toHaveLength(8);

    const scan = await request(server)
      .post("/api/check-in/scan")
      .set("Authorization", `Bearer ${bToken}`)
      .send({ token: qr.body.token });
    expect(scan.status).toBe(200);
    expect(scan.body.checkInCompleted).toBe(true);

    const reuse = await request(server)
      .post("/api/check-in/scan")
      .set("Authorization", `Bearer ${bToken}`)
      .send({ token: qr.body.token });
    expect(reuse.status).toBe(409);

    await request(server)
      .post(`/api/proposals/${proposal.body.id}/confirm`)
      .set("Authorization", `Bearer ${aToken}`)
      .send({ sawEachOther: true });
    const confirmB = await request(server)
      .post(`/api/proposals/${proposal.body.id}/confirm`)
      .set("Authorization", `Bearer ${bToken}`)
      .send({ sawEachOther: true });
    expect(confirmB.body.dateVerified).toBe(true);

    const walletFinal = await request(server).get("/api/wallet").set("Authorization", `Bearer ${aToken}`);
    expect(walletFinal.body.balance).toBe(1 + 3 + 8 + 30);

    const shop = await request(server).get("/api/shop").set("Authorization", `Bearer ${aToken}`);
    expect(shop.body.items.length).toBeGreaterThanOrEqual(3);
    const extra = shop.body.items.find((i: { key: string }) => i.key === "EXTRA_PROFILES");
    const buy = await request(server)
      .post("/api/shop/purchase")
      .set("Authorization", `Bearer ${aToken}`)
      .send({ key: "EXTRA_PROFILES" });
    expect(buy.status).toBe(200);
    expect(buy.body.spent).toBe(extra.price);

    const report = await request(server)
      .post(`/api/users/${bId}/report`)
      .set("Authorization", `Bearer ${aToken}`)
      .send({ reason: "SPAM_SCAM", details: "test" });
    expect(report.status).toBe(201);

    const block = await request(server)
      .post(`/api/users/${bId}/block`)
      .set("Authorization", `Bearer ${aToken}`);
    expect(block.status).toBe(200);

    const afterBlock = await request(server)
      .get(`/api/users/${bId}`)
      .set("Authorization", `Bearer ${aToken}`);
    expect(afterBlock.status).toBe(404);
  });

  it("allows admin to read funnel metrics and change daily limit", async () => {
    const adminReg = await register(server, {
      email: "admin@flow.test",
      name: "Admin",
      gender: "OTHER",
    });
    await prisma.user.update({ where: { id: adminReg.body.user.id }, data: { role: "ADMIN" } });
    const login = await request(server).post("/api/auth/login").send({
      email: "admin@flow.test",
      password: "Password123!",
    });
    const analytics = await request(server)
      .get("/api/admin/analytics")
      .set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(analytics.status).toBe(200);
    expect(analytics.body.datesVerified).toBeGreaterThanOrEqual(1);
    expect(analytics.body.matchToDateRate).toBeGreaterThan(0);

    const cfg = await request(server)
      .patch("/api/admin/config")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({ dailyProfileLimit: 12 });
    expect(cfg.body.settings.dailyProfileLimit).toBe(12);

    const meta = await request(server).get("/api/meta");
    expect(meta.body.dailyProfileLimit).toBe(12);
    expect(meta.body.proposalLabel).toBeTruthy();
  });
});
