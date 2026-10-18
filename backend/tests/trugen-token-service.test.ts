import assert from "node:assert/strict";
import { test } from "node:test";
import { TruGenTokenService } from "../dist/video/trugen/token.service.js";

test("local TruGen tokens cannot be generated without a configured secret", () => {
  const service = new TruGenTokenService("");

  assert.throws(
    () => service.generateSessionToken("synthetic-session"),
    /TRUGEN_API_SECRET must be configured/,
  );
  assert.equal(service.verifySessionToken("not-a-token"), null);
});

test("local TruGen token helper uses only the supplied test secret", () => {
  const service = new TruGenTokenService("test-only-trugen-secret");
  const token = service.generateSessionToken("synthetic-session");

  assert.equal(service.verifySessionToken(token), "synthetic-session");
  assert.equal(
    new TruGenTokenService("different-test-secret").verifySessionToken(token),
    null,
  );
});
