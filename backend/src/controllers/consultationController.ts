import { Request, Response } from 'express';
import { prisma } from '../database/client.js';
import type { AuthRequest } from '../middleware/auth.js';

export async function startConsultation(req: Request, res: Response) {
  const { user, guestSessionId } = req as AuthRequest;
  const { language } = req.body || { language: 'en' };
  if (!user && !guestSessionId) {
    return res.status(401).json({ ok: false, message: 'Consultation session required' });
  }
  const session = await prisma.consultation.create({
    data: {
      userId: user?.sub,
      guestSessionId: user ? undefined : guestSessionId,
      language,
      status: 'started',
      startedAt: new Date(),
    },
  });
  res.json({ ok: true, session });
}

export async function endConsultation(req: Request, res: Response) {
  const { user, guestSessionId } = req as AuthRequest;
  const { consultationId } = req.body;
  if (!consultationId) return res.status(400).json({ ok: false, message: 'Missing consultationId' });
  const existing = await prisma.consultation.findUnique({
    where: { id: consultationId },
    select: { userId: true, guestSessionId: true },
  });
  if (
    !existing ||
    (user ? existing.userId !== user.sub : existing.guestSessionId !== guestSessionId)
  ) {
    return res.status(403).json({ ok: false, message: 'Unauthorized' });
  }
  const session = await prisma.consultation.update({ where: { id: consultationId }, data: { status: 'ended', endedAt: new Date() } });
  res.json({ ok: true, session });
}

export async function listSessions(req: Request, res: Response) {
  const userId = (req as any).user.sub;
  const sessions = await prisma.consultation.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  res.json({ ok: true, sessions });
}

export async function getSession(req: Request, res: Response) {
  const userId = (req as any).user?.sub;
  const { id } = req.params;
  const session = await prisma.consultation.findUnique({ where: { id }, include: { transcripts: true, reports: true, agentLogs: true } });
  if (!session || session.userId !== userId) {
    return res.status(403).json({ ok: false, message: 'Unauthorized' });
  }
  res.json({ ok: true, session });
}
