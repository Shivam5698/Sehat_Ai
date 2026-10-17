import { config } from '../../config/index.js';

export interface SymptomAnalyzeRequest {
  sessionId: string;
  message: string;
  language?: string;
}

export interface SymptomAnalysis {
  success: boolean;
  agent: 'symptom-agent';
  timestamp: string;
  language: string;
  data: {
    summary: {
      primarySymptoms: string[];
      duration?: string;
      severityHint?: string;
    };
    followUpQuestions: string[];
    emergencySignals: boolean;
    conversationStage: string;
  };
  nextStep?: string;
}

export type SymptomAdapterResult =
  | { ok: true; data: SymptomAnalysis }
  | { ok: false; error: 'timeout' | 'unavailable' | 'invalid_output' };

const initializedSessions = new Map<string, Promise<boolean>>();

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function initializeSession(
  sessionId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const existing = initializedSessions.get(sessionId);
  if (existing) return existing;

  const initialization = fetch(
    `${config.symptomAgentUrl.replace(/\/$/, '')}/session/start`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.SYMP_AGENT_API_KEY ?? '',
      },
      body: JSON.stringify({ sessionId }),
      signal,
    },
  ).then((response) => response.ok);

  initializedSessions.set(sessionId, initialization);
  void initialization.then((initialized) => {
    if (!initialized && initializedSessions.get(sessionId) === initialization) {
      initializedSessions.delete(sessionId);
    }
  }, () => {
    if (initializedSessions.get(sessionId) === initialization) {
      initializedSessions.delete(sessionId);
    }
  });
  return initialization;
}

function isSymptomAnalysis(value: unknown): value is SymptomAnalysis {
  if (!value || typeof value !== 'object') return false;

  const response = value as Record<string, unknown>;
  if (
    response.success !== true ||
    response.agent !== 'symptom-agent' ||
    typeof response.timestamp !== 'string' ||
    typeof response.language !== 'string' ||
    !response.data ||
    typeof response.data !== 'object'
  ) {
    return false;
  }

  const data = response.data as Record<string, unknown>;
  if (
    !data.summary ||
    typeof data.summary !== 'object' ||
    !isStringArray(data.followUpQuestions) ||
    typeof data.emergencySignals !== 'boolean' ||
    typeof data.conversationStage !== 'string' ||
    (response.nextStep !== undefined && typeof response.nextStep !== 'string')
  ) {
    return false;
  }

  const summary = data.summary as Record<string, unknown>;
  return (
    isStringArray(summary.primarySymptoms) &&
    summary.primarySymptoms.length > 0 &&
    (summary.duration === undefined || typeof summary.duration === 'string') &&
    (summary.severityHint === undefined || typeof summary.severityHint === 'string')
  );
}

export async function analyzeSymptoms(
  input: SymptomAnalyzeRequest,
): Promise<SymptomAdapterResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, error: 'unavailable' };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 6000);

  try {
    if (!(await initializeSession(input.sessionId, controller.signal))) {
      return { ok: false, error: 'unavailable' };
    }

    const response = await fetch(
      `${config.symptomAgentUrl.replace(/\/$/, '')}/symptoms/analyze`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.SYMP_AGENT_API_KEY ?? '',
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    );

    if (!response.ok) return { ok: false, error: 'unavailable' };

    const data: unknown = await response.json().catch(() => undefined);
    if (!isSymptomAnalysis(data)) return { ok: false, error: 'invalid_output' };
    return { ok: true, data };
  } catch {
    return { ok: false, error: timedOut ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timeout);
  }
}
