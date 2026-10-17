import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { SymptomAnalysis } from '../src/services/agents/symptomAdapter.js';
import type { SeverityAnalysis } from '../src/services/agents/severityAdapter.js';
import type { SafetyAnalysis } from '../src/services/agents/safetyAdapter.js';

process.env.DATABASE_URL = 'file:./test.db';
process.env.NODE_ENV = 'development';
process.env.OPENAI_API_KEY = 'test-key';

const [
  { signup },
  { requireAuth },
  { getSession },
  { prisma },
  { orchestrateAgents },
  { consultationRouter },
  { emergencyPreScreen },
  { analyzeSymptoms },
  { analyzeSeverity },
  { evaluateSafety },
  { aiDoctorRouter },
  { config },
] = await Promise.all([
    import('../src/controllers/authController.js'),
    import('../src/middleware/auth.js'),
    import('../src/controllers/consultationController.js'),
    import('../src/database/client.js'),
    import('../src/services/agentOrchestrator.js'),
    import('../src/routes/consultation.js'),
    import('../src/services/emergencyPreScreen.js'),
    import('../src/services/agents/symptomAdapter.js'),
    import('../src/services/agents/severityAdapter.js'),
    import('../src/services/agents/safetyAdapter.js'),
    import('../src/routes/aiDoctor.js'),
    import('../src/config/index.js'),
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

const symptomResponse: SymptomAnalysis = {
  success: true,
  agent: 'symptom-agent',
  timestamp: new Date().toISOString(),
  language: 'en',
  data: {
    summary: { primarySymptoms: ['headache'], duration: 'one day' },
    followUpQuestions: [],
    emergencySignals: false,
    conversationStage: 'assessment',
  },
};

const severityResponse: SeverityAnalysis = {
  riskLevel: 'LOW',
  riskScore: 10,
  confidence: 0.9,
  emergency: false,
  clinicalSummary: 'Low risk',
  recommendations: [],
  reasoning: [],
};

const safetyResponse: SafetyAnalysis = {
  safe: true,
  emergency: false,
  escalationRequired: false,
  confidence: 0.9,
  riskLevel: 'SAFE',
  safetyWarnings: [],
  approvedRecommendations: [],
  blockedRecommendations: [],
  hallucinationDetected: false,
  consistencyFailed: false,
  escalationLevel: 'NO_ESCALATION',
};

interface AdapterContract {
  name: string;
  invoke: (sessionId: string) => Promise<unknown>;
  endpoint: string;
  payload: unknown;
  initEndpoint?: string;
}

const adapterContracts: AdapterContract[] = [
  {
    name: 'symptom',
    invoke: (sessionId: string) =>
      analyzeSymptoms({ sessionId, message: 'headache', language: 'en' }),
    endpoint: '/symptoms/analyze',
    payload: symptomResponse,
    initEndpoint: '/session/start',
  },
  {
    name: 'severity',
    invoke: (_sessionId: string) =>
      analyzeSeverity({
        sessionId: 'adapter-severity',
        symptoms: ['headache'],
        duration: 'one day',
        age: 30,
        gender: 'other',
        language: 'en',
      }),
    endpoint: '/severity/analyze',
    payload: severityResponse,
  },
  {
    name: 'safety',
    invoke: (_sessionId: string) =>
      evaluateSafety({
        sessionId: 'adapter-safety',
        symptoms: ['headache'],
        severityResult: { riskLevel: 'LOW', riskScore: 10, confidence: 0.9 },
        recommendations: [],
      }),
    endpoint: '/safety/evaluate',
    payload: safetyResponse,
  },
] as const;

for (const adapter of adapterContracts) {
  test(`${adapter.name} adapter accepts valid HTTP output`, async (context) => {
    context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      const url = String(input);
      if (adapter.initEndpoint && url.endsWith(adapter.initEndpoint)) {
        return Response.json({ success: true });
      }
      return Response.json(adapter.payload);
    });

    const result = await adapter.invoke(`${adapter.name}-success-${Date.now()}`);
    assert.equal((result as { ok: boolean }).ok, true);
    assert.deepEqual((result as { data: unknown }).data, adapter.payload);
  });

  test(`${adapter.name} adapter maps request timeout`, async (context) => {
    context.mock.method(
      globalThis,
      'fetch',
      (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (adapter.initEndpoint && url.endsWith(adapter.initEndpoint)) {
          return Promise.resolve(Response.json({ success: true }));
        }
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      },
    );

    const result = await adapter.invoke(`${adapter.name}-timeout-${Date.now()}`);
    assert.deepEqual(result, { ok: false, error: 'timeout' });
  });

  test(`${adapter.name} adapter maps HTTP 5xx to unavailable`, async (context) => {
    context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      const url = String(input);
      if (adapter.initEndpoint && url.endsWith(adapter.initEndpoint)) {
        return Response.json({ success: true });
      }
      return new Response('service unavailable', { status: 503 });
    });

    const result = await adapter.invoke(`${adapter.name}-5xx-${Date.now()}`);
    assert.deepEqual(result, { ok: false, error: 'unavailable' });
  });

  test(`${adapter.name} adapter maps invalid response body`, async (context) => {
    context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      const url = String(input);
      if (adapter.initEndpoint && url.endsWith(adapter.initEndpoint)) {
        return Response.json({ success: true });
      }
      return Response.json({ invalid: true });
    });

    const result = await adapter.invoke(`${adapter.name}-invalid-${Date.now()}`);
    assert.deepEqual(result, { ok: false, error: 'invalid_output' });
  });

  test(`${adapter.name} adapter maps malformed JSON to invalid_output`, async (context) => {
    context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      const url = String(input);
      if (adapter.initEndpoint && url.endsWith(adapter.initEndpoint)) {
        return Response.json({ success: true });
      }
      return new Response('not-json', { status: 200 });
    });

    const result = await adapter.invoke(`${adapter.name}-malformed-${Date.now()}`);
    assert.deepEqual(result, { ok: false, error: 'invalid_output' });
  });
}

test('orchestrator happy path with successful adapters is not degraded', async () => {
  const result = await orchestrateAgents(
    {
      sessionId: 'orchestrator-success',
      message: 'I have a mild headache',
      language: 'en',
      age: 30,
      gender: 'other',
    },
    {
      analyzeSymptoms: async () => ({ ok: true, data: symptomResponse }),
      analyzeSeverity: async () => ({ ok: true, data: severityResponse }),
      evaluateSafety: async () => ({ ok: true, data: safetyResponse }),
    },
  );

  assert.equal(result.degraded, false);
  assert.equal(result.agentsInvoked.length, 3);
  assert.ok(result.agentsInvoked.every((agent) => agent.ok));
});

test('POST /api/ai-doctor/message rejects invalid message values with 400', async (context) => {
  const app = express();
  app.use(express.json());
  app.use('/api/ai-doctor', aiDoctorRouter);
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    assert(address && typeof address !== 'string');
    const token = jwt.sign({ sub: 'message-validation-user' }, config.jwtSecret);
    const invalidMessages: Array<{ label: string; message: unknown }> = [
      { label: 'empty message', message: '' },
      { label: '2500-character message', message: 'x'.repeat(2500) },
      { label: 'non-string message', message: 42 },
    ];

    for (const { label, message } of invalidMessages) {
      await context.test(label, async () => {
        const response = await fetch(
          `http://127.0.0.1:${address.port}/api/ai-doctor/message`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              consultationId: 'validation-only',
              message,
              language: 'en',
            }),
          },
        );
        assert.equal(response.status, 400);
        assert.equal((await response.json() as { ok: boolean }).ok, false);
      });
    }
  } finally {
    server.close();
    await once(server, 'close');
  }
});
