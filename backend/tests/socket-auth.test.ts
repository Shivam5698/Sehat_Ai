import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { test } from "node:test";
import { getSocketUserId } from "../dist/realtime/socketAuth.js";

const secret = "test-only-secret";

test("socket authentication accepts a valid access token and extracts its subject", () => {
  const token = jwt.sign({ sub: "user-1" }, secret, { expiresIn: "1m" });
  assert.equal(getSocketUserId(token, secret), "user-1");
  assert.equal(getSocketUserId(`Bearer ${token}`, secret), "user-1");
});

test("socket authentication rejects absent, invalid, expired, or subjectless tokens", () => {
  const expired = jwt.sign({ sub: "user-1" }, secret, { expiresIn: -1 });
  const subjectless = jwt.sign({ role: "user" }, secret);

  assert.equal(getSocketUserId(undefined, secret), null);
  assert.equal(getSocketUserId("", secret), null);
  assert.equal(getSocketUserId("not-a-token", secret), null);
  assert.equal(getSocketUserId(expired, secret), null);
  assert.equal(getSocketUserId(subjectless, secret), null);
  assert.equal(getSocketUserId(jwt.sign({ sub: "user-1" }, "other-secret"), secret), null);
});
