import axios from 'axios';
import { ConversationContext } from '../types/consultation.js';
import { prisma } from '../database/client.js';
import {
  AIServiceUnavailableError,
  createSafeAgentLogPayload,
  InvalidAIResponseError,
  safeErrorName,
  validateAndMapWorkflowResult,
  type OrchestrationResult,
} from './aiResponseBoundary.js';

export type ProcessRequest = {
  sessionId: string;
  conversationId: string;
  language: string;
  input: string;
  metadata: {
    conversationHistory: Array<{
      speaker: 'patient' | 'ai' | 'system';
      text: string;
      timestamp: Date;
    }>;
  };
};

type ProcessPost = (
  url: string,
  payload: ProcessRequest,
  options: { timeout: number },
) => Promise<{ data: unknown }>;

export interface AgentResponse {
  agent: string;
  confidence: number;
  data: any;
  timestamp: Date;
}

export type { OrchestrationResult } from './aiResponseBoundary.js';

export class AIOrchestratorService {
  private aiServiceUrl: string;
  private agentResponses: Map<string, AgentResponse[]> = new Map();
  private readonly post: ProcessPost;

  constructor(aiServiceUrl: string = 'http://localhost:8000', post?: ProcessPost) {
    this.aiServiceUrl = aiServiceUrl.replace(/\/$/, '');
    this.post = post ?? ((url, payload, options) => axios.post<unknown>(url, payload, options));
  }

  async orchestrateConsultation(context: ConversationContext): Promise<OrchestrationResult> {
    try {
      const requestPayload = buildProcessRequest(context);

      const response = await this.post(`${this.aiServiceUrl}/process`, requestPayload, {
        timeout: 15000,
      });

      const workflowResult = response.data;
      await this.storeAgentLogs(context.consultationId, createSafeAgentLogPayload(workflowResult));
      return validateAndMapWorkflowResult(workflowResult);
    } catch (error) {
      console.error('Orchestration request failed', {
        errorName: safeErrorName(error),
      });
      if (axios.isAxiosError(error)) {
        if (error.response?.status === undefined || error.response.status >= 500) {
          throw new AIServiceUnavailableError();
        }
        throw new InvalidAIResponseError(false);
      }
      throw error;
    }
  }

  private async storeAgentLogs(consultationId: string, data: unknown): Promise<void> {
    try {
      await prisma.agentLog.create({
        data: {
          consultationId,
          agentName: 'orchestrator',
          payload: JSON.stringify(data),
        },
      });
    } catch (error) {
      console.error('Orchestration metadata persistence failed', {
        errorName: safeErrorName(error),
      });
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

export function buildProcessRequest(context: ConversationContext): ProcessRequest {
  return {
    sessionId: context.consultationId,
    conversationId: context.consultationId,
    language: context.language,
    input:
      context.history.length > 0
        ? context.history.map((entry) => `${entry.speaker}: ${entry.text}`).join('\n')
        : context.consultationId,
    metadata: {
      conversationHistory: context.history.map((entry) => ({
        speaker: entry.speaker,
        text: entry.text,
        timestamp: entry.timestamp,
      })),
    },
  };
}
