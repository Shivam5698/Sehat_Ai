import { Request, Response } from 'express';
import { AuthError, AuthService } from '../services/authService.js';
import { AuthRequest } from '../middleware/auth.js';
import {
  clearAuthCookies,
  getRefreshToken,
  setAccessTokenCookie,
  setAuthCookies,
} from '../middleware/authCookies.js';

export async function signup(req: Request, res: Response) {
  try {
    const session = await AuthService.signup(req.body);
    setAuthCookies(res, session);
    return res.json({ ok: true, user: session.user });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ ok: false, message: error.message });
    }
    console.error('Signup failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return res.status(500).json({ ok: false, message: 'Unable to create account' });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const session = await AuthService.login(req.body?.email, req.body?.password);
    setAuthCookies(res, session);
    return res.json({ ok: true, user: session.user });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ ok: false, message: error.message });
    }
    console.error('Login failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return res.status(500).json({ ok: false, message: 'Unable to sign in' });
  }
}

export async function refreshToken(req: Request, res: Response) {
  try {
    const refreshToken = getRefreshToken(req);
    if (!refreshToken) {
      clearAuthCookies(res);
      return res.status(401).json({ ok: false, message: 'Invalid refresh token' });
    }
    const token = await AuthService.refresh(refreshToken);
    setAccessTokenCookie(res, token.accessToken);
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.status === 401) clearAuthCookies(res);
      return res.status(error.status).json({ ok: false, message: error.message });
    }
    console.error('Token refresh failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return res.status(503).json({ ok: false, message: 'Authentication service unavailable' });
  }
}

export async function logout(req: Request, res: Response) {
  const user = (req as AuthRequest).user;
  if (!user) return res.status(401).json({ ok: false, message: 'Authentication required' });
  try {
    const revoked = await AuthService.logout(user.sub, user.sid);
    if (!revoked) return res.status(401).json({ ok: false, message: 'Invalid session' });
    clearAuthCookies(res);
    return res.json({ ok: true });
  } catch (error) {
    console.error('Logout failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return res.status(503).json({ ok: false, message: 'Unable to end session' });
  }
}

export async function currentSession(req: Request, res: Response) {
  const user = (req as AuthRequest).user;
  if (!user) return res.status(401).json({ ok: false, message: 'Authentication required' });
  try {
    const currentUser = await AuthService.getSessionUser(user.sub);
    return res.json({ ok: true, user: currentUser });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ ok: false, message: error.message });
    }
    console.error('Session lookup failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return res.status(503).json({ ok: false, message: 'Authentication service unavailable' });
  }
}
