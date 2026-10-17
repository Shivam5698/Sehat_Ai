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
  const result = await prisma.consultation.updateMany({
    where: { id: consultationId, userId },
    data: { status: 'ended', endedAt: new Date() },
  });
  if (result.count === 0) {
    return res.status(404).json({ ok: false, message: 'Consultation not found' });
  }

  const session = await prisma.consultation.findUnique({
    where: { id: consultationId },
  });
  res.json({ ok: true, session });
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
