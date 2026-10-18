import { Router } from 'express';
import { signup, login, refreshToken, logout, currentSession } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

authRouter.post('/signup', signup);
authRouter.post('/login', login);
authRouter.post('/refresh', refreshToken);
authRouter.get('/session', requireAuth, currentSession);
authRouter.post('/logout', requireAuth, logout);
