import { performance } from 'node:perf_hooks';
import { emergencyPreScreen } from './emergencyPreScreen.js';
import {
  analyzeSymptoms,
  type SymptomAnalysis,
} from './agents/symptomAdapter.js';
import {
  analyzeSeverity,
  type SeverityAnalysis,
} from './agents/severityAdapter.js';
import {
  evaluateSafety,
  type SafetyAnalysis,
} from './agents/safetyAdapter.js';
import { composeReply } from './replyComposer.js';

const AGENT_TIMEOUT_MS = 6000;
const TOTAL_TIMEOUT_MS = 12000;

export interface AgentOrchestratorInput {
  sessionId: string;
  message: string;
  language: string;
  history?: Array<{ speaker: string; text: string }>;
  duration?: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
}

export interface AgentInvocation {
  agent: 'symptom' | 'severity' | 'safety';
  ok: boolean;
  latencyMs: number;
  error?: 'timeout' | 'unavailable' | 'invalid_output';
}

export interface AgentOrchestrationResult {
  reply: string;
  followUpQuestion?: string;
  emergency: boolean;
  emergencyType?: string;
  emergencyMessage?: string;
  degraded: boolean;
  agentsInvoked: AgentInvocation[];
  symptom?: SymptomAnalysis;
  severity?: SeverityAnalysis;
  safety?: SafetyAnalysis;
}

type AgentResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: 'timeout' | 'unavailable' | 'invalid_output' };

export interface AgentAdapters {
  analyzeSymptoms: typeof analyzeSymptoms;
  analyzeSeverity: typeof analyzeSeverity;
  evaluateSafety: typeof evaluateSafety;
}

const defaultAdapters: AgentAdapters = {
  analyzeSymptoms,
  analyzeSeverity,
  evaluateSafety,
};

async function invokeWithinBudget<T>(
  agent: AgentInvocation['agent'],
  operation: () => Promise<AgentResult<T>>,
  startedAt: number,
  deadline: number,
  agentsInvoked: AgentInvocation[],
): Promise<AgentResult<T>> {
  const remainingMs = Math.min(AGENT_TIMEOUT_MS, deadline - performance.now());
  if (remainingMs <= 0) {
    const result = { ok: false as const, error: 'timeout' as const };
    agentsInvoked.push({ agent, ok: false, latencyMs: 0, error: result.error });
    return result;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<AgentResult<T>>((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ ok: false, error: 'timeout' }),
      remainingMs,
    );
  });

  let result: AgentResult<T>;
  try {
    result = await Promise.race([operation(), timeoutResult]);
  } catch {
    result = { ok: false, error: 'unavailable' };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  agentsInvoked.push({
    agent,
    ok: result.ok,
    latencyMs: Math.round(performance.now() - startedAt),
    ...(!result.ok ? { error: result.error } : {}),
  });
  return result;
}

export async function orchestrateAgents(
  input: AgentOrchestratorInput,
  adapters: AgentAdapters = defaultAdapters,
): Promise<AgentOrchestrationResult> {
  const preScreen = emergencyPreScreen(input.message);
  if (preScreen.detected) {
    const emergency = {
      type: preScreen.type ?? 'emergency',
      message: preScreen.message ?? 'Please contact local emergency services now.',
    };
    const composition = composeReply({ emergency, degraded: false });
    return {
      ...composition,
      emergency: true,
      emergencyType: emergency.type,
      emergencyMessage: emergency.message,
      degraded: false,
      agentsInvoked: [],
    };
  }

  const agentsInvoked: AgentInvocation[] = [];
  const deadline = performance.now() + TOTAL_TIMEOUT_MS;
  const consultationId = input.sessionId;
  const symptomResult = await invokeWithinBudget(
    'symptom',
    () =>
      adapters.analyzeSymptoms({
        sessionId: consultationId,
        message: [
          ...(input.history ?? []).map(
            (turn) => `${turn.speaker}: ${turn.text}`,
          ),
          `patient: ${input.message}`,
        ]
          .join('\n')
          .slice(-10000),
        language: input.language,
      }),
    performance.now(),
    deadline,
    agentsInvoked,
  );

  if (!symptomResult.ok) {
    return createDegradedResult(agentsInvoked);
  }

  const symptoms = symptomResult.data.data.summary.primarySymptoms;
  const duration = symptomResult.data.data.summary.duration;
  const age = input.age;
  const gender = input.gender;
  if (
    duration === undefined ||
    age === undefined ||
    gender === undefined
  ) {
    agentsInvoked.push({
      agent: 'severity',
      ok: false,
      latencyMs: 0,
      error: 'unavailable',
    });
    agentsInvoked.push({
      agent: 'safety',
      ok: false,
      latencyMs: 0,
      error: 'unavailable',
    });
    return createDegradedResult(agentsInvoked, symptomResult.data);
  }

  const severityResult = await invokeWithinBudget(
    'severity',
    () =>
      adapters.analyzeSeverity({
        sessionId: consultationId,
        symptoms,
        duration,
        age,
        gender,
        language: input.language,
      }),
    performance.now(),
    deadline,
    agentsInvoked,
  );

  if (!severityResult.ok) {
    return createDegradedResult(agentsInvoked, symptomResult.data);
  }

  const safetyRiskLevel =
    severityResult.data.riskLevel === 'LOW'
      ? 'LOW'
      : severityResult.data.riskLevel === 'MODERATE'
        ? 'MEDIUM'
        : 'HIGH';
  const safetyResult = await invokeWithinBudget(
    'safety',
    () =>
      adapters.evaluateSafety({
        sessionId: consultationId,
        symptoms,
        severityResult: {
          riskLevel: safetyRiskLevel,
          riskScore: severityResult.data.riskScore,
          confidence: severityResult.data.confidence,
        },
        recommendations: severityResult.data.recommendations,
      }),
    performance.now(),
    deadline,
    agentsInvoked,
  );

  if (!safetyResult.ok) {
    return createDegradedResult(
      agentsInvoked,
      symptomResult.data,
      severityResult.data,
    );
  }

  const composition = composeReply({
    symptom: symptomResult.data,
    severity: severityResult.data,
    safety: safetyResult.data,
    degraded: false,
  });
  const emergencyDetected =
    safetyResult.data.emergency ||
    safetyResult.data.escalationLevel === 'EMERGENCY_ESCALATION' ||
    severityResult.data.emergency ||
    severityResult.data.riskLevel === 'EMERGENCY' ||
    symptomResult.data.data.emergencySignals;

  return {
    ...composition,
    emergency: emergencyDetected,
    ...(emergencyDetected ? { emergencyType: 'agent_escalation' } : {}),
    degraded: false,
    agentsInvoked,
    symptom: symptomResult.data,
    severity: severityResult.data,
    safety: safetyResult.data,
  };
}

function createDegradedResult(
  agentsInvoked: AgentInvocation[],
  symptom?: SymptomAnalysis,
  severity?: SeverityAnalysis,
): AgentOrchestrationResult {
  const degraded = agentsInvoked.some((agent) => !agent.ok);
  const composition = composeReply({ symptom, severity, degraded });
  const emergency =
    severity?.emergency === true ||
    severity?.riskLevel === 'EMERGENCY' ||
    symptom?.data.emergencySignals === true;
  return {
    ...composition,
    emergency,
    ...(emergency ? { emergencyType: 'agent_escalation' } : {}),
    degraded,
    agentsInvoked,
    ...(symptom ? { symptom } : {}),
    ...(severity ? { severity } : {}),
  };
}
