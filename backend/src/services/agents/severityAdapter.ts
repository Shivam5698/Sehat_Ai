import { config } from '../../config/index.js';

export type SeverityRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'EMERGENCY';

export interface SeverityAnalyzeRequest {
  sessionId: string;
  symptoms: string[];
  duration: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  language: string;
}

export interface SeverityAnalysis {
  riskLevel: SeverityRiskLevel;
  riskScore: number;
  confidence: number;
  emergency: boolean;
  clinicalSummary: string;
  recommendations: string[];
  reasoning: string[];
}

export type SeverityAdapterResult =
  | { ok: true; data: SeverityAnalysis }
  | { ok: false; error: 'timeout' | 'unavailable' | 'invalid_output' };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isSeverityAnalysis(value: unknown): value is SeverityAnalysis {
  if (!value || typeof value !== 'object') return false;

  const response = value as Record<string, unknown>;
  return (
    ['LOW', 'MODERATE', 'HIGH', 'EMERGENCY'].includes(String(response.riskLevel)) &&
    typeof response.riskScore === 'number' &&
    Number.isFinite(response.riskScore) &&
    response.riskScore >= 0 &&
    response.riskScore <= 100 &&
    typeof response.confidence === 'number' &&
    Number.isFinite(response.confidence) &&
    response.confidence >= 0 &&
    response.confidence <= 1 &&
    typeof response.emergency === 'boolean' &&
    typeof response.clinicalSummary === 'string' &&
    response.clinicalSummary.length > 0 &&
    isStringArray(response.recommendations) &&
    isStringArray(response.reasoning)
  );
}

export async function analyzeSeverity(
  input: SeverityAnalyzeRequest,
): Promise<SeverityAdapterResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 6000);

  try {
    const response = await fetch(
      `${config.severityAgentUrl.replace(/\/$/, '')}/severity/analyze`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    );

    if (!response.ok) return { ok: false, error: 'unavailable' };

    const data: unknown = await response.json().catch(() => undefined);
    if (!isSeverityAnalysis(data)) return { ok: false, error: 'invalid_output' };
    return { ok: true, data };
  } catch {
    return { ok: false, error: timedOut ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timeout);
  }
}
