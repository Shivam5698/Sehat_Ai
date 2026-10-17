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
  onUnauthorized?: (response: Response) => void,
) {
  const unauthorized = (message: string) => {
    if (onUnauthorized) return onUnauthorized(res);
    return res.status(401).json({ ok: false, message });
  };
  const auth = req.headers.authorization;
  if (!auth) return unauthorized('Missing token');
  const token = auth.replace('Bearer ', '');
  try {
    const payload: any = jwt.verify(token, config.jwtSecret);
    req.user = payload;
    next();
  } catch {
    unauthorized('Invalid token');
  }
}
