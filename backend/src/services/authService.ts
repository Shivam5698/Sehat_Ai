import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../database/client.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

const ACCESS_EXPIRES = '15m';
const REFRESH_EXPIRES = '7d';
const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

export function createAuthSession(user: AuthUser, sessionId = randomUUID()) {
  return {
    sessionId,
    accessToken: jwt.sign({ sub: user.id, role: user.role, sid: sessionId }, config.jwtSecret, { expiresIn: ACCESS_EXPIRES }),
    refreshToken: jwt.sign({ sub: user.id, sid: sessionId }, config.jwtRefreshSecret, { expiresIn: REFRESH_EXPIRES }),
    user: { id: user.id, email: user.email, name: user.name },
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sameHash(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeEmail(email: unknown): string {
  if (typeof email !== 'string') throw new AuthError('A valid email is required', 400);
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AuthError('A valid email is required', 400);
  }
  return normalized;
}

function validatePassword(password: unknown): asserts password is string {
  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new AuthError('Password must be between 8 and 72 bytes', 400);
  }
}

async function persistSession(
  client: Pick<Prisma.TransactionClient, '$executeRaw'>,
  user: AuthUser,
) {
  const session = createAuthSession(user);
  await client.$executeRaw`
    INSERT INTO "AuthSession" ("id", "userId", "refreshTokenHash", "expiresAt")
    VALUES (
      ${session.sessionId},
      ${user.id},
      ${hashToken(session.refreshToken)},
      ${new Date(Date.now() + REFRESH_EXPIRES_MS)}
    )
  `;
  const { sessionId: _sessionId, ...publicSession } = session;
  return publicSession;
}

export const AuthService = {
  async signup(data: unknown) {
    const body = isRecord(data) ? data : {};
    const email = normalizeEmail(body.email);
    validatePassword(body.password);
    const name =
      body.name === undefined
        ? undefined
        : typeof body.name === 'string' && body.name.trim()
          ? body.name.trim().slice(0, 100)
          : undefined;
    const passwordHash = await bcrypt.hash(body.password, 10);

    try {
      return await prisma.$transaction(async (transaction) => {
        const existing = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "User" WHERE lower("email") = lower(${email}) LIMIT 1
        `;
        if (existing.length > 0) throw new AuthError('Email already in use', 409);
        const user = await transaction.user.create({
          data: { email, password: passwordHash, name },
        });
        return persistSession(transaction, user);
      });
    } catch (error) {
      if (error instanceof AuthError) throw error;
      if (isRecord(error) && error.code === 'P2002') {
        throw new AuthError('Email already in use', 409);
      }
      throw error;
    }
  },

  async login(emailInput: unknown, passwordInput: unknown) {
    const email = normalizeEmail(emailInput);
    validatePassword(passwordInput);
    const users = await prisma.$queryRaw<
      Array<AuthUser & { password: string }>
    >`
      SELECT "id", "email", "name", "role", "password"
      FROM "User"
      WHERE lower("email") = lower(${email})
      LIMIT 1
    `;
    const user = users[0];
    if (!user || !(await bcrypt.compare(passwordInput, user.password))) {
      throw new AuthError('Invalid credentials', 401);
    }
    return persistSession(prisma, user);
  },

  async refresh(refreshToken: string) {
    let payload: jwt.JwtPayload;
    try {
      const verified = jwt.verify(refreshToken, config.jwtRefreshSecret);
      if (typeof verified === 'string') throw new Error('Invalid token payload');
      payload = verified;
    } catch {
      throw new AuthError('Invalid refresh token', 401);
    }
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new AuthError('Invalid refresh token', 401);
    }

    const sessions = await prisma.$queryRaw<
      Array<{
        id: string;
        userId: string;
        refreshTokenHash: string;
        expiresAt: Date;
        revokedAt: Date | null;
      }>
    >`
      SELECT "id", "userId", "refreshTokenHash", "expiresAt", "revokedAt"
      FROM "AuthSession"
      WHERE "id" = ${payload.sid}
      LIMIT 1
    `;
    const session = sessions[0];
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      !sameHash(session.refreshTokenHash, hashToken(refreshToken))
    ) {
      throw new AuthError('Invalid refresh token', 401);
    }
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) throw new AuthError('Invalid refresh token', 401);
    return {
      accessToken: jwt.sign(
        { sub: user.id, role: user.role, sid: session.id },
        config.jwtSecret,
        { expiresIn: ACCESS_EXPIRES },
      ),
    }
  },

  async logout(userId: string, sessionId: string) {
    const count = await prisma.$executeRaw`
      UPDATE "AuthSession"
      SET "revokedAt" = ${new Date()}
      WHERE "id" = ${sessionId} AND "userId" = ${userId} AND "revokedAt" IS NULL
    `;
    return count === 1;
  },

  async getSessionUser(userId: string) {
    const users = await prisma.$queryRaw<
      Array<{ id: string; email: string; name: string | null }>
    >`
      SELECT "id", "email", "name"
      FROM "User"
      WHERE "id" = ${userId}
      LIMIT 1
    `;
    const user = users[0];
    if (!user) throw new AuthError('Invalid session', 401);
    return user;
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
