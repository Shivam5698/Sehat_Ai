import type { RiskAssessment, Symptom } from "../types/consultation.js";

export interface OrchestrationResult {
  symptoms: Symptom[];
  riskAssessment: RiskAssessment;
  safetyIssues?: string[];
  recommendations?: string[];
  nextAction?: string;
  shouldEscalate?: boolean;
  emergencyMessage?: string;
}

export class InvalidAIResponseError extends Error {
  readonly shouldEscalate: boolean;

  constructor(shouldEscalate = false) {
    super("The generated response could not be validated.");
    this.name = "InvalidAIResponseError";
    this.shouldEscalate = shouldEscalate;
  }
}

export class AIServiceUnavailableError extends Error {
  constructor() {
    super("The AI consultation service is unavailable.");
    this.name = "AIServiceUnavailableError";
  }
}

const riskLevels = new Set<RiskAssessment["level"]>(["low", "medium", "high", "critical"]);
const nextActions = new Set(["appointment-booking", "emergency-escalation"]);

export function validateAndMapWorkflowResult(payload: unknown): OrchestrationResult {
  const workflow = isRecord(payload) ? payload : undefined;
  const response = isRecord(workflow?.response) ? workflow.response : undefined;
  const shouldEscalate =
    workflow?.emergencyDetected === true ||
    response?.shouldEscalate === true ||
    response?.nextAction === "emergency-escalation";
  const invalid = () => new InvalidAIResponseError(shouldEscalate);

  if (!workflow || workflow.workflowStatus !== "COMPLETED" || !response) {
    throw invalid();
  }
  if (workflow.emergencyDetected !== undefined && typeof workflow.emergencyDetected !== "boolean") {
    throw invalid();
  }
  if (response.shouldEscalate !== undefined && typeof response.shouldEscalate !== "boolean") {
    throw invalid();
  }
  if (response.emergencyMessage !== undefined && typeof response.emergencyMessage !== "string") {
    throw invalid();
  }
  if (
    typeof response.emergencyMessage === "string" &&
    response.emergencyMessage.trim() &&
    !shouldEscalate
  ) {
    throw invalid();
  }

  const risk = response.risk;
  const riskScore = response.riskScore;
  const confidence = response.confidence;
  if (
    typeof risk !== "string" ||
    !isRiskLevel(risk) ||
    typeof riskScore !== "number" ||
    !Number.isFinite(riskScore) ||
    typeof confidence !== "number" ||
    !Number.isFinite(confidence)
  ) {
    throw invalid();
  }

  if (!Array.isArray(response.symptoms)) throw invalid();
  const symptoms: Symptom[] = response.symptoms.map((symptom, index) => {
    if (!isRecord(symptom) || typeof symptom.name !== "string" || !symptom.name.trim()) {
      throw invalid();
    }
    if (
      (symptom.id !== undefined && typeof symptom.id !== "string") ||
      (symptom.duration !== undefined && typeof symptom.duration !== "string") ||
      (symptom.severity !== undefined && typeof symptom.severity !== "string") ||
      (symptom.reported !== undefined && typeof symptom.reported !== "boolean")
    ) {
      throw invalid();
    }
    if (symptom.reported !== true) throw invalid();
    return {
      id: typeof symptom.id === "string" && symptom.id ? symptom.id : `symptom-${index + 1}`,
      name: symptom.name,
      ...(typeof symptom.duration === "string" ? { duration: symptom.duration } : {}),
      ...(typeof symptom.severity === "string" ? { severity: symptom.severity } : {}),
      reported: true,
    };
  });

  const recommendations = Array.isArray(response.recommendations)
    ? response.recommendations
    : response.recommendation === undefined
      ? []
      : [response.recommendation];
  if (
    (response.recommendations !== undefined && !Array.isArray(response.recommendations)) ||
    (response.recommendation !== undefined && typeof response.recommendation !== "string")
  ) {
    throw invalid();
  }
  if (
    !recommendations.every(
      (recommendation) => typeof recommendation === "string" && recommendation.trim().length > 0,
    )
  ) {
    throw invalid();
  }

  // The upstream contract has no source attribution or connected safety approval for these claims.
  if (recommendations.length > 0) throw invalid();

  if (response.safetyIssues !== undefined && !isStringArray(response.safetyIssues)) {
    throw invalid();
  }
  if (Array.isArray(response.safetyIssues) && response.safetyIssues.length > 0) {
    throw invalid();
  }
  if (
    response.nextAction !== undefined &&
    (typeof response.nextAction !== "string" || !nextActions.has(response.nextAction))
  ) {
    throw invalid();
  }
  if (
    isRecord(response.metadata) &&
    response.metadata.details !== undefined &&
    (typeof response.metadata.details !== "string" || response.metadata.details.trim())
  ) {
    throw invalid();
  }

  return {
    symptoms,
    riskAssessment: {
      riskScore,
      level: risk,
      confidence,
      ...(isRecord(response.metadata) && typeof response.metadata.details === "string"
        ? { details: response.metadata.details }
        : {}),
    },
    ...(response.safetyIssues ? { safetyIssues: response.safetyIssues } : {}),
    recommendations: [],
    ...(shouldEscalate
      ? { nextAction: "emergency-escalation" }
      : typeof response.nextAction === "string"
        ? { nextAction: response.nextAction }
        : {}),
    shouldEscalate,
  };
}

export function createSafeAgentLogPayload(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) return {};
  return {
    workflowStatus: payload.workflowStatus === "COMPLETED" ? "COMPLETED" : "OTHER",
    emergencyDetected: payload.emergencyDetected === true,
  };
}

export function safeErrorName(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : "Error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isRiskLevel(value: unknown): value is RiskAssessment["level"] {
  return typeof value === "string" && riskLevels.has(value as RiskAssessment["level"]);
}
