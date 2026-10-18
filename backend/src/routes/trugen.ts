import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createTrugenSession,
  streamAudio,
  avatarSpeak,
} from '../controllers/trugenController.js';

export const trugenRouter = Router();

trugenRouter.post('/session', requireAuth, createTrugenSession);
trugenRouter.post('/stream', requireAuth, streamAudio);
trugenRouter.post('/speak', requireAuth, avatarSpeak);
