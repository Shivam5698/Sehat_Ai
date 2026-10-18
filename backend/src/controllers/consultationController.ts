import { Response } from 'express';
import { prisma } from '../database/client.js';
import type { AuthRequest } from '../middleware/auth.js';

function unauthenticated(res: Response) {
  return res.status(401).json({
    ok: false,
    code: 'unauthenticated',
    message: 'Authentication required',
  });
}

function internalError(res: Response) {
  return res.status(500).json({ ok: false });
}

export async function startConsultation(req: AuthRequest, res: Response) {
  if (!req.user) return unauthenticated(res);
  try {
    const userId = req.user.sub;
    const { language } = req.body || { language: 'en' };
    const session = await prisma.consultation.create({
      data: { userId, language, status: 'started', startedAt: new Date() },
    });
    return res.json({ ok: true, session });
  } catch (error) {
    console.error('Failed to start consultation:', error);
    return internalError(res);
  }
}

export async function endConsultation(req: AuthRequest, res: Response) {
  if (!req.user) return unauthenticated(res);
  try {
    const { consultationId } = req.body;
    if (!consultationId) {
      return res.status(400).json({ ok: false, message: 'Missing consultationId' });
    }

    const userId = req.user.sub;
    const session = await prisma.consultation.findFirst({
      where: { id: consultationId, userId },
    });
    if (!session) {
      return res.status(404).json({ ok: false, message: 'Consultation not found' });
    }

    await prisma.consultation.updateMany({
      where: { id: consultationId, userId, endedAt: null },
      data: { status: 'ended', endedAt: new Date() },
    });
    if (session.endedAt !== null) {
      await prisma.consultation.updateMany({
        where: { id: consultationId, userId },
        data: { status: 'ended' },
      });
    }
    const updatedSession = await prisma.consultation.findFirst({
      where: { id: consultationId, userId },
    });
    return res.json({ ok: true, session: updatedSession });
  } catch (error) {
    console.error('Failed to end consultation:', error);
    return internalError(res);
  }
}

export async function listSessions(req: AuthRequest, res: Response) {
  if (!req.user) return unauthenticated(res);
  try {
    const userId = req.user.sub;
    const sessions = await prisma.consultation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ ok: true, sessions });
  } catch (error) {
    console.error('Failed to list consultations:', error);
    return internalError(res);
  }
}

export async function getSession(req: AuthRequest, res: Response) {
  if (!req.user) return unauthenticated(res);
  try {
    const { id } = req.params;
    const session = await prisma.consultation.findFirst({
      where: { id, userId: req.user.sub },
      include: { transcripts: true, reports: true, agentLogs: true },
    });
    if (!session) {
      return res.status(404).json({ ok: false, message: 'Consultation not found' });
    }

    return res.json({ ok: true, session });
  } catch (error) {
    console.error('Failed to get consultation:', error);
    return internalError(res);
  }
}

export async function getSessionMessages(req: AuthRequest, res: Response) {
  if (!req.user) return unauthenticated(res);
  try {
    const { id } = req.params;
    const consultation = await prisma.consultation.findFirst({
      where: { id, userId: req.user.sub },
      select: { id: true },
    });
    if (!consultation) {
      return res.status(404).json({ ok: false, message: 'Consultation not found' });
    }

    const transcripts = await prisma.transcript.findMany({
      where: {
        consultationId: id,
        speaker: { in: ['patient', 'ai'] },
      },
      select: { id: true, speaker: true, text: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const messages = transcripts.map((transcript: {
      id: string;
      speaker: string;
      text: string;
      createdAt: Date;
    }) => ({
      ...transcript,
      speaker: transcript.speaker as 'patient' | 'ai',
    }));

    return res.json({ ok: true, messages });
  } catch (error) {
    console.error('Failed to get consultation messages:', error);
    return internalError(res);
  }
}
