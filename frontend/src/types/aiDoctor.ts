export type ConsultationHistoryEntry = {
  speaker: "patient" | "ai" | "system";
  text: string;
  language?: string;
  timestamp?: string;
};

export type AIDoctorTranscriptRequest = {
  consultationId: string;
  transcript: string;
  language?: string;
  history?: ConsultationHistoryEntry[];
};

export type AIDoctorSymptom = {
  id: string;
  name: string;
  duration?: string;
  severity?: string;
  reported?: boolean;
};

export type AIDoctorRiskAssessment = {
  riskScore: number;
  level: "low" | "medium" | "high" | "critical";
  confidence: number;
  details?: string;
};

export type AIDoctorValidatedResponse = {
  symptoms?: AIDoctorSymptom[];
  riskAssessment?: AIDoctorRiskAssessment;
  safetyIssues?: string[];
  recommendations?: string[];
  nextAction?: string;
  shouldEscalate?: boolean;
  emergencyMessage?: string;
};

export type TranscriptResponse = {
  ok: true;
  validatedResponse: AIDoctorValidatedResponse;
};

export type AIDoctorApiErrorPayload = {
  ok: false;
  message: string;
  error?: string;
  shouldEscalate?: boolean;
  emergencyMessage?: string;
};

export class AIDoctorContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIDoctorContractError";
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly degraded: boolean;
  readonly shouldEscalate: boolean;
  readonly emergencyMessage?: string;

  constructor(status: number, payload: unknown) {
    const body = isRecord(payload) ? payload : undefined;
    const message = typeof body?.message === "string" ? body.message : `API Error: ${status}`;

    super(message);
    this.name = "ApiError";
    this.status = status;
    this.degraded = status >= 500;
    this.shouldEscalate = body?.shouldEscalate === true;
    this.emergencyMessage =
      typeof body?.emergencyMessage === "string" ? body.emergencyMessage : undefined;
  }
}

export function parseTranscriptResponse(payload: unknown): TranscriptResponse {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.validatedResponse)) {
    throw new AIDoctorContractError("Invalid AI Doctor transcript response.");
  }

  const result = payload.validatedResponse;
  if (result.symptoms !== undefined && !isSymptomArray(result.symptoms)) {
    throw new AIDoctorContractError("Invalid symptoms in AI Doctor transcript response.");
  }
  if (result.riskAssessment !== undefined && !isRiskAssessment(result.riskAssessment)) {
    throw new AIDoctorContractError("Invalid risk assessment in AI Doctor transcript response.");
  }
  if (result.safetyIssues !== undefined && !isStringArray(result.safetyIssues)) {
    throw new AIDoctorContractError("Invalid safety issues in AI Doctor transcript response.");
  }
  if (result.recommendations !== undefined && !isStringArray(result.recommendations)) {
    throw new AIDoctorContractError("Invalid recommendations in AI Doctor transcript response.");
  }
  if (result.nextAction !== undefined && typeof result.nextAction !== "string") {
    throw new AIDoctorContractError("Invalid next action in AI Doctor transcript response.");
  }
  if (result.shouldEscalate !== undefined && typeof result.shouldEscalate !== "boolean") {
    throw new AIDoctorContractError("Invalid escalation flag in AI Doctor transcript response.");
  }
  if (result.emergencyMessage !== undefined && typeof result.emergencyMessage !== "string") {
    throw new AIDoctorContractError("Invalid emergency message in AI Doctor transcript response.");
  }

  return payload as TranscriptResponse;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isSymptomArray(value: unknown): value is AIDoctorSymptom[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.id === "string" &&
        typeof entry.name === "string" &&
        (entry.duration === undefined || typeof entry.duration === "string") &&
        (entry.severity === undefined || typeof entry.severity === "string") &&
        (entry.reported === undefined || typeof entry.reported === "boolean"),
    )
  );
}

function isRiskAssessment(value: unknown): value is AIDoctorRiskAssessment {
  if (!isRecord(value)) return false;
  return (
    typeof value.riskScore === "number" &&
    Number.isFinite(value.riskScore) &&
    (value.level === "low" ||
      value.level === "medium" ||
      value.level === "high" ||
      value.level === "critical") &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    (value.details === undefined || typeof value.details === "string")
  );
}
