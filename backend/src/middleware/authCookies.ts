import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';

export const ACCESS_TOKEN_COOKIE = 'sehat_access';
export const REFRESH_TOKEN_COOKIE = 'sehat_refresh';
export const GUEST_SESSION_COOKIE = 'sehat_guest';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};

export function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0 || entry.slice(0, separator).trim() !== name) continue;
    return entry.slice(separator + 1).trim() || null;
  }
  return null;
}

export function getAccessToken(req: Pick<Request, 'headers'>): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
  return match?.[1] ?? getCookieValue(req.headers.cookie, ACCESS_TOKEN_COOKIE);
}

export function getRefreshToken(
  req: Pick<Request, 'headers'> & { body?: { refreshToken?: unknown } },
): string | null {
  return (
    getCookieValue(req.headers.cookie, REFRESH_TOKEN_COOKIE) ??
    (typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : null)
  );
}

export function getGuestSessionId(req: Pick<Request, 'headers'>): string | null {
  const guestSessionId = getCookieValue(req.headers.cookie, GUEST_SESSION_COOKIE);
  return guestSessionId && /^[a-f0-9]{64}$/.test(guestSessionId) ? guestSessionId : null;
}

export function createGuestSessionId(): string {
  return randomBytes(32).toString('hex');
}

export function setGuestSessionCookie(res: Response, guestSessionId: string): void {
  res.cookie(GUEST_SESSION_COOKIE, guestSessionId, {
    ...cookieOptions,
    path: '/api',
    maxAge: 24 * 60 * 60 * 1000,
  });
}

export function clearGuestSessionCookie(res: Response): void {
  res.clearCookie(GUEST_SESSION_COOKIE, { ...cookieOptions, path: '/api' });
}

export function setAccessTokenCookie(res: Response, accessToken: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...cookieOptions,
    path: '/api',
    maxAge: 15 * 60 * 1000,
  });
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void {
  setAccessTokenCookie(res, tokens.accessToken);
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...cookieOptions,
    path: '/api/auth/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...cookieOptions, path: '/api' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    ...cookieOptions,
    path: '/api/auth/refresh',
  });
}
