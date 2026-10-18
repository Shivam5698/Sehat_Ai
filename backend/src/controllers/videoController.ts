import { Request, Response, type RequestHandler } from 'express';
import { prisma } from '../database/client.js';
import { AIGatewayService } from '../integrations/ai-gateway/aiGateway.service.js';
import { v4 as uuidv4 } from 'uuid';
import { VideoSessionManager } from '../video/session-manager/sessionManager.js';
import { createTranscriptController } from './transcriptController.js';
import { createAvatarUnavailableHandler } from './avatarFallbackController.js';

const aiGatewayService = new AIGatewayService();
const videoSessionManager = new VideoSessionManager();
const avatarSessionUnavailable = createAvatarUnavailableHandler(
  'Avatar session management is unavailable until the provider integration is verified.',
);
const avatarSpeechUnavailable = createAvatarUnavailableHandler(
  'Avatar speech is unavailable until approved response text can be enforced.',
);
const avatarUnavailable = createAvatarUnavailableHandler(
  'Avatar unavailable until an approved-response integration is verified.',
);

export const initializeVideoSession: RequestHandler = avatarUnavailable;

export const startVideoStream: RequestHandler = avatarUnavailable;

export async function joinVideoSession(req: Request, res: Response) {
  try {
    const userId = (req as any).user.sub;
    const { consultationId, socketId } = req.body;

    if (!consultationId || !socketId) {
      return res.status(400).json({ ok: false, message: 'Missing consultationId or socketId' });
    }

    const session = await videoSessionManager.getSession(consultationId);
    if (!session || session.userId !== userId) {
      return res.status(403).json({ ok: false, message: 'Unauthorized' });
    }
    const participants = await videoSessionManager.joinSession(consultationId, socketId);
    res.json({ ok: true, consultationId, participants });
  } catch (error) {
    console.error('Join video session error:', error);
    res.status(500).json({ ok: false, message: 'Failed to join video session', error: (error as Error).message });
  }
}

export async function leaveVideoSession(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub;
    const { consultationId, socketId } = req.body;

    if (!consultationId || !socketId) {
      return res.status(400).json({ ok: false, message: 'Missing consultationId or socketId' });
    }

    const session = await videoSessionManager.getSession(consultationId);
    if (!session || session.userId !== userId) {
      return res.status(403).json({ ok: false, message: 'Unauthorized' });
    }
    const participants = await videoSessionManager.leaveSession(consultationId, socketId);
    res.json({ ok: true, consultationId, participants });
  } catch (error) {
    console.error('Leave video session error:', error);
    res.status(500).json({ ok: false, message: 'Failed to leave video session', error: (error as Error).message });
  }
}

export async function reconnectVideoSession(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub;
    const { consultationId, socketId } = req.body;

    if (!consultationId || !socketId) {
      return res.status(400).json({ ok: false, message: 'Missing consultationId or socketId' });
    }

    const session = await videoSessionManager.getSession(consultationId);
    if (!session || session.userId !== userId) {
      return res.status(403).json({ ok: false, message: 'Unauthorized' });
    }
    const participants = await videoSessionManager.reconnectSession(consultationId, socketId);
    res.json({ ok: true, consultationId, participants });
  } catch (error) {
    console.error('Reconnect video session error:', error);
    res.status(500).json({ ok: false, message: 'Failed to reconnect video session', error: (error as Error).message });
  }
}

export const endVideoSession: RequestHandler = avatarSessionUnavailable;

export const getVideoSessionStatus: RequestHandler = avatarSessionUnavailable;

export async function listSessionParticipants(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ ok: false, message: 'Missing sessionId' });
    }

    const session = await videoSessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ ok: false, message: 'Session not found' });
    }
    if (session.userId !== userId) {
      return res.status(403).json({ ok: false, message: 'Unauthorized' });
    }

    res.json({ ok: true, participants: session.participants });
  } catch (error) {
    console.error('List session participants error:', error);
    res.status(500).json({ ok: false, message: 'Failed to list session participants', error: (error as Error).message });
  }
}

export const avatarSpeak: RequestHandler = avatarSpeechUnavailable;

export const listAvailableAvatars: RequestHandler = avatarUnavailable;

export const sendVideoTranscript = createTranscriptController({
  findConsultation: (consultationId) =>
    prisma.consultation.findUnique({ where: { id: consultationId } }),
  persistPatientTranscript: async (consultationId, transcript, language) => {
    await prisma.transcript.create({
      data: { consultationId, speaker: 'patient', text: transcript, language },
    });
  },
  sendTranscript: (consultationId, transcript, language, history) =>
    aiGatewayService.sendTranscript(consultationId, transcript, language, history),
  failureMessage: 'Consultation response unavailable. No validated assessment was returned.',
});

export const avatarRespond: RequestHandler = avatarSpeechUnavailable;

export const pauseVideoSession: RequestHandler = avatarSessionUnavailable;

export const resumeVideoSession: RequestHandler = avatarSessionUnavailable;
