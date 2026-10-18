import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { test } from "node:test";
import { config } from "../dist/config/index.js";
import { createAuthSession } from "../dist/services/authService.js";

test("newly registered users receive signed access and refresh tokens", () => {
  const session = createAuthSession({
    id: "synthetic-user-1",
    email: "synthetic@example.invalid",
    name: "Synthetic Test",
    role: "patient",
  });
  const accessClaims = jwt.verify(session.accessToken, config.jwtSecret);
  const refreshClaims = jwt.verify(session.refreshToken, config.jwtRefreshSecret);

  assert.equal(typeof session.sessionId, "string");
  assert.equal(typeof session.accessToken, "string");
  assert.equal(typeof session.refreshToken, "string");
  assert.equal(typeof accessClaims === "string" ? null : accessClaims.sub, "synthetic-user-1");
  assert.equal(typeof accessClaims === "string" ? null : accessClaims.role, "patient");
  assert.equal(typeof accessClaims === "string" ? null : accessClaims.sid, session.sessionId);
  assert.equal(typeof refreshClaims === "string" ? null : refreshClaims.sub, "synthetic-user-1");
  assert.equal(typeof refreshClaims === "string" ? null : refreshClaims.sid, session.sessionId);
  assert.deepEqual(session.user, {
    id: "synthetic-user-1",
    email: "synthetic@example.invalid",
    name: "Synthetic Test",
  });
});
