import assert from "node:assert/strict";
import type { Request, Response, RequestHandler } from "express";
import { test } from "node:test";
import { createAvatarUnavailableHandler } from "../dist/controllers/avatarFallbackController.js";

async function invoke(handler: RequestHandler) {
  const state: { statusCode: number; body?: unknown } = { statusCode: 200 };
  const response = {
    status(statusCode: number) {
      state.statusCode = statusCode;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  };
  await handler({} as Request, response as unknown as Response);
  return state;
}

test("avatar fallback responds unavailable without implying a created session", async () => {
  const result = await invoke(
    createAvatarUnavailableHandler(
      "Avatar integration is unavailable until an approved-response flow is verified.",
    ),
  );
  const body = result.body as Record<string, unknown>;

  assert.equal(result.statusCode, 503);
  assert.equal(body.ok, false);
  assert.match(String(body.message), /approved-response flow is verified/);
  assert.equal("sessionId" in body, false);
  assert.equal("response" in body, false);
});
