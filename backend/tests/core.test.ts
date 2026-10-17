import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL = 'file:./test.db';
process.env.NODE_ENV = 'development';

const [{ signup }, { requireAuth }, { getSession }, { prisma }, { orchestrateAgents }] =
  await Promise.all([
    import('../src/controllers/authController.js'),
    import('../src/middleware/auth.js'),
    import('../src/controllers/consultationController.js'),
    import('../src/database/client.js'),
    import('../src/services/agentOrchestrator.js'),
  ]);

function responseMock() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

test('signup validation returns 400 with field errors', async () => {
  const response = responseMock();

  await signup(
    { body: { email: 'not-an-email', password: 'short', name: '' } } as never,
    response as never,
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(
    Object.keys((response.body as { fields: Record<string, string> }).fields)
      .sort(),
    ['email', 'name', 'password'],
  );
});

test('missing authorization token returns 401', () => {
  const response = responseMock();
  let nextCalled = false;

  requireAuth(
    { headers: {} } as never,
    response as never,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(response.statusCode, 401);
  assert.equal(nextCalled, false);
  assert.deepEqual(response.body, { ok: false, message: 'Missing token' });
});

test('consultation owned by another user returns 404', async (context) => {
  let lookup: unknown;
  const delegate = prisma.consultation as unknown as {
    findFirst: (args: unknown) => Promise<unknown>;
  };
  const originalFindFirst = delegate.findFirst;
  delegate.findFirst = async (args: unknown) => {
    lookup = args;
    return null;
  };
  const response = responseMock();

  try {
    await getSession(
      {
        params: { id: 'consultation-1' },
        user: { sub: 'different-user' },
      } as never,
      response as never,
    );
  } finally {
    delegate.findFirst = originalFindFirst;
  }

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, {
    ok: false,
    message: 'Consultation not found',
  });
  assert.deepEqual(lookup, {
    where: { id: 'consultation-1', userId: 'different-user' },
    include: { transcripts: true, reports: true, agentLogs: true },
  });
});

test('emergency prescreen responds without invoking agents', async () => {
  const failingAdapter = async () => {
    throw new Error('Agent must not run for a prescreened emergency');
  };
  const result = await orchestrateAgents(
    {
      sessionId: 'consultation-emergency',
      message: 'I have chest pain and difficulty breathing',
      language: 'en',
    },
    {
      analyzeSymptoms: failingAdapter,
      analyzeSeverity: failingAdapter,
      evaluateSafety: failingAdapter,
    },
  );

  assert.equal(result.emergency, true);
  assert.equal(result.degraded, false);
  assert.deepEqual(result.agentsInvoked, []);
});

test('orchestrator marks degraded when an adapter fails', async () => {
  const result = await orchestrateAgents(
    {
      sessionId: 'consultation-failure',
      message: 'I have had a mild headache since yesterday',
      language: 'en',
    },
    {
      analyzeSymptoms: async () => ({ ok: false, error: 'unavailable' }),
      analyzeSeverity: async () => {
        throw new Error('Severity adapter should not run');
      },
      evaluateSafety: async () => {
        throw new Error('Safety adapter should not run');
      },
    },
  );

  assert.equal(result.degraded, true);
  assert.deepEqual(result.agentsInvoked, [
    {
      agent: 'symptom',
      ok: false,
      latencyMs: result.agentsInvoked[0].latencyMs,
      error: 'unavailable',
    },
  ]);
});
