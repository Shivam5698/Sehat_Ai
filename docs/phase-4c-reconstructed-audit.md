# Phase 4C Reconstructed Audit

**Audit date:** 2026-10-18  
**Branch:** `sachin-backend`  
**Status:** Reconstructed from repository source; this is not the original Phase
4C report.

## Evidence recovery

No standalone Phase 4C report, implementation plan, or Phase 4C-specific test
suite was found in the repository files or the available local Git history.
The available `docs/trugen-integration-audit.md` includes a Phase 4B outcome;
`docs/ai-doctor-api-contract.md` is the Phase 1 contract. The relevant recent
commits contain no Phase 4C report or transcript-boundary changes.

This document records only findings supported by the checked-in source. It
does not claim that missing Phase 4C work was completed.

## Confirmed transcript flows

### Canonical `POST /api/video/transcript`

- `backend/src/app.ts` mounts `videoRouter` at `/api/video`.
- `backend/src/routes/video.ts` attaches `requireAuth` to `/transcript`.
- `backend/src/controllers/videoController.ts`, `sendVideoTranscript`, checks
  that the consultation belongs to the authenticated subject and persists the
  patient transcript before calling `AIGatewayService.sendTranscript`.
- `backend/src/integrations/ai-gateway/aiGateway.service.ts` constructs the
  conversation context and calls `AIOrchestratorService.orchestrateConsultation`.
- `backend/src/services/aiOrchestratorService.ts` POSTs the transcript/history
  to the configured AI service `/process` endpoint and maps the returned
  workflow object to the existing `validatedResponse`.
- The controller previously serialized raw caught exception messages to the
  client. Agent logs also serialized the request/history and complete workflow
  result.

### Alternate `POST /api/ai-gateway/transcript`

- `backend/src/routes/aiGateway.ts` also attaches `requireAuth`.
- `backend/src/integrations/ai-gateway/aiGateway.controller.ts`, previously,
  read the authenticated subject but did not use it to verify ownership. It
  neither persisted the patient transcript nor established ownership before
  orchestration.
- A repository-wide frontend/client search found no caller of this endpoint.
  The frontend uses `videoAPI.sendTranscript()` and the canonical video route.
  The endpoint remains available for unknown external consumers; it was not
  removed or redirected.

### Realtime transcript consumer

`backend/src/realtime/consultationSocket.ts`, `processAudioBuffer`, also calls
the shared `AIGatewayService`. It persists the patient transcript and later
publishes returned symptoms, risk, recommendations, and escalation state to
socket events and consultation records. The response validator therefore
applies to both HTTP and realtime callers. On a rejected response with an
emergency flag, the socket handler emits the emergency event immediately, then
persists the emergency record/status asynchronously; it does not emit
unvalidated recommendation or emergency-message text.

## Response validation, safety engines, and sources

- The prior `AIOrchestratorService.mapWorkflowResult` defaulted missing
  symptoms/recommendations to empty arrays, missing risk score/confidence to
  zero, and missing/invalid risk level to `low`. Those defaults could present
  an absent or malformed assessment as a low-risk result.
- The configured TypeScript orchestrator producer is
  `ai/agents/orchestrator/ORCHESTRATION AGENT/orchestrator-agent/src/response/response-builder.ts`.
  `ResponseBuilder.buildResponse` can emit `risk: "unknown"` or a severity
  label such as `"moderate"`, defaults `riskScore` to zero when severity
  output has no `score`, and emits confidence strings such as `"high"` or
  `"medium"`. The adjacent mock `SeverityAgent` supplies only a level. Those
  values do not establish the numeric risk contract expected by the backend.
  The backend defaults to port 8000; the checked-in orchestrator server
  defaults to port 4000. Runtime configuration was not inspected, so the
  deployment target cannot be confirmed.
- `backend/src/agents/safetyAgent.ts` is a keyword/risk check, but the
  canonical transcript path does not call it.
- The separate safety agent's `SafetyEngine` and
  `recommendation.validator.ts` are not wired into the canonical
  `AIOrchestratorService` response boundary. Their source code is not evidence
  that their checks run for this endpoint, nor that they establish clinical
  validity.
- The TypeScript orchestrator pipeline registers its own mock
  `SafetyAgent`. Its emergency heuristic does not provide the repository's
  `SafetyEngine` or a medical-claim/source validation guarantee.
- RAG and medical retrieval/validation are separate endpoints in
  `ai/main.py` and `backend/src/services/aiService.ts`; no source attribution
  is attached to the canonical transcript's returned recommendation strings.
  The orchestrator's knowledge agent output is not itself a verifiable source.
- `frontend/src/types/aiDoctor.ts` permits optional `reported` provenance on
  symptoms. The UI previously discarded it and displayed only names. No
  assistant-reply field exists; recommendations are not an assistant reply.

## Phase 4D boundary behavior

The Phase 4D code now:

- Validates the upstream workflow status, required risk fields, symptom shape,
  escalation fields, and recommendation structure before mapping success.
- Does not synthesize missing risk fields or replace an unknown risk level
  with `low`.
- Returns symptoms only when upstream explicitly marks them patient-reported;
  this flag is metadata, not independent confirmation of what the patient said.
- Rejects non-empty recommendation text because the current contract provides
  neither source attribution nor an executed safety approval step on this path.
  It returns a degraded HTTP 502 error rather than displaying unsupported or
  potentially prescriptive text as a successful structured response. On
  degraded responses, it carries the emergency flag—not unvalidated
  model-generated emergency text—to the UI, which displays an emergency
  services fallback.
- Preserves the canonical authentication, ownership, and patient-transcript
  persistence behavior. The alternate endpoint now also verifies consultation
  ownership and retains its existing non-persisting behavior.
- Limits agent-log payloads to workflow status/escalation metadata.
  Patient transcripts continue to be persisted as consultation transcripts;
  that is separate from redundant agent-log copies. Transcript-processing
  errors are logged with the error class only and returned without raw
  upstream/database details.
- Displays symptom provenance rather than presenting generated symptom
  interpretation as patient-reported. It also explains that software shape
  checks do not establish clinical validity and that the service cannot
  prescribe or recommend medicines.

The HTTP success response fields are not extended and no `assistantReply` is
introduced. The error envelope gains an optional `shouldEscalate` field;
existing clients may ignore this additive field.
Non-empty recommendations now fail closed, which is an intentional behavior
change for previously accepted but unattributed text.

## Decisions still requiring owner/clinical review

1. The active response producer and API owner must agree on a stable risk
   assessment shape, including numeric risk-score scale and confidence type.
   The current producer and backend mapper disagree, so successful transcript
   requests may degrade until the producer is corrected.
2. To return educational or self-care content safely, propose an explicit
   per-item response contract such as:

   ```ts
   {
     text: string;
     category: "educational" | "self_care";
     sourceIds: string[];
   }
   ```

   The API owner must approve the schema and the source-validation flow must
   produce verifiable source identifiers before this can replace the current
   fail-closed behavior. This proposal is not implemented.

3. Qualified clinical review is required for medication refusal language,
   diagnosis-related handling, self-care boundaries, and emergency policy.
   Automated structural validation and existing keyword/list validators are
   software safeguards, not evidence of clinical validity.
4. `frontend/src/routes/ai-doctor.tsx` renders risk scores on a `/100` scale,
   while other checked-in risk schemas use a `[0,1]` scale. The response
   producer/API owner must clarify the scale before normalizing or changing
   the display.

## Verification limits

Tests use deterministic, local fixtures/mocks and the Node built-in test
runner. No medical model, provider, TruGen, production service, database
migration, or live external API is used by the Phase 4D tests.

## Phase 4D.1 upstream contract alignment addendum

This addendum records a source inspection for Phase 4D.1. It does not change
the Phase 4D boundary or claim that the upstream fields have clinically valid
semantics.

### `/process` contract established from checked-in source

- The checked-in TypeScript service exposes `POST /process` in
  `ai/agents/orchestrator/ORCHESTRATION AGENT/orchestrator-agent/src/server.ts`.
  It returns the `WorkflowResult` from
  `src/core/orchestrator.service.ts`; that result has a `workflowStatus`,
  optional `response`, and optional `emergencyDetected`.
- `WorkflowResult.response` is a `Record<string, unknown> | UnifiedResponse`.
  `UnifiedResponse` declares `risk?: string`, `riskScore?: number`,
  `confidence: string`, `recommendation: string`, and optional string-array
  `recommendations`. It does not declare a score scale, confidence semantics,
  symptom provenance, or source-attribution structure.
- `ResponseBuilder.buildResponse` sets risk to `"unknown"` when no severity
  level exists, passes through a severity level otherwise, and defaults a
  missing score to `0`. It sets confidence to a string: the severity value
  converted to text, or `"high"`/`"medium"` based on whether every agent
  execution succeeded. This is an agent execution heuristic, not documented
  risk-assessment confidence.
- The registered `/process` `SeverityAgent` in `src/agents/mock-agents.ts`
  emits a label only (`"high"` or `"moderate"`), selected by a keyword
  expression; it emits neither score nor assessment confidence. The symptom
  agent segments the combined input into symptom names without identifying
  whether an item came from patient speech or generated interpretation.
  Knowledge and safety agents emit generic text; their result data does not
  provide verifiable citation identifiers for those strings. The safety
  agent's emergency flag is also produced by a keyword expression.
- A separate severity-agent module documents `LOW`, `MODERATE`, `HIGH`, and
  `EMERGENCY`, a 0–100 score with configured thresholds, and confidence in
  `[0,1]`. Its validator and calculation code are not called by the checked-in
  `/process` workflow or its registered mock severity agent. Those separate
  semantics therefore cannot be treated as the authoritative `/process`
  contract without an explicit integration decision.
- The Phase 4D backend boundary accepts only `low`, `medium`, `high`, or
  `critical` with finite numeric score and confidence, explicitly reported
  symptoms, and no non-empty unattributed recommendation content. These
  checks remain strict. No conversion, defaults, source claims, or provenance
  flags were added to bridge the producer gap.

### Contract-owner questions and proposed agreement

The following decisions are needed before implementation can safely align
the producer and boundary:

1. **Deployed producer identity:** Is the checked-in TypeScript `/process`
   service the service currently configured for backend transcript requests?
   What exact service/version is deployed, and which owner controls its API
   contract?
2. **Risk vocabulary and score:** What are the authoritative risk-level
   values and mappings? Is the separate severity-agent module intended to be
   the source of truth, and is its 0–100 scale and threshold table approved
   for this workflow? The registered `/process` severity mock currently does
   not calculate a score.
3. **Confidence:** What does confidence measure, which component calculates
   it, and what numeric range/calibration is intended? The current
   `ResponseBuilder` fallback based on agent success is not an assessment
   confidence value.
4. **Symptom provenance:** Which workflow component can distinguish
   patient-reported symptoms from generated interpretation, and what evidence
   (for example, a transcript span or source-message identifier) supports
   that distinction? The current splitter cannot establish provenance.
5. **Recommendations and sources:** Which component validates recommendation
   content, and what stable source identifiers/metadata are returned and
   verified? The current generic knowledge reference and generated strings
   do not establish claim-level attribution or source verification.
6. **Emergency metadata:** Which trusted workflow step owns the emergency
   decision, what evidence supports it, and should it remain available when
   the rest of a response is invalid or degraded? The current mock flag is
   keyword-derived.
7. **Compatibility and failure state:** Can the owner approve an additive,
   versioned response contract and define explicit unavailable/invalid states
   without treating absent assessments as low risk? Which existing clients
   consume the current string fields?

The minimum alignment proposal is to have the API owner approve a versioned
`/process` response contract that explicitly represents assessment
availability, defines risk vocabulary and score/confidence semantics,
distinguishes patient-reported symptoms from generated interpretation with
traceable provenance, represents recommendations only with validated
claim-level source attribution, and identifies trusted emergency metadata.
It must not include a default score or confidence when the assessment is
unavailable. This is a proposal only; no producer schema or consumer behavior
was changed pending those decisions.

### Phase 4D.1 disposition

The wire shape of the checked-in `/process` response is established, but its
clinical risk, confidence, symptom-origin, recommendation-source, and
emergency semantics are not authoritative or consistent with the backend
boundary. The available code does not establish that the separate severity
module is the producer for this route. Phase 4D.1 implementation and proposed
integration-contract tests are therefore blocked pending API-owner answers;
loosening the backend validator or filling missing fields would be unsafe.
