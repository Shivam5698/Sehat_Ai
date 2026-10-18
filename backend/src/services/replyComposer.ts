import type { SafetyAnalysis } from './agents/safetyAdapter.js';
import type { SeverityAnalysis } from './agents/severityAdapter.js';
import type { SymptomAnalysis } from './agents/symptomAdapter.js';

export interface ReplyComposition {
  reply: string;
  followUpQuestion?: string;
}

export interface ReplyComposerInput {
  symptom?: SymptomAnalysis;
  severity?: SeverityAnalysis;
  safety?: SafetyAnalysis;
  degraded: boolean;
  emergency?: {
    type: string;
    message: string;
  };
}

const DISCLAIMER = 'This is not a diagnosis and is not a substitute for professional medical advice.';

const CONSERVATIVE_REPLY =
  `I cannot determine the cause of these symptoms from this conversation, and important information may be missing. Please contact a qualified clinician promptly; if you may be in immediate danger, contact local emergency services now. ${DISCLAIMER}`;

export function composeReply(input: ReplyComposerInput): ReplyComposition {
  if (input.emergency) {
    return {
      reply: `${input.emergency.message} ${DISCLAIMER}`,
    };
  }

  const safety = input.safety;
  const safetyAllowsRoutineReply =
    safety?.safe === true &&
    safety.riskLevel === 'SAFE' &&
    !safety.emergency &&
    !safety.escalationRequired &&
    !safety.hallucinationDetected &&
    !safety.consistencyFailed &&
    safety.blockedRecommendations.length === 0 &&
    input.severity?.emergency !== true &&
    input.severity?.riskLevel !== 'EMERGENCY';

  if (
    input.degraded ||
    !input.symptom ||
    !input.severity ||
    !safetyAllowsRoutineReply ||
    input.symptom.data.emergencySignals
  ) {
    return { reply: CONSERVATIVE_REPLY };
  }

  const followUpQuestion = input.symptom.data.followUpQuestions.find(
    (question) => question.trim().length > 0,
  );

  return {
    reply: `I cannot determine what is causing these symptoms from this conversation. A clinician can assess the symptoms and advise on appropriate care. ${DISCLAIMER}`,
    ...(followUpQuestion ? { followUpQuestion } : {}),
  };
}
