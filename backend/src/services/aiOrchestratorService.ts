import axios from 'axios';
import { ConversationContext, Symptom, RiskAssessment } from '../types/consultation.js';
import { prisma } from '../database/client.js';
import { orchestrateAgents } from './agentOrchestrator.js';
import type { SeverityRiskLevel } from './agents/severityAdapter.js';

export interface AgentResponse {
  agent: string;
  confidence: number;
  data: any;
  timestamp: Date;
}

export interface OrchestrationResult {
  symptoms: Symptom[];
  riskAssessment?: RiskAssessment;
  safetyIssues?: string[];
  recommendations?: string[];
  nextAction?: string;
  shouldEscalate?: boolean;
  emergencyMessage?: string;
}

export class AIOrchestratorService {
  private aiServiceUrl: string;

  constructor(aiServiceUrl: string = 'http://localhost:8000') {
    this.aiServiceUrl = aiServiceUrl.replace(/\/$/, '');
  }

  async orchestrateConsultation(context: ConversationContext): Promise<OrchestrationResult> {
    const patientTurn = [...context.history]
      .reverse()
      .find((entry) => entry.speaker === 'patient');
    if (!patientTurn) {
      throw new Error('No patient message is available for orchestration');
    }
    const result = await orchestrateAgents({
      sessionId: context.consultationId,
      message: patientTurn.text,
      language: context.language,
      history: context.history
        .filter((entry) => entry !== patientTurn)
        .slice(-6)
        .map((entry) => ({ speaker: entry.speaker, text: entry.text })),
    });
    const symptoms: Symptom[] =
      result.symptom?.data.summary.primarySymptoms.map((name) => ({
        id: '',
        name,
        duration: result.symptom?.data.summary.duration,
        severity: result.symptom?.data.summary.severityHint,
      })) ?? [];

    return {
      symptoms,
      ...(result.severity
        ? {
            riskAssessment: {
              riskScore: result.severity.riskScore,
              level: this.toRiskLevel(result.severity.riskLevel),
              confidence: result.severity.confidence,
              details: result.severity.clinicalSummary,
            },
          }
        : {}),
      safetyIssues: result.safety?.safetyWarnings ?? [],
      recommendations: result.safety?.approvedRecommendations ?? [],
      nextAction: result.emergency
        ? 'seek-emergency-care'
        : 'continue',
      shouldEscalate: result.emergency || result.safety?.escalationRequired === true,
      emergencyMessage: result.emergencyMessage,
    };
  }

  private toRiskLevel(level: SeverityRiskLevel): RiskAssessment['level'] {
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

  async generateReport(consultationId: string): Promise<string> {
    try {
      const consultation = await prisma.consultation.findUnique({
        where: { id: consultationId },
        include: {
          transcripts: true,
          symptoms: true,
          risk: true,
          reports: true,
        },
      });

      if (!consultation) throw new Error('Consultation not found');

      const response = await axios.post(`${this.aiServiceUrl}/agents/report`, {
        consultationId,
        consultation: JSON.stringify(consultation),
      });

      return response.data.report || '';
    } catch (error) {
      console.error('Report Generation Error:', error);
      throw error;
    }
  }

  async translateText(text: string, language: string): Promise<string> {
    try {
      const response = await axios.post(`${this.aiServiceUrl}/agents/translate`, {
        text,
        language,
      });

      return response.data.translatedText || text;
    } catch (error) {
      console.error('Translation Error:', error);
      return text;
    }
  }
}
