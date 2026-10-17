import { Request, Response } from 'express';
import { prisma } from '../database/client.js';
import { v4 as uuidv4 } from 'uuid';
import type { AuthRequest } from '../middleware/auth.js';

export async function startConsultation(req: Request, res: Response) {
  const userId = (req as any).user.sub;
  const { language } = req.body || { language: 'en' };
  const session = await prisma.consultation.create({ data: { userId, language, status: 'started', startedAt: new Date() } });
  res.json({ ok: true, session });
}

export async function endConsultation(req: AuthRequest, res: Response) {
  const { consultationId } = req.body;
  if (!consultationId) return res.status(400).json({ ok: false, message: 'Missing consultationId' });

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
}

export async function listSessions(req: Request, res: Response) {
  const userId = (req as any).user.sub;
  const sessions = await prisma.consultation.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  res.json({ ok: true, sessions });
}

export async function getSession(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const session = await prisma.consultation.findFirst({
    where: { id, userId: req.user.sub },
    include: { transcripts: true, reports: true, agentLogs: true },
  });
  if (!session) {
    return res.status(404).json({ ok: false, message: 'Consultation not found' });
  }

  res.json({ ok: true, session });
}

export async function getSessionMessages(req: AuthRequest, res: Response) {
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
  const messages = transcripts.map((transcript) => ({
    ...transcript,
    speaker: transcript.speaker as 'patient' | 'ai',
  }));

  return res.json({ ok: true, messages });
}
