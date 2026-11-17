import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import jwt from "jsonwebtoken";
import { test } from "node:test";
import { config } from "../dist/config/index.js";
import { prisma } from "../dist/database/client.js";
import { videoRouter } from "../dist/routes/video.js";

test("video routes require authentication and enforce consultation ownership", async () => {
  const originalJwtSecret = config.jwtSecret;
  const consultationDelegate = prisma.consultation;
  const originalFindFirst = Object.getOwnPropertyDescriptor(
    consultationDelegate,
    "findFirst",
  );
  config.jwtSecret = "test-only-video-route-secret";
  const token = jwt.sign({ sub: "video-user-1" }, config.jwtSecret);

  const app = express();
  app.use(express.json());
  app.use("/api/video", videoRouter);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}/api/video`;

    const unauthenticated = await fetch(`${baseUrl}/session/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(unauthenticated.status, 401);

    const authenticated = await fetch(`${baseUrl}/session/init`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(authenticated.status, 400);
    assert.deepEqual(await authenticated.json(), {
      ok: false,
      message: "Missing consultationId or avatarId",
    });

    Object.defineProperty(consultationDelegate, "findFirst", {
      configurable: true,
      value: async () => null,
    });
    const unauthorizedConsultation = await fetch(`${baseUrl}/transcript`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        consultationId: "another-users-consultation",
        transcript: "test transcript",
      }),
    });
    assert.equal(unauthorizedConsultation.status, 403);
    assert.deepEqual(await unauthorizedConsultation.json(), {
      ok: false,
      message: "Unauthorized consultation access",
    });
  } finally {
    if (originalFindFirst) {
      Object.defineProperty(consultationDelegate, "findFirst", originalFindFirst);
    } else {
      Reflect.deleteProperty(consultationDelegate, "findFirst");
    }
    config.jwtSecret = originalJwtSecret;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
