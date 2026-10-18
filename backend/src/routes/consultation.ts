import { Router, type RequestHandler } from 'express';
import {
  startConsultation,
  endConsultation,
  listSessions,
  getSession,
  getSessionMessages,
} from '../controllers/consultationController.js';
import { requireAuth } from '../middleware/auth.js';

export const consultationRouter = Router();

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    void Promise.resolve()
      .then(() => handler(request, response, next))
      .catch((error: unknown) => {
        console.error('Unhandled async route error:', error);
        if (response.headersSent) return next(error);
        return response.status(500).json({ ok: false });
      });
  };
}

consultationRouter.post('/start', requireAuth, asyncHandler(startConsultation));
consultationRouter.post('/end', requireAuth, asyncHandler(endConsultation));
consultationRouter.get('/', requireAuth, asyncHandler(listSessions));
consultationRouter.get('/:id/messages', requireAuth, asyncHandler(getSessionMessages));
consultationRouter.get('/:id', requireAuth, asyncHandler(getSession));
