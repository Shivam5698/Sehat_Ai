import assert from "node:assert/strict";
import { test } from "node:test";
import { AiDoctorWorkflow } from "../src/lib/ai-doctor-workflow.ts";
import { ApiError } from "../src/types/aiDoctor.ts";

const validResponse = {
  ok: true as const,
  validatedResponse: { symptoms: [], recommendations: [] },
};

function createWorkflow(overrides: Record<string, unknown> = {}) {
  const calls = { start: 0, transcript: 0 };
  const api = {
    startConsultation: async () => {
      calls.start += 1;
      return { session: { id: "consultation-1" } };
    },
    sendTranscript: async () => {
      calls.transcript += 1;
      return validResponse;
    },
    ...overrides,
  };
  return { workflow: new AiDoctorWorkflow(api), calls };
}

test("text consultation works while the unverified avatar integration remains disabled", async () => {
  const { workflow, calls } = createWorkflow();
  const started = await workflow.start("en");
  const submission = await workflow.submit("I have a headache", "en", []);

  assert.equal(started.avatarAvailable, false);
  assert.equal(submission.status, "success");
  assert.equal(calls.start, 1);
  assert.equal(calls.transcript, 1);
});

test("repeated consultation startup does not create another consultation or provider session", async () => {
  let providerCalls = 0;
  const { workflow, calls } = createWorkflow({
    initializeAvatar: async () => {
      providerCalls += 1;
      return { sessionId: "unverified-session" };
    },
    startAvatar: async () => {
      providerCalls += 1;
    },
    avatarSpeak: async () => {
      providerCalls += 1;
    },
  });
  const first = workflow.start("en");
  const second = workflow.start("en");
  assert.equal(first, second);
  const started = await workflow.start("en");

  assert.equal(started.avatarAvailable, false);
  assert.equal(calls.start, 1);
  assert.equal(calls.transcript, 0);
  assert.equal(providerCalls, 0);
});

test("an API failure has no successful response and cannot blindly resend an uncertain transcript", async () => {
  const { workflow, calls } = createWorkflow({
    sendTranscript: async () => {
      calls.transcript += 1;
      throw new ApiError(500, {
        ok: false,
        message: "Consultation response unavailable. No validated assessment was returned.",
      });
    },
  });

  await workflow.start("en");
  const first = await workflow.submit("I have a headache", "en", []);
  const second = await workflow.submit("I have a headache", "en", []);

  assert.equal(first.status, "failed");
  assert.equal(second.status, "unconfirmed");
  assert.equal(calls.transcript, 1);
});

test("duplicate submission while pending is blocked", async () => {
  let resolveRequest!: (response: typeof validResponse) => void;
  const { workflow, calls } = createWorkflow({
    sendTranscript: () => {
      calls.transcript += 1;
      return new Promise<typeof validResponse>((resolve) => {
        resolveRequest = resolve;
      });
    },
  });
  await workflow.start("en");

  const pending = workflow.submit("I have a headache", "en", []);
  const duplicate = await workflow.submit("I have a headache", "en", []);
  resolveRequest(validResponse);
  const result = await pending;

  assert.equal(duplicate.status, "pending");
  assert.equal(result.status, "success");
  assert.equal(calls.transcript, 1);
});

test("a 401 can retry the same transcript without creating a second consultation", async () => {
  const { workflow, calls } = createWorkflow({
    sendTranscript: async () => {
      calls.transcript += 1;
      if (calls.transcript === 1) throw new ApiError(401, { message: "Missing token" });
      return validResponse;
    },
  });
  await workflow.start("en");
  const failed = await workflow.submit("I have a headache", "en", []);
  const retry = await workflow.submit("I have a headache", "en", []);

  assert.equal(failed.status, "failed");
  assert.equal(failed.status === "failed" && failed.retryable, true);
  assert.equal(retry.status, "success");
  assert.equal(calls.start, 1);
  assert.equal(calls.transcript, 2);
});

test("a consultation creation failure cannot be retried unless authentication rejected it", async () => {
  const { workflow, calls } = createWorkflow({
    startConsultation: async () => {
      calls.start += 1;
      throw new Error("Network failure");
    },
  });

  await assert.rejects(workflow.start("en"), /Network failure/);
  await assert.rejects(workflow.start("en"), /Network failure/);
  assert.equal(calls.start, 1);
});
