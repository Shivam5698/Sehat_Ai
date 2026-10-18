import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Response } from 'express';
import { prisma } from '../database/client.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { emergencyPreScreen } from '../services/emergencyPreScreen.js';
import { asyncHandler } from './consultation.js';
import {
  getHospitalRecommendations,
  orchestrateAgents,
} from '../services/agentOrchestrator.js';
import type { AgentOrchestrationResult } from '../services/agentOrchestrator.js';
import type { SeverityRiskLevel } from '../services/agents/severityAdapter.js';

export const aiDoctorRouter = Router();

function sendError(
  response: Response,
  status: number,
  code: string,
  message: string,
  traceId: string,
  extra: Record<string, unknown> = {},
) {
  return response.status(status).json({
    ok: false,
    code,
    message,
    traceId,
    ...extra,
    },
  );
}

function requireAiDoctorAuth(
  request: AuthRequest,
  response: Response,
  next: NextFunction,
) {
  requireAuth(request, response, next);
}

function getUrgency(result: AgentOrchestrationResult): 'emergency' | 'urgent' | 'routine' | 'unknown' {
  if (result.emergency) return 'emergency';
  if (
    result.severity?.riskLevel === 'EMERGENCY' ||
    result.severity?.riskLevel === 'HIGH' ||
    result.safety?.escalationLevel === 'EMERGENCY_ESCALATION' ||
    result.safety?.escalationLevel === 'DOCTOR_REVIEW'
  ) {
    return 'urgent';
  }
  if (result.severity || result.safety) return 'routine';
  return 'unknown';
}

function getRiskLevel(level: SeverityRiskLevel): string {
  switch (level) {
    case 'LOW':
      return 'low';
    case 'MODERATE':
      return 'medium';
    case 'HIGH':
      return 'high';
    case 'EMERGENCY':
      return 'critical';
  }
}

function getSafetyFlags(result: AgentOrchestrationResult): string[] {
  const safety = result.safety;
  if (!safety) return [];
  return [
    ...(safety.emergency ? ['emergency_detected'] : []),
    ...(safety.escalationRequired ? ['escalation_required'] : []),
    ...(safety.hallucinationDetected ? ['hallucination_detected'] : []),
    ...(safety.consistencyFailed ? ['consistency_failed'] : []),
    ...(!safety.safe ? ['unsafe_output'] : []),
  ];
}

async function persistResult(
  consultationId: string,
  message: string,
  language: string,
  result: AgentOrchestrationResult,
) {
  const symptoms = result.symptom?.data.summary.primarySymptoms ?? [];
  const urgency = getUrgency(result);
  const severity = result.severity;
  const emergencyMessage = result.emergencyMessage ?? result.reply;

  await prisma.$transaction(async (transaction) => {
    await transaction.transcript.createMany({
      data: [
        { consultationId, speaker: 'patient', text: message, language },
        { consultationId, speaker: 'ai', text: result.reply, language },
      ],
    });

    if (symptoms.length > 0) {
      await transaction.symptom.createMany({
        data: symptoms.map((name) => ({
          consultationId,
          name,
          duration: result.symptom?.data.summary.duration,
          severity: result.symptom?.data.summary.severityHint,
        })),
      });
    }

    if (severity) {
      await transaction.riskAssessment.upsert({
        where: { consultationId },
        create: {
          consultationId,
          riskScore: severity.riskScore,
          level: getRiskLevel(severity.riskLevel),
          confidence: severity.confidence,
          details: severity.clinicalSummary,
        },
        update: {
          riskScore: severity.riskScore,
          level: getRiskLevel(severity.riskLevel),
          confidence: severity.confidence,
          details: severity.clinicalSummary,
        },
      });
    }

    for (const invocation of result.agentsInvoked) {
      await transaction.agentLog.create({
        data: {
          consultationId,
          agentName: invocation.agent,
          payload: JSON.stringify({
            ok: invocation.ok,
            latencyMs: invocation.latencyMs,
            ...(invocation.error ? { error: invocation.error } : {}),
          }),
        },
      });
    }

    if (result.emergency) {
      await transaction.emergencyEvent.create({
        data: {
          consultationId,
          type: result.emergencyType ?? 'emergency',
          message: emergencyMessage,
        },
      });
    }

    await transaction.consultation.update({
      where: { id: consultationId },
      data: {
        symptomsText: symptoms.length > 0 ? symptoms.join(', ') : undefined,
        severity: severity ? getRiskLevel(severity.riskLevel) : undefined,
        emergencyLevel: result.emergency ? 'emergency' : urgency,
      },
    });
  });
}

aiDoctorRouter.post(
  '/message',
  requireAiDoctorAuth,
  asyncHandler(async (request: AuthRequest, response: Response) => {
  const traceId = randomUUID();
  if (!request.user) {
    return sendError(response, 401, 'unauthenticated', 'Authentication required', traceId);
  }
  const body: unknown = request.body;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    typeof (body as Record<string, unknown>).consultationId !== 'string' ||
    !((body as Record<string, unknown>).consultationId as string).trim() ||
    typeof (body as Record<string, unknown>).message !== 'string' ||
    ((body as Record<string, unknown>).message as string).trim().length < 1 ||
    ((body as Record<string, unknown>).message as string).length > 2000 ||
    ((body as Record<string, unknown>).language !== undefined &&
      (typeof (body as Record<string, unknown>).language !== 'string' ||
        ((body as Record<string, unknown>).language as string).trim().length === 0 ||
        ((body as Record<string, unknown>).language as string).length > 35))
  ) {
    return sendError(response, 400, 'invalid_input', 'Invalid request body', traceId);
  }

  const input = body as {
    consultationId: string;
    message: string;
    language?: string;
  };
  const userId = request.user?.sub;
  if (typeof userId !== 'string' || userId.length === 0) {
    return sendError(response, 401, 'unauthenticated', 'Authentication required', traceId);
  }

  try {
    const consultation = await prisma.consultation.findFirst({
      where: { id: input.consultationId, userId },
      include: {
        transcripts: {
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: { speaker: true, text: true },
        },
      },
    });
    if (!consultation) {
      return sendError(
        response,
        404,
        'consultation_not_found',
        'Consultation not found',
        traceId,
      );
    }

    const language = input.language?.trim() || consultation.language || 'en';
    const preScreen = emergencyPreScreen(input.message);
    let result: AgentOrchestrationResult;
    try {
      result = await orchestrateAgents({
        sessionId: consultation.id,
        message: input.message,
        language,
        history: consultation.transcripts.reverse(),
      });
    } catch {
      return sendError(
        response,
        502,
        'ai_unavailable',
        'AI service is temporarily unavailable',
        traceId,
        { emergency: preScreen },
      );
    }

    if (
      !preScreen.detected &&
      result.degraded &&
      result.agentsInvoked.length > 0 &&
      result.agentsInvoked.every((agent) => !agent.ok)
    ) {
      return sendError(
        response,
        502,
        'ai_unavailable',
        'AI service is temporarily unavailable',
        traceId,
        { emergency: preScreen },
      );
    }

    await persistResult(consultation.id, input.message, language, result);

    const urgency = getUrgency(result);
    const hospitals = await getHospitalRecommendations(urgency);
    const nextAction =
      urgency === 'emergency'
        ? 'seek-emergency-care'
        : urgency === 'urgent'
          ? 'consider-appointment'
          : 'continue';
    const symptoms = (result.symptom?.data.summary.primarySymptoms ?? []).map((name) => ({
      name,
      ...(result.symptom?.data.summary.duration
        ? { duration: result.symptom.data.summary.duration }
        : {}),
      ...(result.symptom?.data.summary.severityHint
        ? { severity: result.symptom.data.summary.severityHint }
        : {}),
    }));

    return response.json({
      ok: true,
      traceId,
      consultationId: consultation.id,
      reply: result.reply,
      urgency,
      emergency: {
        detected: result.emergency,
        ...(result.emergencyMessage ? { message: result.emergencyMessage } : {}),
      },
      symptoms,
      severity: result.severity
        ? {
            level: result.severity.riskLevel,
            score: result.severity.riskScore,
            confidence: result.severity.confidence,
          }
        : null,
      safety: {
        flags: getSafetyFlags(result),
        disclaimerShown: true,
      },
      ...(result.followUpQuestion ? { followUpQuestion: result.followUpQuestion } : {}),
      ...(hospitals ? { hospitals } : {}),
      nextAction,
      agentsInvoked: result.agentsInvoked,
      degraded: result.degraded,
    });
  } catch {
    return sendError(
      response,
      500,
      'internal_error',
      'Unable to process this message',
      traceId,
    );
  }
  }),
);
