import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSafeAgentLogPayload,
  InvalidAIResponseError,
  safeErrorName,
  validateAndMapWorkflowResult,
} from "../dist/services/aiResponseBoundary.js";

function validWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    workflowId: "workflow-test",
    workflowStatus: "COMPLETED",
    emergencyDetected: false,
    response: {
      symptoms: [{ id: "symptom-1", name: "headache", reported: true }],
      risk: "low",
      riskScore: 0,
      confidence: 0.8,
      recommendations: [],
      safetyIssues: [],
    },
    ...overrides,
  };
}

test("maps a structurally valid upstream result and preserves symptom provenance", () => {
  const result = validateAndMapWorkflowResult(validWorkflow());

  assert.deepEqual(
    result.symptoms.map(({ name, reported }) => ({ name, reported })),
    [{ name: "headache", reported: true }],
  );
  assert.deepEqual(result.riskAssessment, { riskScore: 0, level: "low", confidence: 0.8 });
  assert.deepEqual(result.recommendations, []);
  assert.equal(result.shouldEscalate, false);
});

test("rejects symptoms not explicitly marked as patient-reported", () => {
  for (const symptom of [
    { name: "AI-generated interpretation", reported: false },
    { name: "unknown provenance" },
    "unattributed symptom string",
  ]) {
    const unprovenanced = validWorkflow({
      response: { ...(validWorkflow().response as object), symptoms: [symptom] },
    });
    assert.throws(() => validateAndMapWorkflowResult(unprovenanced), InvalidAIResponseError);
  }
});

test("rejects missing, malformed, or invalid risk data instead of defaulting to low risk", () => {
  const missing = validWorkflow();
  delete (missing.response as Record<string, unknown>).risk;
  assert.throws(() => validateAndMapWorkflowResult(missing), InvalidAIResponseError);

  for (const riskAssessment of [
    { risk: "moderate", riskScore: 0, confidence: 0.8 },
    { risk: "low", riskScore: Number.NaN, confidence: 0.8 },
    { risk: "low", riskScore: 0, confidence: "high" },
  ]) {
    const malformed = validWorkflow({
      response: { ...(validWorkflow().response as object), ...riskAssessment },
    });
    assert.throws(() => validateAndMapWorkflowResult(malformed), InvalidAIResponseError);
  }
});

test("rejects invalid workflow payloads and malformed symptom fields", () => {
  assert.throws(() => validateAndMapWorkflowResult(null), InvalidAIResponseError);
  assert.throws(
    () => validateAndMapWorkflowResult(validWorkflow({ workflowStatus: "FAILED" })),
    InvalidAIResponseError,
  );
  const malformed = validWorkflow({
    response: {
      ...(validWorkflow().response as object),
      symptoms: [{ name: "" }],
    },
  });
  assert.throws(() => validateAndMapWorkflowResult(malformed), InvalidAIResponseError);
});

test("fails closed on medication, diagnosis, and unsupported recommendation text without relying on keywords", () => {
  const generatedClaims = [
    "Take example-medicine 500 mg twice daily.",
    "You definitely have condition X.",
    "This unsupported claim has no attributable source.",
  ];

  for (const recommendation of generatedClaims) {
    const unvalidated = validWorkflow({
      response: { ...(validWorkflow().response as object), recommendations: [recommendation] },
    });
    assert.throws(() => validateAndMapWorkflowResult(unvalidated), InvalidAIResponseError);
  }
});

test("preserves emergency escalation metadata when another response field fails validation", () => {
  const emergency = validWorkflow({
    emergencyDetected: true,
    response: {
      ...(validWorkflow().response as object),
      emergencyMessage: "Contact local emergency services now.",
      recommendations: ["Unsupported additional advice"],
    },
  });

  assert.throws(
    () => validateAndMapWorkflowResult(emergency),
    (error: unknown) => {
      assert.ok(error instanceof InvalidAIResponseError);
      assert.equal(error.shouldEscalate, true);
      return true;
    },
  );
});

test("valid emergency responses preserve escalation without forwarding model-generated text", () => {
  const result = validateAndMapWorkflowResult(
    validWorkflow({
      emergencyDetected: true,
      response: {
        ...(validWorkflow().response as object),
        emergencyMessage: "unvalidated generated instructions",
      },
    }),
  );

  assert.equal(result.shouldEscalate, true);
  assert.equal("emergencyMessage" in result, false);
});

test("agent log payloads retain only workflow metadata, never request or health content", () => {
  const payload = createSafeAgentLogPayload({
    workflowId: "workflow-test",
    workflowStatus: "COMPLETED",
    emergencyDetected: true,
    input: "patient transcript",
    response: { recommendations: ["sensitive generated content"] },
    metadata: { conversationHistory: ["patient transcript"] },
  });

  assert.deepEqual(payload, {
    workflowStatus: "COMPLETED",
    emergencyDetected: true,
  });
  assert.equal(safeErrorName(new Error("patient transcript and token")), "Error");
  const namedError = new Error("unexposed failure");
  namedError.name = "AxiosError";
  assert.equal(safeErrorName(namedError), "AxiosError");
});
