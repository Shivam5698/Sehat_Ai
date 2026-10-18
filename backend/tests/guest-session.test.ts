import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { test } from "node:test";
import { requireConsultationAccess } from "../dist/middleware/auth.js";

test("guest consultation middleware issues a scoped HttpOnly session and requires it for later access", async () => {
  const app = express();
  app.post("/create", requireConsultationAccess(true), (req, res) => {
    res.json({ guestSessionId: (req as typeof req & { guestSessionId?: string }).guestSessionId });
  });
  app.post("/continue", requireConsultationAccess(), (req, res) => {
    res.json({ guestSessionId: (req as typeof req & { guestSessionId?: string }).guestSessionId });
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const created = await fetch(`${baseUrl}/create`, { method: "POST" });
    const setCookie = created.headers.get("set-cookie") ?? "";
    const cookie = setCookie.split(";")[0];
    const createdSession = (await created.json()) as { guestSessionId: string };

    assert.equal(created.status, 200);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(cookie, /^sehat_guest=[a-f0-9]{64}$/);
    assert.equal(createdSession.guestSessionId, cookie.slice("sehat_guest=".length));

    const continued = await fetch(`${baseUrl}/continue`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    assert.equal(continued.status, 200);
    assert.deepEqual(await continued.json(), createdSession);

    const missing = await fetch(`${baseUrl}/continue`, { method: "POST" });
    assert.equal(missing.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("invalid login cookies cannot fall back to guest consultation access", async () => {
  const app = express();
  app.post("/create", requireConsultationAccess(true), (_req, res) => res.json({ ok: true }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/create`, {
      method: "POST",
      headers: { Cookie: "sehat_access=invalid-token" },
    });

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});