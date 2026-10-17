import { Router } from 'express';
import {
  startConsultation,
  endConsultation,
  listSessions,
  getSession,
  getSessionMessages,
} from '../controllers/consultationController.js';
import { requireAuth } from '../middleware/auth.js';

export const consultationRouter = Router();

consultationRouter.post('/start', requireAuth, startConsultation);
consultationRouter.post('/end', requireAuth, endConsultation);
consultationRouter.get('/', requireAuth, listSessions);
consultationRouter.get('/:id/messages', requireAuth, getSessionMessages);
consultationRouter.get('/:id', requireAuth, getSession);
