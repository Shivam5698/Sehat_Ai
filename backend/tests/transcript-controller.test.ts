import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { test } from "node:test";
import { createTranscriptController } from "../dist/controllers/transcriptController.js";
import type { TranscriptHistoryEntry } from "../src/types/consultation.ts";
import { requireAuth } from "../dist/middleware/auth.js";
import {
  AIServiceUnavailableError,
  InvalidAIResponseError,
  validateAndMapWorkflowResult,
} from "../dist/services/aiResponseBoundary.js";

type ResponseState = { statusCode: number; body?: unknown };

async function invoke(
  handler: ReturnType<typeof createTranscriptController>,
  body: unknown = { consultationId: "consultation-1", transcript: "patient text" },
  userId?: string,
  guestSessionId?: string,
) {
  const state: ResponseState = { statusCode: 200 };
  const response = {
    status(statusCode: number) {
      state.statusCode = statusCode;
      return this;
    },
    json(value: unknown) {
      state.body = value;
      return this;
    },
  };
  const request = {
    body,
    user: userId ? { sub: userId } : undefined,
    guestSessionId,
  };
  await handler(request as unknown as Request, response as unknown as Response, () => undefined);
  return state;
}

function controllerOptions(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const dependencies = {
    findConsultation: async () => ({ userId: "owner-1", language: "hi" }),
    persistPatientTranscript: async () => {
      calls.push("persist");
    },
    sendTranscript: async (
      _id: string,
      _transcript: string,
      _language: string,
      _history: TranscriptHistoryEntry[],
    ) => {
      calls.push("orchestrate");
      return {
        symptoms: [],
        riskAssessment: { riskScore: 0, level: "low" as const, confidence: 0.5 },
        recommendations: [],
      };
    },
    failureMessage: "Consultation response unavailable. No validated assessment was returned.",
    ...overrides,
  };
  return { dependencies, calls };
}

test("authenticated owner persists transcript before orchestration on canonical controller", async () => {
  const { dependencies, calls } = controllerOptions();
  const state = await invoke(createTranscriptController(dependencies), undefined, "owner-1");

  assert.equal(state.statusCode, 200);
  assert.deepEqual(calls, ["persist", "orchestrate"]);
});

test("controller returns only a synthetic contract-compatible boundary result", async () => {
  const workflowFixture = {
    workflowStatus: "COMPLETED",
    emergencyDetected: false,
    response: {
      symptoms: [{ name: "synthetic symptom", reported: true }],
      risk: "medium",
      riskScore: 0,
      confidence: 0.5,
      recommendations: [],
      safetyIssues: [],
    },
  };
  const { dependencies, calls } = controllerOptions({
    sendTranscript: async () => validateAndMapWorkflowResult(workflowFixture),
  });

  const state = await invoke(createTranscriptController(dependencies), undefined, "owner-1");
  const body = state.body as {
    ok: boolean;
    validatedResponse: Record<string, unknown>;
  };

  assert.equal(state.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal("assistantReply" in body.validatedResponse, false);
  assert.deepEqual(body.validatedResponse.recommendations, []);
  assert.deepEqual(body.validatedResponse.symptoms, [
    { id: "symptom-1", name: "synthetic symptom", reported: true },
  ]);
  assert.deepEqual(calls, ["persist"]);
});

test("checked-in producer-shaped output fails closed through the controller boundary", async () => {
  const producerShapedFixture = {
    workflowStatus: "COMPLETED",
    emergencyDetected: false,
    response: {
      symptoms: [{ name: "synthetic extracted text" }],
      risk: "moderate",
      riskScore: 0,
      confidence: "high",
      recommendation: "synthetic unattributed text",
      recommendations: ["synthetic unattributed text"],
      safetyIssues: [],
    },
  };
  const { dependencies } = controllerOptions({
    sendTranscript: async () => validateAndMapWorkflowResult(producerShapedFixture),
    logFailure: () => undefined,
  });

  const state = await invoke(createTranscriptController(dependencies), undefined, "owner-1");
  const body = state.body as Record<string, unknown>;

  assert.equal(state.statusCode, 502);
  assert.equal(body.ok, false);
  assert.equal(body.shouldEscalate, undefined);
  assert.equal("validatedResponse" in body, false);
  assert.equal("assistantReply" in body, false);
});

test("controller rejects requests without an authenticated subject", async () => {
  const { dependencies, calls } = controllerOptions();
  const state = await invoke(createTranscriptController(dependencies));

  assert.equal(state.statusCode, 401);
  assert.deepEqual(calls, []);
});

test("guest transcript access is limited to the matching consultation session", async () => {
  const guestSessionId = "guest-session-secret";
  const { dependencies, calls } = controllerOptions({
    findConsultation: async () => ({
      userId: null,
      guestSessionId,
      language: "en",
    }),
  });
  const handler = createTranscriptController(dependencies);
  const owner = await invoke(handler, undefined, undefined, guestSessionId);
  const otherGuest = await invoke(handler, undefined, undefined, "another-guest-session");

  assert.equal(owner.statusCode, 200);
  assert.equal(otherGuest.statusCode, 403);
  assert.deepEqual(calls, ["persist", "orchestrate"]);
});

test("controller rejects non-owner consultation access without persistence or orchestration", async () => {
  const { dependencies, calls } = controllerOptions({
    findConsultation: async () => ({ userId: "another-user", language: "en" }),
  });
  const state = await invoke(createTranscriptController(dependencies), undefined, "caller-1");

  assert.equal(state.statusCode, 403);
  assert.deepEqual(calls, []);
});

test("alternate authenticated transcript controller verifies ownership and does not change persistence behavior", async () => {
  const { dependencies, calls } = controllerOptions();
  const { persistPatientTranscript: _persist, ...alternateDependencies } = dependencies;
  const state = await invoke(
    createTranscriptController({
      ...alternateDependencies,
      failureMessage: "Consultation response unavailable. No validated assessment was returned.",
    }),
    undefined,
    "owner-1",
  );

  assert.equal(state.statusCode, 200);
  assert.deepEqual(calls, ["orchestrate"]);
});

test("invalid AI output returns degraded status while preserving escalation, without raw generated text", async () => {
  const { dependencies } = controllerOptions({
    sendTranscript: async () => {
      throw new InvalidAIResponseError(true);
    },
    logFailure: () => undefined,
  });
  const state = await invoke(createTranscriptController(dependencies), undefined, "owner-1");
  const body = state.body as Record<string, unknown>;

  assert.equal(state.statusCode, 502);
  assert.equal(body.ok, false);
  assert.equal(
    body.message,
    "Consultation response unavailable. No validated assessment was returned.",
  );
  assert.equal(body.shouldEscalate, true);
  assert.equal("emergencyMessage" in body, false);
  assert.equal("validatedResponse" in body, false);
});

test("upstream timeout/API errors return generic failures and logs contain only error names", async () => {
  const recorded: string[] = [];
  const secretError = new Error("request contained sensitive patient details and token");
  secretError.name = "AxiosError";
  Object.assign(secretError, { code: "ECONNABORTED" });
  const { dependencies } = controllerOptions({
    sendTranscript: async () => {
      throw secretError;
    },
    logFailure: (errorName: string) => recorded.push(errorName),
  });
  const state = await invoke(createTranscriptController(dependencies), undefined, "owner-1");
  const serialized = JSON.stringify(state.body);

  assert.equal(state.statusCode, 500);
  assert.equal(
    (state.body as Record<string, unknown>).message,
    "Consultation response unavailable. No validated assessment was returned.",
  );
  assert.equal(serialized.includes(secretError.message), false);
  assert.deepEqual(recorded, ["AxiosError"]);
});

test("upstream capability-unavailable responses remain generic HTTP 503 degraded states", async () => {
  const { dependencies } = controllerOptions({
    sendTranscript: async () => {
      throw new AIServiceUnavailableError();
    },
    logFailure: () => undefined,
  });

  const state = await invoke(createTranscriptController(dependencies), undefined, "owner-1");
  const body = state.body as Record<string, unknown>;

  assert.equal(state.statusCode, 503);
  assert.equal(body.ok, false);
  assert.equal(
    body.message,
    "Consultation response unavailable. No validated assessment was returned.",
  );
  assert.equal("validatedResponse" in body, false);
  assert.equal("assistantReply" in body, false);
});

test("history shape and required request fields are validated before downstream calls", async () => {
  const { dependencies, calls } = controllerOptions();
  const handler = createTranscriptController(dependencies);
  const invalidHistory = await invoke(
    handler,
    { consultationId: "consultation-1", transcript: "patient text", history: [{ text: 42 }] },
    "owner-1",
  );
  const missingFields = await invoke(handler, { consultationId: "consultation-1" }, "owner-1");

  assert.equal(invalidHistory.statusCode, 400);
  assert.equal(missingFields.statusCode, 400);
  assert.deepEqual(calls, []);
});

test("authentication middleware rejects a request without a token", () => {
  const state: ResponseState = { statusCode: 200 };
  const response = {
    status(statusCode: number) {
      state.statusCode = statusCode;
      return this;
    },
    json(value: unknown) {
      state.body = value;
      return this;
    },
  };
  let nextCalled = false;

  requireAuth({ headers: {} } as Request, response as unknown as Response, () => {
    nextCalled = true;
  });

  assert.equal(state.statusCode, 401);
  assert.equal(nextCalled, false);
});
