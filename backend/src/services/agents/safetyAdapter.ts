import { config } from '../../config/index.js';

export type SafetyRiskLevel = 'SAFE' | 'CAUTION' | 'UNSAFE' | 'EMERGENCY';
export type SafetyEscalationLevel =
  | 'NO_ESCALATION'
  | 'CAUTION'
  | 'DOCTOR_REVIEW'
  | 'EMERGENCY_ESCALATION';

export interface SafetyAnalyzeRequest {
  sessionId: string;
  symptoms: string[];
  severityResult: {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    riskScore: number;
    confidence: number;
  };
  recommendations: string[];
}

export interface SafetyAnalysis {
  safe: boolean;
  emergency: boolean;
  escalationRequired: boolean;
  confidence: number;
  riskLevel: SafetyRiskLevel;
  safetyWarnings: string[];
  approvedRecommendations: string[];
  blockedRecommendations: string[];
  hallucinationDetected: boolean;
  consistencyFailed: boolean;
  escalationLevel: SafetyEscalationLevel;
  validationErrors?: string[];
}

export type SafetyAdapterResult =
  | { ok: true; data: SafetyAnalysis }
  | { ok: false; error: 'timeout' | 'unavailable' | 'invalid_output' };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isSafetyAnalysis(value: unknown): value is SafetyAnalysis {
  if (!value || typeof value !== 'object') return false;

  const response = value as Record<string, unknown>;
  return (
    typeof response.safe === 'boolean' &&
    typeof response.emergency === 'boolean' &&
    typeof response.escalationRequired === 'boolean' &&
    typeof response.confidence === 'number' &&
    Number.isFinite(response.confidence) &&
    response.confidence >= 0 &&
    response.confidence <= 1 &&
    ['SAFE', 'CAUTION', 'UNSAFE', 'EMERGENCY'].includes(String(response.riskLevel)) &&
    isStringArray(response.safetyWarnings) &&
    isStringArray(response.approvedRecommendations) &&
    isStringArray(response.blockedRecommendations) &&
    typeof response.hallucinationDetected === 'boolean' &&
    typeof response.consistencyFailed === 'boolean' &&
    ['NO_ESCALATION', 'CAUTION', 'DOCTOR_REVIEW', 'EMERGENCY_ESCALATION'].includes(
      String(response.escalationLevel),
    ) &&
    (response.validationErrors === undefined || isStringArray(response.validationErrors))
  );
}

export async function evaluateSafety(
  input: SafetyAnalyzeRequest,
): Promise<SafetyAdapterResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 6000);

  try {
    const response = await fetch(
      `${config.safetyAgentUrl.replace(/\/$/, '')}/safety/evaluate`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    );

    if (!response.ok) return { ok: false, error: 'unavailable' };

    const data: unknown = await response.json().catch(() => undefined);
    if (!isSafetyAnalysis(data)) return { ok: false, error: 'invalid_output' };
    return { ok: true, data };
  } catch {
    return { ok: false, error: timedOut ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timeout);
  }
}
