import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { AxiosError } from "axios";
import { test } from "node:test";
import type { ConversationContext } from "../src/types/consultation.ts";
import {
  AIOrchestratorService,
  buildProcessRequest,
  type ProcessRequest,
} from "../dist/services/aiOrchestratorService.js";
import {
  AIServiceUnavailableError,
  InvalidAIResponseError,
} from "../dist/services/aiResponseBoundary.js";

const requestFixturePath = join(
  process.cwd(),
  "..",
  "ai",
  "tests",
  "fixtures",
  "process_request.json",
);

async function getFixture() {
  return JSON.parse(await readFile(requestFixturePath, "utf8")) as ProcessRequest;
}

test("backend request builder matches the shared Python ProcessRequest fixture", async () => {
  const fixture = await getFixture();
  const context: ConversationContext = {
    consultationId: fixture.sessionId,
    language: fixture.language,
    symptoms: [],
    riskLevel: "unknown",
    history: fixture.metadata.conversationHistory.map((entry, index) => ({
      id: `history-${index + 1}`,
      speaker: entry.speaker,
      text: entry.text,
      language: fixture.language,
      timestamp: new Date(entry.timestamp),
    })),
    metadata: {},
  };

  assert.deepEqual(JSON.parse(JSON.stringify(buildProcessRequest(context))), fixture);
});

test("orchestration returns only validated results with a complete risk assessment", async () => {
  const service = new AIOrchestratorService("http://127.0.0.1:8000", async () => ({
    workflowStatus: "COMPLETED",
    emergencyDetected: false,
    response: {
      symptoms: [],
      risk: "low",
      riskScore: 0,
      confidence: 0.8,
      recommendations: [],
      safetyIssues: [],
    },
  }));
  const result = await service.orchestrateConsultation({
    consultationId: "consultation-test",
    language: "en",
    symptoms: [],
    riskLevel: "unknown",
    history: [],
    metadata: {},
  });

  assert.deepEqual(result.riskAssessment, {
    riskScore: 0,
    level: "low",
    confidence: 0.8,
  });

  const invalidService = new AIOrchestratorService("http://127.0.0.1:8000", async () => ({
    workflowStatus: "COMPLETED",
    emergencyDetected: false,
    response: {
      symptoms: [],
      riskScore: 0,
      confidence: 0.8,
      recommendations: [],
      safetyIssues: [],
    },
  }));
  await assert.rejects(
    invalidService.orchestrateConsultation({
      consultationId: "consultation-test",
      language: "en",
      symptoms: [],
      riskLevel: "unknown",
      history: [],
      metadata: {},
    }),
    InvalidAIResponseError,
  );
});

test("backend sends the contract request to /process and maps Python 503 to generic unavailable", async () => {
  const fixture = await getFixture();
  let capturedUrl = "";
  let capturedPayload: ProcessRequest | undefined;
  let capturedTimeout: number | undefined;
  const upstreamError = new AxiosError("private upstream detail");
  Object.assign(upstreamError, { response: { status: 503 } });
  const service = new AIOrchestratorService(
    "http://127.0.0.1:8000/",
    async (url, payload, options) => {
      capturedUrl = url;
      capturedPayload = payload;
      capturedTimeout = options.timeout;
      throw upstreamError;
    },
  );
  const context: ConversationContext = {
    consultationId: fixture.sessionId,
    language: fixture.language,
    symptoms: [],
    riskLevel: "unknown",
    history: fixture.metadata.conversationHistory.map((entry, index) => ({
      id: `history-${index + 1}`,
      speaker: entry.speaker,
      text: entry.text,
      language: fixture.language,
      timestamp: new Date(entry.timestamp),
    })),
    metadata: {},
  };

  await assert.rejects(service.orchestrateConsultation(context), (error: unknown) => {
    assert.ok(error instanceof AIServiceUnavailableError);
    assert.equal(error.message.includes("private upstream detail"), false);
    return true;
  });
  assert.equal(capturedUrl, "http://127.0.0.1:8000/process");
  assert.deepEqual(JSON.parse(JSON.stringify(capturedPayload)), fixture);
  assert.equal(capturedTimeout, 15000);
});

test("backend maps upstream timeout to generic unavailable without exposing details", async () => {
  const fixture = await getFixture();
  const timeoutError = new AxiosError("timeout contained private request details");
  const service = new AIOrchestratorService("http://127.0.0.1:8000", async () => {
    throw timeoutError;
  });
  const context: ConversationContext = {
    consultationId: fixture.sessionId,
    language: fixture.language,
    symptoms: [],
    riskLevel: "unknown",
    history: fixture.metadata.conversationHistory.map((entry, index) => ({
      id: `history-${index + 1}`,
      speaker: entry.speaker,
      text: entry.text,
      language: fixture.language,
      timestamp: new Date(entry.timestamp),
    })),
    metadata: {},
  };

  await assert.rejects(service.orchestrateConsultation(context), (error: unknown) => {
    assert.ok(error instanceof AIServiceUnavailableError);
    assert.equal(error.message.includes("private request details"), false);
    return true;
  });
});
