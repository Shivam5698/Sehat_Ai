import axios, { AxiosError } from 'axios';
import { ConversationContext, RiskAssessment, Symptom } from '../types/consultation.js';
import { prisma } from '../database/client.js';
import { AIServiceUnavailableError, validateAndMapWorkflowResult } from './aiResponseBoundary.js';

export interface AgentResponse {
  agent: string;
  confidence: number;
  data: any;
  timestamp: Date;
}

export interface ProcessHistoryEntry {
  speaker: 'patient' | 'ai' | 'system';
  text: string;
  timestamp?: string;
}

export interface ProcessRequest {
  sessionId: string;
  conversationId: string;
  language: string;
  input: string;
  metadata: {
    conversationHistory: ProcessHistoryEntry[];
  };
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

export function buildProcessRequest(context: ConversationContext): ProcessRequest {
  const patientTurn = [...context.history].reverse().find((entry) => entry.speaker === 'patient');
  const conversationHistory = context.history.map((entry) => ({
    speaker: entry.speaker,
    text: entry.text,
    ...(entry.timestamp ? { timestamp: new Date(entry.timestamp).toISOString() } : {}),
  }));

  return {
    sessionId: context.consultationId,
    conversationId: context.consultationId,
    language: context.language,
    input: patientTurn ? `patient: ${patientTurn.text}` : '',
    metadata: {
      conversationHistory,
    },
  };
}

type ProcessRequestTransport = (
  url: string,
  payload: ProcessRequest,
  options: { timeout: number },
) => Promise<unknown>;

export class AIOrchestratorService {
  private aiServiceUrl: string;
  private readonly requestTransport: ProcessRequestTransport;

  constructor(aiServiceUrl: string = 'http://localhost:8000', requestTransport?: ProcessRequestTransport) {
    this.aiServiceUrl = aiServiceUrl.replace(/\/$/, '');
    this.requestTransport =
      requestTransport ??
      ((url, payload, options) =>
        axios.post(url, payload, {
          timeout: options.timeout,
        }));
  }

  async orchestrateConsultation(context: ConversationContext): Promise<OrchestrationResult> {
    const payload = buildProcessRequest(context);
    const url = `${this.aiServiceUrl}/process`;

    try {
      const rawResult = await this.requestTransport(url, payload, { timeout: 15000 });
      return validateAndMapWorkflowResult(rawResult);
    } catch (error) {
      if (error instanceof AIServiceUnavailableError) throw error;
      if (isUpstreamUnavailable(error)) throw new AIServiceUnavailableError();
      throw error;
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

function isUpstreamUnavailable(error: unknown): boolean {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    if (status === 503 || status === 504 || status === 429) return true;
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
      return true;
    }
    if (!error.response) return true;
  }

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
      return true;
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('timeout') || message.includes('timed out') || message.includes('network');
  }

  return false;
}
