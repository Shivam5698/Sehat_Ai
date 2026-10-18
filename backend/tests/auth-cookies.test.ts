import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { test } from 'node:test';
import {
  clearAuthCookies,
  getAccessToken,
  getCookieValue,
  getRefreshToken,
  setAuthCookies,
} from '../dist/middleware/authCookies.js';

test('authentication cookies are HttpOnly, same-site, and path-scoped', async () => {
  const app = express();
  app.get('/set', (_req, res) => {
    setAuthCookies(res, { accessToken: 'test-access', refreshToken: 'test-refresh' });
    res.status(204).end();
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/set`);
    const cookies = response.headers.get('set-cookie') ?? '';
    assert.match(
      cookies,
      /sehat_access=test-access; Max-Age=900; Path=\/api; Expires=.*?; HttpOnly; SameSite=Lax/,
    );
    assert.match(
      cookies,
      /sehat_refresh=test-refresh; Max-Age=604800; Path=\/api\/auth\/refresh; Expires=.*?; HttpOnly; SameSite=Lax/,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('authentication cookie parsing supports protected API and refresh requests', () => {
  const cookieHeader = 'theme=light; sehat_access=access.jwt; sehat_refresh=refresh.jwt';
  assert.equal(getCookieValue(cookieHeader, 'sehat_access'), 'access.jwt');
  const request = { headers: { cookie: cookieHeader } };
  assert.equal(getAccessToken(request), 'access.jwt');
  assert.equal(getRefreshToken(request), 'refresh.jwt');
  assert.equal(getCookieValue(cookieHeader, 'missing'), null);
  assert.equal(getCookieValue(undefined, 'sehat_access'), null);
});

test('logout clears both authentication cookie paths', async () => {
  const app = express();
  app.get('/clear', (_req, res) => {
    clearAuthCookies(res);
    res.status(204).end();
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/clear`);
    const cookies = response.headers.get('set-cookie') ?? '';
    assert.match(cookies, /sehat_access=; Path=\/api; Expires=/);
    assert.match(cookies, /sehat_refresh=; Path=\/api\/auth\/refresh; Expires=/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
