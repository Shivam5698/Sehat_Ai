import { Router } from 'express';
import { startConsultation, endConsultation, listSessions, getSession } from '../controllers/consultationController.js';
import { requireAuth, requireConsultationAccess } from '../middleware/auth.js';

export const consultationRouter = Router();

consultationRouter.post('/start', requireConsultationAccess(true), startConsultation);
consultationRouter.post('/end', requireConsultationAccess(), endConsultation);
consultationRouter.get('/', requireAuth, listSessions);
consultationRouter.get('/:id', requireAuth, getSession);
