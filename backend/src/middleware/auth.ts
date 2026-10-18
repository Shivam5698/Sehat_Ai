import { Request, Response, NextFunction } from 'express';
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
  user?: any;
  guestSessionId?: string;
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const unauthorized = (message: string) => {
    return res.status(401).json({
      ok: false,
      code: 'unauthenticated',
      message,
    });
  };
  const auth = req.headers.authorization;
  const match = typeof auth === 'string' ? /^Bearer\s+(\S+)$/i.exec(auth) : null;
  if (!match) return unauthorized('Missing or malformed authorization header');

  try {
    const payload = jwt.verify(match[1], config.jwtSecret);
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      return unauthorized('Invalid token');
    }
    req.user = payload;
    return next();
  } catch {
    return unauthorized('Invalid or expired token');
  }
}

export function requireConsultationAccess(allowGuestCreation = false) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = typeof req.user?.sub === 'string' ? req.user.sub : null;
    const guestSessionId = getGuestSessionId(req) ?? req.guestSessionId ?? null;
    const hasLoginCookie = typeof req.headers.cookie === 'string' && /(?:^|;\s*)sehat_access=/.test(req.headers.cookie);
    const hasGuestCookie = typeof req.headers.cookie === 'string' && /(?:^|;\s*)sehat_guest=/.test(req.headers.cookie);

    if (userId) {
      const consultationId = typeof req.body?.consultationId === 'string' ? req.body.consultationId : null;
      if (consultationId) {
        const consultation = await prisma.consultation.findFirst({
          where: { id: consultationId, userId },
        });

        if (!consultation) {
          return res.status(403).json({ ok: false, message: 'Unauthorized consultation access' });
        }
      }

      return next();
    }

    if (allowGuestCreation && !userId && !guestSessionId) {
      if (hasGuestCookie || hasLoginCookie) {
        return res.status(401).json({ ok: false, message: 'Authentication required' });
      }

      const createdGuestSessionId = createGuestSessionId();
      req.guestSessionId = createdGuestSessionId;
      setGuestSessionCookie(res, createdGuestSessionId);
      return next();
    }

    if (guestSessionId) {
      const consultationId = typeof req.body?.consultationId === 'string' ? req.body.consultationId : null;
      if (consultationId) {
        const consultation = await prisma.consultation.findFirst({
          where: { id: consultationId, guestSessionId },
        });

        if (!consultation) {
          return res.status(403).json({ ok: false, message: 'Unauthorized consultation access' });
        }
      }

      req.guestSessionId = guestSessionId;
      return next();
    }

    return res.status(401).json({ ok: false, message: 'Authentication required' });
  };
}
