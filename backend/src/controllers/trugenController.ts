import { Request, Response } from 'express';
import axios from 'axios';
import { config } from '../config/index.js';
import { prisma } from '../database/client.js';
import { VideoSessionManager } from '../video/session-manager/sessionManager.js';

const videoSessionManager = new VideoSessionManager();

async function findOwnedConsultation(consultationId: string, userId: string) {
  return prisma.consultation.findFirst({
    where: { id: consultationId, userId },
  });
}

async function findOwnedTruGenSession(sessionId: string, userId: string) {
  const session = await videoSessionManager.getSessionByTruGenSessionId(sessionId);
  if (!session) return null;
  const consultation = await findOwnedConsultation(session.consultationId, userId);
  return consultation ? session : null;
}

function getUserId(req: Request): string | undefined {
  const userId = (req as Request & { user?: { sub?: unknown } }).user?.sub;
  return typeof userId === 'string' && userId.length > 0 ? userId : undefined;
}

export async function createTrugenSession(req: Request, res: Response) {
  // Create a TruGen session via their API
  const payload = req.body || {};
  const userId = getUserId(req);
  if (
    !userId ||
    typeof payload.consultationId !== 'string' ||
    !(await findOwnedConsultation(payload.consultationId, userId))
  ) {
    return res.status(404).json({ ok: false, message: 'Consultation not found' });
  }
  const r = await axios.post(`${config.trugen.baseUrl}/sessions`, payload, { headers: { Authorization: `Bearer ${config.trugen.apiKey}` } });
  if (typeof r.data?.id === 'string') {
    const consultation = await findOwnedConsultation(payload.consultationId, userId);
    if (consultation) {
      await videoSessionManager.createSession(
        consultation.id,
        userId,
        consultation.language || 'en',
        undefined,
        r.data.id,
      );
    }
  }
  res.json({ ok: true, session: r.data });
}

export async function streamAudio(req: Request, res: Response) {
  // Webhook-style proxy to TruGen audio ingest
  const { sessionId, chunk } = req.body;
  const userId = getUserId(req);
  if (
    !userId ||
    typeof sessionId !== 'string' ||
    !(await findOwnedTruGenSession(sessionId, userId))
  ) {
    return res.status(404).json({ ok: false, message: 'Consultation not found' });
  }
  const r = await axios.post(`${config.trugen.baseUrl}/sessions/${sessionId}/audio`, { chunk }, { headers: { Authorization: `Bearer ${config.trugen.apiKey}` } });
  res.json({ ok: true, result: r.data });
}

export async function avatarSpeak(req: Request, res: Response) {
  const { sessionId, text, lang } = req.body;
  const userId = getUserId(req);
  if (
    !userId ||
    typeof sessionId !== 'string' ||
    !(await findOwnedTruGenSession(sessionId, userId))
  ) {
    return res.status(404).json({ ok: false, message: 'Consultation not found' });
  }
  const r = await axios.post(`${config.trugen.baseUrl}/sessions/${sessionId}/speak`, { text, lang }, { headers: { Authorization: `Bearer ${config.trugen.apiKey}` } });
  res.json({ ok: true, result: r.data });
}
