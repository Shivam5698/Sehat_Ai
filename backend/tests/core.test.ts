import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import express from 'express';

process.env.DATABASE_URL = 'file:./test.db';
process.env.NODE_ENV = 'development';

const [
  { signup },
  { requireAuth },
  { getSession },
  { prisma },
  { orchestrateAgents },
  { consultationRouter },
  { emergencyPreScreen },
] = await Promise.all([
    import('../src/controllers/authController.js'),
    import('../src/middleware/auth.js'),
    import('../src/controllers/consultationController.js'),
    import('../src/database/client.js'),
    import('../src/services/agentOrchestrator.js'),
    import('../src/routes/consultation.js'),
    import('../src/services/emergencyPreScreen.js'),
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
  assert.deepEqual(response.body, {
    ok: false,
    code: 'unauthenticated',
    message: 'Missing or malformed authorization header',
  });
});

test('POST /api/consultation/start without a token returns 401', async () => {
  const app = express();
  app.use('/api/consultation', consultationRouter);
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    assert(address && typeof address !== 'string');
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/consultation/start`,
      { method: 'POST' },
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      ok: false,
      code: 'unauthenticated',
      message: 'Missing or malformed authorization header',
    });
  } finally {
    server.close();
    await once(server, 'close');
  }
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
  assert.match(result.reply, /^Call 112 now\./);
  assert.equal(result.reply.match(/Call 112 now/g)?.length, 1);
  assert.equal(
    result.reply.match(/This is not a diagnosis and is not a substitute for professional medical advice\./g)
      ?.length,
    1,
  );
  assert.match(result.reply, /Do not drive/);
  assert.match(result.reply, /not a substitute/);
  assert.match(result.reply, /emergency services now/);
  assert.match(result.emergencyMessage ?? '', /112/);
  assert.deepEqual(result.agentsInvoked, []);
});

test('emergency prescreen recognizes emergency phrases and rejects mild symptoms', async (context) => {
  const emergencies = [
    'chest pain and I cannot breathe',
    "I can't breathe",
    'I can’t breathe!',
    'cant breathe',
    'unable to breathe',
    'struggling to breathe',
    'trouble breathing',
    'difficulty breathing',
    'shortness of breath',
    'short of breath',
    'gasping',
    'chest pressure',
    'chest tightness',
    'face drooping',
    'slurred speech',
    'one side weak',
    'heavy bleeding',
    'unresponsive and not breathing',
    'overdose',
    'I want to die',
    'seene me dard',
    'saans nahi aa rahi',
  ];

  for (const phrase of emergencies) {
    await context.test(phrase, () => {
      assert.equal(emergencyPreScreen(phrase).detected, true);
    });
  }

  for (const phrase of ['cough and mild fever', 'mild headache', 'sore throat']) {
    await context.test(`${phrase} is not an emergency`, () => {
      assert.deepEqual(emergencyPreScreen(phrase), { detected: false });
    });
  }
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
