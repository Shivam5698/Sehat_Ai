import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { test } from "node:test";
import { authRouter } from "../dist/routes/auth.js";

test("mounted session endpoint rejects an unauthenticated request with 401, not 404", async () => {
  const app = express();
  app.use("/api/auth", authRouter);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/session`);

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ok: false, message: "Missing token" });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
