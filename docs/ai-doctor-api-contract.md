# AI Doctor API Contract (Phase 1)

The Phase 1 sections below are a historical snapshot and are superseded by the
Phase 4D implementation note at the end of this document. Neither section
represents an agreement with another API owner.

## Current implementation note (Phase 4D)

The canonical authenticated transcript route remains
`POST /api/video/transcript`. The current controller validates the request,
checks consultation ownership, persists the patient transcript, and sends the
upstream result through the strict response boundary before returning it. Invalid
AI output returns a generic HTTP 502 degraded response; other processing errors
return a generic HTTP 500 response. Raw upstream exception details are not
returned to the client.

## Phase 1 snapshot (superseded)

### Canonical transcript interaction

Use the existing authenticated endpoint:

```http
POST /api/video/transcript
Authorization: Bearer <access-token>
Content-Type: application/json
```

It is registered as `/api/video` in `backend/src/app.ts`, then as
`POST /transcript` in `backend/src/routes/video.ts`, with `requireAuth`.
`sendVideoTranscript` requires truthy `consultationId` and `transcript`, loads
the consultation, and rejects a missing or non-owned consultation with HTTP 403. It persists the patient transcript before calling the AI gateway. It
forwards `language || consultation.language || "en"` and `history || []`.
There is no schema validation for the request body or history.

The AI gateway route (`POST /api/ai-gateway/transcript`) is also authenticated,
but its controller does not verify consultation ownership or persist the
transcript. The video route is the safer existing choice for the canonical
interaction; no second endpoint is needed for this phase.

### Request

```ts
{
  consultationId: string; // required
  transcript: string;     // required
  language?: string;      // defaults to "en" in the AI gateway call
  history?: Array<{
    speaker: "patient" | "ai" | "system";
    text: string;
    language?: string;
    timestamp?: string;
  }>;
}
```

`history` is optional and passed to orchestration when non-empty. The backend
does not validate its entries. The orchestration service uses each entry's
`speaker`, `text`, and `timestamp`; `id` and `language` are not used in its
request to the AI service.

### Success response

```ts
{
  ok: true;
  validatedResponse: {
    symptoms: Array<{
      id: string;
      name: string;
      duration?: string;
      severity?: string;
      reported?: boolean;
    }>;
    riskAssessment: {
      riskScore: number;
      level: "low" | "medium" | "high" | "critical";
      confidence: number;
      details?: string;
    };
    safetyIssues: string[];
    recommendations: string[];
    nextAction: string;
    shouldEscalate: boolean;
    emergencyMessage?: string;
  };
}
```

The `validatedResponse` is the `OrchestrationResult` created by
`AIOrchestratorService`. It has no separate assistant-reply or agent-results
field. `riskScore`, risk level, escalation, symptoms, and recommendations are
distinct values and must not be inferred from one another. The current
orchestrator mapper defaults some values when the upstream response omits them;
those defaults are implementation behavior, not independently validated
clinical findings.

### Errors and availability

The video controller uses these JSON error envelopes:

```ts
{
  ok: false;
  message: string;
}
{
  ok: false;
  message: string;
  error: string;
} // caught server/upstream error
```

Current known statuses are 400 for missing required fields, 403 for an
unauthorized consultation, and 500 for caught transcript-processing errors.
The `error` value is the caught exception message. There is no request/trace ID
and no explicit degraded-success response. A client may treat a 5xx as
unavailable/degraded, but that is client interpretation of an HTTP failure, not
a backend-declared capability state. No successful AI result should be
synthesized for that case.

## Proposed / requires Shivam confirmation

- Whether clients need a dedicated `assistantReply` string in addition to the
  current structured `recommendations`. Neither transcript endpoint returns
  such a field today.
- Whether orchestration failures should use a stable service-unavailable
  status/body instead of the current generic 500 envelope that includes a raw
  exception message.
- Whether conversation history should be formally validated and which history
  fields should be required at the HTTP boundary.

Until those decisions are confirmed and implemented, consumers should use only
the verified fields and should not describe a recommendation as a distinct
assistant reply.

## Not implemented / blocked

- Explicit structured “degraded” response from the backend.
- Assistant-reply text and returned agent results on this endpoint.
- Request/trace identifiers.
- Runtime mock mode. It is intentionally not added: contract tests read local,
  clearly marked fixtures and exercise pure parsers; they do not intercept the
  API client or perform network calls.

## Test fixtures

`frontend/tests/fixtures/ai-doctor/` contains exactly four JSON fixtures. Each
is marked `testData: true`; fixture values are examples only, not real
consultation outcomes. The normal and emergency cases omit risk metrics and
unreturned agent results. The degraded fixture uses the backend's 500 error
envelope and an illustrative upstream-unavailable message; the backend does
not guarantee that exact error string.

Run the focused contract tests with Node's built-in test runner (Node 24):

```powershell
node --test frontend/tests/ai-doctor-contract.test.ts
```

## P1 Python orchestrator status

`POST /process` now invokes the Python `ConsultationOrchestrator`; it does not
invoke disconnected agent routes and cannot return an assessment. The
orchestrator currently fails closed with HTTP 503 and stable
`missingCapabilities` keys until the required stages are implemented and
verified. This is an explicit unavailable response, not an AI result. No model,
vector database, backend database, or paid service was contacted by these
tests.

The existing Python components do not establish the required contract:

- `/agents/symptom` produces model-extracted fields without patient-reported
  provenance and defaults missing confidence.
- `/agents/severity` defaults missing score, risk level, and confidence, and
  uses a prompt-defined scale without authoritative semantics.
- `/agents/safety` is a model prompt and is not a trusted emergency or
  claim-level source validator.
- `RAGPipeline` validates retrieval scores, not each generated claim's
  attribution or approval. Its document-ingestion method is a no-op. The
  configured Qdrant integration is not an approved-source registry.
- Existing model endpoints use the legacy `openai.ChatCompletion.create`
  interface while `ai/requirements.txt` pins OpenAI 1.x. Explicit bounded
  stage timeouts are also absent.

Accordingly, the current implementation cannot supply symptom provenance,
approved source retrieval, claim-level safety validation, authoritative risk
assessment semantics, trusted emergency metadata, a verified-compatible model
client, or bounded stage timeouts. Those are the exact blockers represented by
`missingCapabilities`. Passing software contract tests would not establish
clinical validity.

## Phase 3/4 text-first and avatar fallback behavior

The AI Doctor UI starts its authenticated consultation without initializing a
TruGen session. The repository's custom session endpoints are not verified
against TruGen's documented contract, and the official SDK's approved-reply
speech capability remains unverified. The avatar therefore remains visibly
unavailable; no provider session or speech request is made. Text submissions
continue through `videoAPI.sendTranscript()` and the canonical
`POST /api/video/transcript`.

Camera and browser speech-recognition access are opt-in through their controls;
starting a consultation does not request camera or microphone access. The UI
displays actual structured response fields in their corresponding assessment
panels and does not synthesize an assistant reply from recommendations,
symptoms, or local prompt text.

The transcript controller persists the patient message before calling the AI
gateway, and the request has no idempotency key. As a result, the client only
offers same-message retry for HTTP 401, which `requireAuth` returns before the
controller persists a transcript. For other failures, delivery may be
uncertain; the UI does not resend that same text, and informs the user that it
may already have been saved. A failed consultation-creation request is not
retried automatically because its outcome may also be uncertain. Backend
idempotency and the assistant-reply contract remain product/API decisions.

Focused workflow tests:

```powershell
node --experimental-strip-types --test frontend/tests/ai-doctor-workflow.test.ts
```

The workflow tests also assert that repeated startup reuses the same
consultation and that the unsupported avatar initialization, connection, and
speech operations are not called.

## Phase 4D response-boundary contract

The current success envelope is `{ ok: true, validatedResponse }`. Its output
contains patient-reported symptom objects (`reported: true`), a structurally
validated risk assessment, an empty recommendations array, and an escalation
boolean. The software boundary requires a completed workflow, a risk level of
`low`, `medium`, `high`, or `critical`, finite numeric score/confidence fields,
and an array of symptoms with non-empty names and explicit patient-reported
provenance. It rejects non-empty recommendations and safety issues because the
upstream response does not provide attributable claim sources or connected
safety approval. It does not create an assistant reply.

These checks establish only the implemented software shape. The repository
does not establish the score range or confidence scale, nor that the producer's
risk vocabulary is authoritative. The checked-in `/process` producer remains
incompatible with required risk and symptom fields. Consequently, a response
that cannot pass the boundary is degraded; the synthetic test fixtures are not
evidence of live producer compatibility or clinical validity. Emergency
escalation metadata is preserved on degraded responses when supplied explicitly
by the workflow, without forwarding generated emergency text.

The upstream owner must define the risk score scale and confidence semantics,
explicit patient-reported symptom provenance, and any source-attribution
contract before the producer can supply usable recommendations or a live
response can be represented as a supported assessment. Qualified clinical
review remains necessary for medical policy decisions.

## P0: active producer mismatch and owner contract proposal

### Implemented Python adapter contract

The Python service now registers `POST /process` and validates the exact
backend payload:

```ts
{
  sessionId: string;
  conversationId: string;
  language: string;
  input: string;
  metadata: {
    conversationHistory: Array<{
      speaker: "patient" | "ai" | "system";
      text: string;
      timestamp?: string;
    }>;
  }
}
```

It returns HTTP 503 with the stable body
`{ ok: false, code: "CONSULTATION_WORKFLOW_UNAVAILABLE", message: string }`.
Invalid `/process` request bodies return HTTP 422 with a generic
`INVALID_REQUEST` envelope that does not echo request contents. There is
deliberately no success response shape: no current Python orchestration path can
produce an assessment satisfying the strict backend boundary.

The backend sends to its configured `AI_SERVICE_URL` plus `/process`. Axios
timeouts and upstream 5xx/unavailable responses are translated to a generic
HTTP 503 transcript response. Malformed upstream results and other upstream
4xx responses fail closed as HTTP 502. The transcript owner check and patient
transcript persistence still happen before the upstream request.

### Repository evidence

The backend calls `POST ${AI_SERVICE_URL}/process`; its source default is
`http://localhost:8000`. The checked-in Python service at that port exposes
`/agents/*`, `/rag/*`, and `/medical/*` routes, but no `/process` route. The
configured local backend URL was classified as loopback port 8000 without
recording or printing any environment-file values.

The checked-in TypeScript orchestrator is the only repository implementation
found for `/process`. Its server defaults to port 4000, is outside the root
workspace scripts, and registers local mock agents. Its response builder:

- Emits symptom objects without explicit patient-reported provenance.
- Emits `risk: "unknown"` when severity data is absent, or mock labels such as
  `"moderate"` / `"high"`; the mock severity agent supplies a label only.
- Defaults a missing risk score to `0` and emits confidence strings such as
  `"high"` / `"medium"`.
- Builds non-empty recommendation strings from mock knowledge and safety
  outputs without source attribution.
- Uses a keyword-based mock safety agent for its emergency flag.

Therefore the repository's TypeScript producer cannot satisfy the current
strict boundary. The unrelated severity service contains a different 0–100
scale and uppercase labels; the Python service has a different 0–1 Pydantic
shape. Neither is connected to this `/process` producer, so neither defines
its contract.

The Python app now defers RAG construction until an endpoint actually needs
retrieval. This allows the FastAPI app, `/health`, and the explicit unavailable
`/process` adapter to run without Qdrant installed; it does not make RAG or the
agent routes operational. The repository's actual RAG safety pipeline checks
retrieval scores and has no wired claim-level source verification for
recommendations. Its independent presence does not establish approved source
attribution for consultation output.

The Python tests use FastAPI's in-process `TestClient` against the real app.
They prove route registration, request validation, generic 422 handling, and
explicit 503 degradation only. They do not invoke an LLM, RAG, severity
assessment, safety agent, database, or live consultation.

### Candidate contract for owner review

Keep the current `POST /process` workflow envelope, but require the owner to
approve explicit semantics for each field before implementing it:

```ts
type CandidateProcessResponse = {
  workflowStatus: "COMPLETED" | "FAILED";
  response?: {
    symptoms: Array<{
      name: string;
      provenance: "patient_reported" | "inferred";
    }>;
    riskAssessment: {
      level: string;
      score: number;
      scoreScale: string;
      confidence: number;
      confidenceMeaning: string;
    };
    recommendations: Array<{
      text: string;
      category: string;
      sources: Array<{ sourceId: string }>;
      validationStatus: string;
    }>;
  };
  emergencyDetected?: boolean;
};
```

This is a discussion schema only. It does not establish approved labels, scales,
source validation, recommendation categories, or trusted emergency semantics.
The backend remains fail-closed and does not accept this candidate until those
definitions and their producer guarantees are agreed and tested.

### Exact API-owner questions

1. Which service is authoritative for the backend's `/process` call: the
   TypeScript mock orchestrator, the Python service, or another deployment?
   What exact local/deployment base URL and route should the backend use?
2. What is the complete allowed risk-level vocabulary, including unknown or
   indeterminate cases? Which source defines it?
3. What is the risk-score numeric range, units, direction, and meaning of
   boundary values? Is zero a real assessment or an unavailable/default value?
4. What does confidence measure, what is its numeric scale/range, and is it
   calibrated? How must unavailable confidence be represented?
5. How will the producer distinguish symptoms quoted/reported by the patient
   from inferred or suggested symptoms, and what provenance must be returned?
6. Which recommendation categories are permitted? For each claim, what source
   identifier and validation evidence are required, and which service verifies
   that the source supports the claim?
7. Which component is authoritative for `emergencyDetected`? Is it trusted
   workflow metadata or a model/keyword inference, and what should the client
   show if the rest of the response is invalid?
8. What response is valid when an emergency short-circuits the normal workflow?
   Which fields may be absent without being filled with defaults?
9. What are the stable HTTP status/error shapes for timeout, unavailable
   producer, malformed output, and failed workflow, without transcript or
   upstream error details?

Until these questions are resolved, a synthetic contract fixture can verify
software behavior only. It is not evidence that either checked-in service can
produce a valid clinical assessment.
