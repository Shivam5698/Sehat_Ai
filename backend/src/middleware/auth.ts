import { Request, Response, NextFunction, type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { prisma } from '../database/client.js';
import {
  createGuestSessionId,
  getAccessToken,
  getGuestSessionId,
  setGuestSessionCookie,
} from './authCookies.js';

export interface AuthRequest extends Request {
  user?: { sub: string; role: string; sid: string };
  guestSessionId?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = getAccessToken(req);
  if (!token) return res.status(401).json({ ok: false, message: 'Missing token' });

  let payload: jwt.JwtPayload;
  try {
    const verified = jwt.verify(token, config.jwtSecret);
    if (typeof verified === 'string') throw new Error('Invalid token payload');
    payload = verified;
  } catch {
    return res.status(401).json({ ok: false, message: 'Invalid token' });
  }

  if (
    typeof payload.sub !== 'string' ||
    typeof payload.sid !== 'string' ||
    typeof payload.role !== 'string'
  ) {
    return res.status(401).json({ ok: false, message: 'Invalid token' });
  }

  try {
    const sessions = await prisma.$queryRaw<
      Array<{ userId: string; expiresAt: Date; revokedAt: Date | null }>
    >`
      SELECT "userId", "expiresAt", "revokedAt"
      FROM "AuthSession"
      WHERE "id" = ${payload.sid}
      LIMIT 1
    `;
    const session = sessions[0];
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      return res.status(401).json({ ok: false, message: 'Invalid token' });
    }
  } catch (error) {
    console.error('Authentication session lookup failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return res.status(503).json({ ok: false, message: 'Authentication service unavailable' });
  }

  req.user = { sub: payload.sub, role: payload.role, sid: payload.sid };
  next();
}

export function requireConsultationAccess(createGuestSession = false): RequestHandler {
  return (req, res, next) => {
    const authRequest = req as AuthRequest;
    if (getAccessToken(req)) {
      void requireAuth(authRequest, res, next);
      return;
    }

    let guestSessionId = getGuestSessionId(req);
    if (!guestSessionId && createGuestSession) {
      guestSessionId = createGuestSessionId();
      setGuestSessionCookie(res, guestSessionId);
    }
    if (!guestSessionId) {
      res.status(401).json({ ok: false, message: 'Consultation session required' });
      return;
    }
    authRequest.guestSessionId = guestSessionId;
    next();
  };
}
