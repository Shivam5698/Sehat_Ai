import { AIOrchestratorService, OrchestrationResult } from '../../services/aiOrchestratorService.js';
import { config } from '../../config/index.js';
import { ConversationContext, TranscriptHistoryEntry } from '../../types/consultation.js';

export class AIGatewayService {
  private orchestrator = new AIOrchestratorService(config.aiServiceUrl);

  async sendTranscript(
    consultationId: string,
    transcript: string,
    language: string,
    history: TranscriptHistoryEntry[] = []
  ): Promise<OrchestrationResult> {
    const context: ConversationContext = {
      consultationId,
      language,
      symptoms: [],
      riskLevel: 'unknown',
      history:
        history.length > 0
          ? history.map((entry, index) => ({
              id: `history-${index + 1}`,
              speaker: entry.speaker,
              text: entry.text,
              language: entry.language || language,
              timestamp:
                entry.timestamp instanceof Date
                  ? entry.timestamp
                  : entry.timestamp
                    ? new Date(entry.timestamp)
                    : new Date(),
            }))
          : [
              {
                id: 'initial',
                speaker: 'patient',
                text: transcript,
                language,
                timestamp: new Date(),
              },
            ],
      metadata: {},
    };

    return this.orchestrator.orchestrateConsultation(context);
  }
}
