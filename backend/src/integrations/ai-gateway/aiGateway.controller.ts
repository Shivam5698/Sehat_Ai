import { AIGatewayService } from './aiGateway.service.js';
import { createTranscriptController } from '../../controllers/transcriptController.js';
import { prisma } from '../../database/client.js';

const aiGatewayService = new AIGatewayService();

export const sendTranscript = createTranscriptController({
  findConsultation: (consultationId) =>
    prisma.consultation.findUnique({ where: { id: consultationId } }),
  sendTranscript: (consultationId, transcript, language, history) =>
    aiGatewayService.sendTranscript(consultationId, transcript, language, history),
  failureMessage: 'Consultation response unavailable. No validated assessment was returned.',
});
