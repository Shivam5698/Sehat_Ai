import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export interface AuthRequest extends Request {
  user?: any;
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
