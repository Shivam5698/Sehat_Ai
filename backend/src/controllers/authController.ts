import { Request, Response } from 'express';
import { AuthService } from '../services/authService.js';
import type { AuthRequest } from '../middleware/auth.js';

type AuthFields = Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateCredentials(
  body: unknown,
  includeName: boolean,
): { fields: AuthFields; email: string; password: string; name: string } {
  const fields: AuthFields = {};
  const data = isRecord(body) ? body : {};
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  const password = typeof data.password === 'string' ? data.password : '';
  const name = typeof data.name === 'string' ? data.name.trim() : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fields.email = 'Enter a valid email address.';
  }
  if (password.length < 8) {
    fields.password = 'Password must be at least 8 characters.';
  }
  if (
    includeName &&
    (typeof data.name !== 'string' || name.length < 2 || name.length > 100)
  ) {
    fields.name = 'Name must be between 2 and 100 characters.';
  }

  return { fields, email, password, name };
}

export async function signup(req: Request, res: Response) {
  const validated = validateCredentials(req.body, true);
  if (Object.keys(validated.fields).length > 0) {
    return res.status(400).json({
      ok: false,
      message: 'Please check the signup details.',
      fields: validated.fields,
    });
  }

  try {
    const user = await AuthService.signup({
      email: validated.email,
      password: validated.password,
      name: validated.name,
    });
    res.json({ ok: true, user });
  } catch (err: any) {
    res.status(400).json({ ok: false, message: err.message });
  }
}

export async function login(req: Request, res: Response) {
  const validated = validateCredentials(req.body, false);
  if (Object.keys(validated.fields).length > 0) {
    return res.status(400).json({
      ok: false,
      message: 'Please check the login details.',
      fields: validated.fields,
    });
  }

  try {
    const tokens = await AuthService.login(
      validated.email,
      validated.password,
    );
    res.json({ ok: true, ...tokens });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid credentials') {
      return res.status(401).json({ ok: false, message: 'Invalid credentials' });
    }
    return res.status(500).json({ ok: false, message: 'Unable to log in' });
  }
}

export async function me(req: AuthRequest, res: Response) {
  const userId = req.user?.sub;
  if (typeof userId !== 'string') {
    return res.status(401).json({ ok: false, message: 'Invalid token' });
  }

  try {
    const user = await AuthService.getCurrentUser(userId);
    if (!user) {
      return res.status(404).json({ ok: false, message: 'User not found' });
    }

    return res.json({ ok: true, user });
  } catch {
    return res.status(500).json({ ok: false, message: 'Unable to retrieve user' });
  }
}

export async function refreshToken(req: Request, res: Response) {
  try {
    const token = await AuthService.refresh(req.body.refreshToken);
    res.json({ ok: true, token });
  } catch (err: any) {
    res.status(401).json({ ok: false, message: err.message });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    await AuthService.logout(req.body.refreshToken);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ ok: false, message: err.message });
  }
}
