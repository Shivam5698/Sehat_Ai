import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { AIDoctorContractError, ApiError, parseTranscriptResponse } from "../src/types/aiDoctor.ts";

type Fixture = {
  testData: boolean;
  scenario: string;
  status?: number;
  payload: unknown;
};

async function loadFixture(name: string): Promise<Fixture> {
  const fixtureUrl = new URL(`./fixtures/ai-doctor/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(fixtureUrl, "utf8")) as Fixture;
}

test("parses a structurally valid synthetic response without fabricating assistant text", async () => {
  const fixture = await loadFixture("normal");
  assert.equal(fixture.testData, true);
  const response = parseTranscriptResponse(fixture.payload);

  assert.deepEqual(response.validatedResponse.symptoms, []);
  assert.deepEqual(response.validatedResponse.recommendations, []);
  assert.deepEqual(response.validatedResponse.riskAssessment, {
    riskScore: 0,
    level: "low",
    confidence: 0.5,
  });
  assert.equal("agentResults" in response.validatedResponse, false);
  assert.equal("assistantReply" in response.validatedResponse, false);
});

test("preserves escalation metadata on a degraded response without generated emergency text", async () => {
  const fixture = await loadFixture("emergency");
  assert.equal(fixture.testData, true);
  const error = new ApiError(fixture.status ?? 0, fixture.payload);

  assert.equal(error.status, 502);
  assert.equal(error.shouldEscalate, true);
  assert.equal(error.emergencyMessage, undefined);
});

test("parses a server failure as degraded without treating it as a successful AI response", async () => {
  const fixture = await loadFixture("degraded");
  assert.equal(fixture.testData, true);
  const error = new ApiError(fixture.status ?? 0, fixture.payload);

  assert.equal(error.degraded, true);
  assert.equal(
    error.message,
    "Consultation response unavailable. No validated assessment was returned.",
  );
  assert.throws(() => parseTranscriptResponse(fixture.payload), AIDoctorContractError);
});

test("parses a standard backend validation error", async () => {
  const fixture = await loadFixture("api-error");
  assert.equal(fixture.testData, true);
  const error = new ApiError(fixture.status ?? 0, fixture.payload);

  assert.equal(error.degraded, false);
  assert.equal(error.status, 400);
  assert.equal(error.message, "Missing consultationId or transcript");
});

test("preserves emergency escalation metadata on a degraded API error", () => {
  const error = new ApiError(502, {
    ok: false,
    message: "Consultation response unavailable. No validated assessment was returned.",
    shouldEscalate: true,
    emergencyMessage: "Contact local emergency services now.",
  });

  assert.equal(error.degraded, true);
  assert.equal(error.shouldEscalate, true);
  assert.equal(error.emergencyMessage, "Contact local emergency services now.");
});

test("preserves readable messages from generic API error payloads", () => {
  assert.equal(new ApiError(400, { message: "Readable error" }).message, "Readable error");
  assert.equal(
    new ApiError(400, { ok: false, message: "Readable error" }).message,
    "Readable error",
  );
  assert.equal(new ApiError(400, { error: "untrusted server details" }).message, "API Error: 400");
});

test("rejects missing success fields and malformed supported values", () => {
  assert.throws(() => parseTranscriptResponse({ ok: true }), AIDoctorContractError);
  assert.throws(
    () =>
      parseTranscriptResponse({
        ok: true,
        validatedResponse: { shouldEscalate: "true" },
      }),
    AIDoctorContractError,
  );
  assert.throws(
    () =>
      parseTranscriptResponse({
        ok: true,
        validatedResponse: {
          riskAssessment: { riskScore: "high", level: "high", confidence: 0.8 },
        },
      }),
    AIDoctorContractError,
  );
  assert.throws(
    () =>
      parseTranscriptResponse({
        ok: true,
        validatedResponse: { symptoms: [{ name: "unidentified symptom" }] },
      }),
    AIDoctorContractError,
  );
  assert.equal(new ApiError(503, { ok: false }).degraded, true);
});

test("keeps fixture parsing isolated from network requests", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("Fixture parsing must not make network requests.");
  }) as typeof fetch;

  try {
    const fixture = await loadFixture("normal");
    assert.equal(fixture.testData, true);
    assert.equal(parseTranscriptResponse(fixture.payload).ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
