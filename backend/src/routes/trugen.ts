import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createAvatarUnavailableHandler } from '../controllers/avatarFallbackController.js';

export const trugenRouter = Router();

const avatarUnavailable = createAvatarUnavailableHandler(
  'Avatar integration is unavailable until an approved-response flow is verified.',
);

trugenRouter.post('/session', requireAuth, avatarUnavailable);
trugenRouter.post('/stream', requireAuth, avatarUnavailable);
trugenRouter.post('/speak', requireAuth, avatarUnavailable);
