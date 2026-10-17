import { Router } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  signup,
  login,
  refreshToken,
  logout,
  me,
} from '../controllers/authController.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';

export const authRouter = Router();

const authenticate: RequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => requireAuth(request as AuthRequest, response, next);

authRouter.post('/signup', signup);
authRouter.post('/login', login);
authRouter.post('/refresh', refreshToken);
authRouter.post('/logout', logout);
authRouter.get('/me', authenticate, me);
