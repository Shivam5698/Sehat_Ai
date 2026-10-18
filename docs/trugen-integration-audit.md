# TruGen Integration Audit — Phase 2 (N-02)

**Audit date:** 2026-10-18

**Branch:** `sachin-backend`

**Outcome:** **F — Text chat plus visual-avatar fallback**

This document's original request-flow assessment is a Phase 2 snapshot. The
Phase 4 implementation addendum at the end records the current frontend
behavior and supersedes its descriptions of the page calling custom TruGen
session and speech endpoints.

## Executive summary

The repository contains a custom TruGen REST client and multiple server paths
that create sessions or request avatar speech. Their routes being present is
not evidence that those calls work against TruGen's current API. Official
documentation describes a different browser integration: a server exchanges
an API key for a short-lived token using
`POST https://api.trugen.ai/v1/auth/conversation`, and the browser connects
using the official `@trugen/js-sdk`.

The provider documentation supports injecting audio into the JavaScript SDK,
but the inspected official references do not document injecting arbitrary
text for speech by an externally approved backend response. That specific
capability is **UNVERIFIED**. TruGen's documented agent pipeline includes its
own LLM and TTS; letting that agent answer medical questions independently
would bypass Sehat AI's response and safety path.

Therefore the current safe architecture decision is **F**: keep the
authenticated Sehat AI transcript/structured-response flow authoritative and
do not treat TruGen speech as integrated until a documented, controlled
approved-reply flow is verified. This is a decision, not a claim that the
existing UI already implements a graceful avatar fallback. In the current UI,
starting the consultation depends on TruGen session initialization, and a
successful transcript response is followed by a request to the unverified
TruGen `/speak` operation. That behavior remains blocked pending Phase 3
decisions and ownership controls.

No backend or frontend runtime code was changed in this phase. Static
inspection shows security and correctness gaps in the existing session-control
surfaces. Correctly fixing them requires a coordinated ownership model for
REST and Socket.IO sessions and focused tests; making a partial one-route
change would leave the other control paths exposed.

## Existing architecture and traced request flow

### AI Doctor page

1. `frontend/src/routes/ai-doctor.tsx` obtains a browser media stream when
   available, creates a consultation using
   `POST /api/consultation/start`, then calls
   `POST /api/video/session/init` and `POST /api/video/session/start`.
   The page does not import a TruGen browser SDK. It uses browser speech
   recognition for input and assigns the returned stream URL to a video
   element.
2. For each recognized or typed patient utterance, the page calls
   `videoAPI.sendTranscript()`, which sends
   `POST /api/video/transcript` with `consultationId`, `transcript`,
   `language`, and optional history.
3. `backend/src/routes/video.ts` applies `requireAuth` to this canonical route.
   `sendVideoTranscript` checks that the consultation belongs to the JWT
   subject, persists the patient transcript, and calls the AI gateway. The
   gateway calls the orchestrator with a 15-second Axios timeout. Success is
   returned as `{ ok: true, validatedResponse }`; a caught failure is returned
   as HTTP 500 with `{ ok: false, message, error }`. There is no synthesized
   successful result on the caught-failure path.
4. The frontend validates the response using the Phase 1 contract parser. It
   currently constructs display/speech text from `emergencyMessage`,
   `recommendations`, symptoms, or a local prompt, then calls
   `POST /api/video/avatar/speak`. This is frontend-derived text, not a
   server-returned `assistantReply`; recommendations must not be represented
   as that contract field. Whether the frontend should present structured
   recommendations as conversation text remains a separate contract/UI
   decision.
5. The video route requires authentication, but `avatarSpeak` accepts a
   caller-provided `sessionId` and text without checking that the session
   belongs to the authenticated user or that the text is an approved backend
   response.

The canonical transcript endpoint remains `POST /api/video/transcript`.
`POST /api/ai-gateway/transcript` is an existing separate authenticated route,
but its controller does not perform the consultation-ownership check or
transcript persistence. No duplicate endpoint was added or is recommended.

### Other TruGen paths

- `backend/src/services/trugenService.ts` subclasses
  `backend/src/video/trugen/trugen.client.ts`. The client issues custom
  relative REST calls for `/sessions`, session lifecycle actions, `/speak`,
  `/audio`, `/connect`, status, and `/avatars`. It uses a configurable
  `TRUGEN_BASE_URL`, an `Authorization` header derived from
  `TRUGEN_API_KEY`, and a 30-second Axios timeout. These calls do not match the
  documented token endpoint and no official documentation found during this
  audit established these custom paths or request/response schemas.
- `backend/src/routes/trugen.ts` mounts authenticated `POST /api/trugen/session`,
  `/stream`, and `/speak`. The associated controller forwards caller payloads
  or session IDs to TruGen without schema validation, consultation ownership
  checks, or local error handling.
- Several `backend/src/controllers/videoController.ts` session operations
  (`start`, `end`, status, pause/resume, avatar speech) require a valid login
  through the router but do not verify that the given provider session is
  associated with the caller's consultation. Initialization does check
  consultation ownership.
- `backend/src/realtime/consultationSocket.ts` creates TruGen sessions and
  handles `avatar:init` and `avatar:speak` events. The Socket.IO server setup
  has wildcard CORS and no Socket.IO authentication middleware in the
  inspected setup. Events accept caller-supplied consultation/user IDs and do
  not establish that the socket belongs to the consultation owner. This is a
  separate, currently unsafe control path.
- `backend/src/video/trugen/token.service.ts` creates and verifies a local JWT
  with a one-hour default lifetime and a hard-coded fallback secret. It is not
  the documented TruGen session-token exchange and has no usages in the
  inspected source.
- `avatar.service.ts` and `events.service.ts` are helper classes; no usages of
  either class were found in the source. The event helper emits Socket.IO room
  events, not documented provider callbacks.

## Source files inspected

- `backend/src/services/trugenService.ts`
- `backend/src/video/trugen/trugen.client.ts`
- `backend/src/video/trugen/token.service.ts`
- `backend/src/video/trugen/avatar.service.ts`
- `backend/src/video/trugen/events.service.ts`
- `backend/src/video/trugen/types.ts`
- `backend/src/routes/trugen.ts`
- `backend/src/controllers/trugenController.ts`
- `backend/src/app.ts`
- `backend/src/config/index.ts`
- `backend/src/middleware/auth.ts`
- `backend/src/routes/video.ts`
- `backend/src/controllers/videoController.ts`
- `backend/src/routes/consultation.ts`
- `backend/src/controllers/consultationController.ts`
- `backend/src/routes/aiGateway.ts`
- `backend/src/integrations/ai-gateway/aiGateway.controller.ts`
- `backend/src/integrations/ai-gateway/aiGateway.service.ts`
- `backend/src/services/aiOrchestratorService.ts`
- `backend/src/realtime/consultationSocket.ts`
- `backend/src/socket/index.ts`
- `backend/src/server.ts`
- `backend/src/video/session-manager/sessionManager.ts`
- `frontend/src/routes/ai-doctor.tsx`
- `frontend/src/services/api/client.ts`
- `frontend/src/types/aiDoctor.ts`
- `frontend/package.json`
- `backend/package.json`
- `docs/ai-doctor-api-contract.md` (existing Phase 1 contract notes)

## Official documentation findings

| Official source                                                                                            | Verified findings                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [API reference overview](https://docs.trugen.ai/)                                                          | The root redirects to the current documentation overview. Its published real-time pipeline describes WebRTC capture, STT, an agent LLM, TTS, and avatar rendering.                                                                                                   |
| [API reference: Get Conversation By Id](https://docs.trugen.ai/api-reference/endpoint/conversationgetbyid) | The OpenAPI document lists server `https://api.trugen.ai/v1`, API version `1.0.0`, and a documented `GET /ext/conversation/{id}` endpoint using an API-key header named `x-api-key`. This endpoint is not the custom `/sessions` API used in the repository.         |
| [JavaScript SDK overview](https://docs.trugen.ai/docs/sdks/javascript/overview)                            | The documented package is `@trugen/js-sdk`. It manages sessions, WebRTC, audio streaming, and events, and lists custom audio injection.                                                                                                                              |
| [JavaScript SDK authentication](https://docs.trugen.ai/docs/sdks/javascript/authentication)                | Server-side API keys are exchanged using `POST https://api.trugen.ai/v1/auth/conversation`, `X-API-Key`, and a JSON body containing `agentId`. The example response contains `token`; the browser initializes `createClient({ token })`.                             |
| [JavaScript SDK production guidance](https://docs.trugen.ai/docs/sdks/javascript/production)               | Session tokens are documented as valid for 5 minutes by default. The page recommends a fresh token for each user session and says the API-key request must be server-side. It lists optional `userName` and `userId` request fields.                                 |
| [JavaScript SDK basic usage](https://docs.trugen.ai/docs/sdks/javascript/reference/basic-usage)            | The documented lifecycle is `createClient({ token })`, register stream events, `session.connect()`, and `session.disconnect()`. It describes WebRTC audio/video tracks.                                                                                              |
| [JavaScript SDK event handling](https://docs.trugen.ai/docs/sdks/javascript/reference/event-handling)      | Documents lifecycle, connection, transcript, speaking, and video-stream events and recommends attaching listeners before connecting.                                                                                                                                 |
| [Realtime pipeline](https://docs.trugen.ai/docs/agents/pipeline)                                           | Describes the provider-managed STT → LLM → TTS → avatar response pipeline. This is not evidence that Sehat AI can force that LLM to speak an externally approved reply.                                                                                              |
| [iFrame integration](https://docs.trugen.ai/docs/integrations/embed-via-iFrame)                            | Documents `https://app.trugen.ai/embed/{agent_id}` and describes an interactive agent with microphone/camera access. This is a managed-agent embed, not a verified controlled-reply integration.                                                                     |
| [Widget integration](https://docs.trugen.ai/docs/integrations/widget-integration)                          | Documents the `@aiteammate/agent-widget` React package and agent/user-context props. This is not installed or used in the repository and does not document approved backend reply injection.                                                                         |
| [Official TruGen SDK overview/blog](https://trugen.ai/blog/sdk)                                            | Describes JavaScript and Python SDKs, short-lived session-token architecture, SDK events, and JavaScript `uploadAudio`/`sendAudio` custom-audio injection. Audio injection is documented; arbitrary text/reply injection into TTS is not established by this source. |
| [Official Integration PlayBook](https://playbook.trugen.ai/)                                               | The fetched page returned only a Product Hunt promotional fragment without technical integration guidance. Its `/llms.txt` returned 404. No technical behavior is inferred from it.                                                                                  |
| [TruGen product site](https://trugen.ai/)                                                                  | The fetched landing page is promotional product information, not an API contract; it was not used to infer session or speech methods.                                                                                                                                |

The SDK package and documented methods above come from current official
documentation, not from the project's dependencies. `frontend/package.json`
contains neither `@trugen/js-sdk` nor `@aiteammate/agent-widget`. The current
source therefore does not use the documented JavaScript SDK flow.

## Capability assessment

| Capability                                    | Status                               | Evidence / limitation                                                                                                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correct API host and supported version        | **Documented**                       | Official API examples use `https://api.trugen.ai/v1`; the published OpenAPI endpoint describes API version `1.0.0`. The repository's `TRUGEN_BASE_URL` is configurable and has no code default; its effective value was not verified.                                      |
| Authentication                                | **Documented**                       | Server API key via `X-API-Key` for token creation; temporary returned token passed to the browser SDK. Repository custom REST code uses a different `Authorization` header scheme and no documented token relay.                                                           |
| Conversation/session creation                 | **Documented for token/SDK flow**    | Token request: `POST /v1/auth/conversation`, body `{ agentId }` (optionally user identity), response `{ token }`. The SDK then creates/connects a session with that token.                                                                                                 |
| Repository custom session creation            | **Configured but unverified**        | Source posts `{ sessionId, agentId, avatarId, language, quality, bitrate, region }` to `/sessions` and expects `streamUrl`. No matching request/response contract was found in the official references inspected.                                                          |
| Browser SDK and connection fields             | **Documented**                       | `@trugen/js-sdk`, `createClient({ token })`, `connect()`, and `disconnect()`. The repository has no SDK dependency and uses a custom stream URL instead.                                                                                                                   |
| Token lifetime                                | **Documented**                       | 5 minutes by default for TruGen-issued session tokens. The unused local JWT helper's one-hour token is unrelated and must not be treated as a provider token.                                                                                                              |
| Embed, WebRTC, audio, and events              | **Documented in the SDK/embed docs** | iFrame/widget, WebRTC tracks, connection/speech/transcript events, and custom audio upload/send methods are described. Their suitability for this Sehat AI flow is unverified.                                                                                             |
| Arbitrary text / approved-reply injection     | **UNVERIFIED**                       | No reviewed official documentation explicitly confirms that backend-generated Sehat AI text can be injected as a spoken reply while disabling independent TruGen LLM output. The repository's `/speak` call is not evidence that the provider supports it.                 |
| Current custom REST API compatibility         | **UNVERIFIED**                       | `/sessions`, `/speak`, `/audio`, `/connect`, and lifecycle paths are unversioned in source and not matched to the documented API contract. No live provider request was made.                                                                                              |
| Credentials, account, agent and avatar access | **NOT VERIFIED**                     | Source reads `TRUGEN_API_KEY`, `TRUGEN_BASE_URL`, `TRUGEN_API_SECRET`/`TRUGEN_SECRET`, `TRUGEN_AGENT_ID`, `TRUGEN_AVATAR_ID`, and `TRUGEN_REGION`. Their presence, validity, entitlement, and account ownership were not inspected or tested. No values are included here. |

## Authentication, lifecycle, and error handling

- `requireAuth` verifies the application's JWT for the REST routes. The
  canonical transcript handler then checks `consultation.userId` against the
  authenticated subject. Session control methods other than initialization
  lack equivalent ownership checks; authentication alone does not bind a
  supplied provider session ID to the logged-in user.
- The separate `/api/trugen/*` routes require application authentication but
  accept unvalidated arbitrary session IDs and payloads. Their controller
  handlers do not locally catch or translate upstream errors.
- The Socket.IO connection is initialized without an authentication middleware
  in the inspected server setup. Consultation and avatar events trust payload
  identity fields; a socket can request operations by consultation ID without
  a visible ownership check.
- The custom axios client has a 30-second timeout. The AI orchestrator has a
  15-second timeout. Video controller catches generally return HTTP 500 and
  include the caught exception message in the response `error` field. This
  assessment is static; provider-specific timeout/error behavior is not
  verified.
- Configuration provides empty-string defaults for TruGen key/base URL and
  uses a local secret fallback in the unused token service. Neither behavior
  establishes a working or safe provider configuration.
- The document's API token error examples describe provider HTTP 400/401/500
  cases, but the application has not exercised those responses.

## Decision and code-change assessment

**Chosen current outcome: F — Text chat plus visual-avatar fallback.**

This is the only safe current choice because the Sehat AI authenticated
transcript route and validated structured response are source-verifiable,
while the current TruGen REST calls are not matched to documented APIs and
approved backend-text speech injection is unverified. The official documented
SDK pipeline includes provider-controlled LLM responses; the reviewed docs do
not establish a medical-safe way to prohibit that independent output while
still injecting Sehat AI's approved response. P2 is therefore not verified.

**Later candidate:** P1 can be reconsidered if TruGen confirms a supported
server-issued, short-lived session token and Sehat AI can prevent independent
provider-generated medical responses while presenting only its approved
response. The official token relay alone does not prove that speech
constraint. P2 also requires explicit documented support for approved
backend-reply speech.

No runtime correction is made here. Doing so safely requires decisions about
the provider's supported flow plus a cross-surface session ownership design:
REST session operations and Socket.IO both need to associate each provider
session with a verified authenticated user and owned consultation. A partial
fix limited to the token/session route would leave the other routes and socket
events unauthenticated with respect to ownership. Until those changes are
approved and tested, the existing unverified TruGen session and speech paths
should not be treated as a safe fallback or production integration.

## Phase 1 contract decisions still open

- Whether `assistantReply` should be added to the canonical
  `POST /api/video/transcript` response. It is not currently present.
- A consistent representation for upstream unavailability. Current caught
  video transcript failures return HTTP 500 with `ok: false`; do not synthesize
  a successful result.
- Which history fields are required and validated at the backend boundary.
  Current backend passes `history || []` through without validating entries.
- Whether any structured recommendations should be presented as conversational
  reply text is a separate contract/UI decision. Do not name them
  `assistantReply` or claim they are that field.

## Blockers and next actions

1. **Sachin / Sehat AI contract owner:** decide `assistantReply`, stable
   upstream-unavailability representation, and required/validated history
   shape. Keep the canonical endpoint and current ownership checks.
2. **TruGen account owner:** confirm account access, agent eligibility, region,
   and the exact API/SDK version available to this account without sharing
   credentials in code or reports.
3. **TruGen technical support / provider owner:** provide a documented
   supported method to render or speak only a Sehat AI-approved backend reply,
   including how independent agent LLM responses are disabled. Audio injection
   alone is insufficient evidence.
4. **Backend owner:** design and test ownership checks for each REST and
   Socket.IO session operation before enabling provider session control. Ensure
   failures are explicit and do not leak provider exception details.
5. **Phase 3 entry criteria:** the above contract/provider decisions are
   recorded; a secure token flow and reply-control method are documented;
   provider calls are owner-bound; focused tests cover authorization,
   lifecycle, and fail-closed behavior; no second transcript endpoint or
   fabricated successful response is introduced.

**Out of scope:** provider session creation/connectivity tests, paid or live
provider calls, dependency installation, backend response semantics changes,
new API endpoints, frontend redesign/avatar UI, credential inspection or
disclosure, database/environment changes, and commit/push.

## Verification

| Check                                                                                                                                               | Result                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Focused Phase 1 AI Doctor contract tests: `node --experimental-strip-types --test frontend\tests\ai-doctor-contract.test.ts`                        | **PASS** — 7 tests, 0 failures.                                                                         |
| Frontend project lint: `npm --prefix frontend run lint`                                                                                             | **NOT COMPLETED** — stopped after more than 12 minutes without finishing or reporting lint diagnostics. |
| Focused frontend lint: from `frontend`, `npx --no-install eslint src\types\aiDoctor.ts src\services\api\client.ts tests\ai-doctor-contract.test.ts` | **PASS** — exit code 0.                                                                                 |
| Backend TypeScript build: `npm --prefix backend run build`                                                                                          | **PASS** — `tsc -p tsconfig.json` exited 0.                                                             |
| Standalone frontend typecheck                                                                                                                       | **NOT AVAILABLE** — `frontend/package.json` defines no typecheck script.                                |
| Audit formatting: `npx prettier --check docs\trugen-integration-audit.md`                                                                           | **PASS** — Prettier reports the document formatted.                                                     |
| Live TruGen session, token, or connectivity test                                                                                                    | **NOT RUN** — no provider session request was made.                                                     |
| `git diff --check`                                                                                                                                  | **PASS** — exit code 0.                                                                                 |

## Phase 4 implementation addendum — 2026-10-18

The current frontend no longer invokes the custom `/api/video/session/init`,
`/api/video/session/start`, or `/api/video/avatar/speak` flow. Those REST calls
remain unverified against the provider contract; the start/end control paths
also do not consistently establish ownership of a supplied provider session.
The AI Doctor page keeps its authenticated consultation and transcript flow
available and labels the optional avatar unavailable until a verified,
approved-response flow exists. Camera access and browser speech recognition
are no longer requested automatically when a consultation starts.

The official pages were rechecked:

- [JavaScript SDK authentication](https://docs.trugen.ai/docs/sdks/javascript/authentication)
  documents server-side API-key authentication, `POST
https://api.trugen.ai/v1/auth/conversation`, `X-API-Key`, and a short-lived
  client session token.
- [Production guidance](https://docs.trugen.ai/docs/sdks/javascript/production)
  says session tokens expire after five minutes by default and recommends
  requesting a fresh token per user session.
- [Basic usage](https://docs.trugen.ai/docs/sdks/javascript/reference/basic-usage)
  documents `createClient({ token })`, connection through `session.connect()`,
  and cleanup using `session.disconnect()`.
- [Event handling](https://docs.trugen.ai/docs/sdks/javascript/reference/event-handling)
  says to register SDK listeners before connection and documents agent-speaking
  and connection lifecycle events.
- [Realtime pipeline](https://docs.trugen.ai/docs/agents/pipeline) describes
  provider-managed STT, LLM, TTS, and avatar rendering. It does not document
  suppressing the provider-managed LLM while speaking only Sehat AI-approved
  backend text.

No SDK was installed. No backend session-token endpoint was added, no provider
request was made, and configured environment values were not displayed or
used. Approved-reply speech remains **UNVERIFIED**. The safe current outcome
remains **F — text consultation with an unavailable optional avatar**;
integration is not claimed.

## Phase 4B verification — 2026-10-18

The official documentation was rechecked against the Phase 4B requirements:

- [JavaScript SDK authentication](https://docs.trugen.ai/docs/sdks/javascript/authentication)
  documents a server-side API-key exchange at
  `POST https://api.trugen.ai/v1/auth/conversation` using `X-API-Key`, which
  returns a temporary JWT for client connections. The documented default
  lifetime is five minutes. This provider token flow does not itself bind a
  token request to a Sehat AI user or consultation owner.
- [Realtime pipeline](https://docs.trugen.ai/docs/agents/pipeline) describes
  provider-managed STT, turn detection, LLM response generation, TTS, and
  avatar rendering. The reviewed page does not document disabling its LLM
  while speaking a Sehat AI-approved response.
- [Text to Video](https://docs.trugen.ai/docs/agents/text_to_video) documents
  passing a literal `script` for asynchronous avatar video generation. The
  accompanying [API reference](https://docs.trugen.ai/api-reference/endpoint/texttovideo)
  documents a server API-key request and generation ID; the feature is marked
  private preview. This is not a verified live conversational SDK/session
  flow, and this project has no approved reply field to supply as its script.
  It was not invoked.

The canonical transcript response still contains structured assessment fields
only; neither `assistantReply` nor another explicitly approved conversational
text field exists. The recommendations field is not a substitute. In addition,
the inspected in-process `backend/src/agents/safetyAgent.ts` uses a small
keyword list and a critical-risk check; the transcript's
`AIOrchestratorService` does not invoke that class or apply a medical-policy
filter to the returned recommendation strings. The separate safety-agent
project's existence does not establish that it gates this transcript response.
Accordingly, the repository does not establish the requested medication,
diagnosis, self-care, or emergency-response policy guarantees for generated
conversational content. No avatar speech or medical response was enabled.

**Phase 4B outcome: BLOCKED — avatar unavailable; text consultation retained.**
The next safe step is for the API owner to define and validate a Sehat AI-owned
approved-reply field and safety policy at the response boundary, and for the
provider owner to confirm a supported, owner-bound integration path. Only
after both are verified should a narrowly scoped implementation and tests be
considered. No provider calls, SDK installation, credentials inspection,
backend changes, or live tests were made for this verification.

## Final sprint implementation handover

This sprint kept the avatar unavailable: authenticated REST provider routes
return HTTP 503, and Socket.IO avatar events return an unavailable error. No
provider request, credential read, live connection, video stream, or avatar
speech test was performed. The project still has no installed TruGen browser
SDK; the reviewed documentation does not establish a supported approved-text-
only speech path or prove that the configured provider agent cannot generate
independent speech. Sehat AI therefore does not control every provider-spoken
response because no provider speech is enabled.

Socket.IO now verifies the access JWT during connection, uses its subject as
the user identity, and checks consultation ownership before joining or
processing consultation-bound events. The browser sends its existing access
token in the socket auth handshake and removes socket listeners on disconnect.
Unit tests cover JWT extraction/rejection and the pure avatar-unavailable
response; live socket/database authorization was not tested.

The dashboard's invented risk/activity values were removed. The report page
shows only the authenticated user's report-list metadata and does not display
AI-generated report content as reviewed medical advice. These UI/backend paths
were built and type-checked only to the extent noted in the final sprint report;
no authenticated database-backed browser test was available.

The text route remains `POST /api/video/transcript`. Its backend boundary rejects
unattributed recommendations and incompatible workflow output rather than
loosening the risk, confidence, or symptom-provenance checks. The active `/process`
producer still lacks an authoritative compatible contract, so real AI
consultation success remains blocked pending API-owner decisions. Automated
checks verify software behavior only and are not evidence of clinical validity.

### Verification snapshot

- `npm --prefix backend test`: passed; backend TypeScript build and 19 tests.
- Focused frontend contract/workflow tests: passed; 14 tests.
- `npm --prefix frontend run build`: passed with existing large-chunk and
  dependency warnings.
- Frontend TypeScript check: still fails at the unrelated
  `frontend/src/routes/index.tsx:249` `shadow`/`TargetAndTransition` error.
- Focused frontend lint/format checks pass for the changed pages, API client,
  and tests. Socket-client lint passes with the existing `no-explicit-any` rule
  suppressed; the file has 17 legacy explicit-`any` findings without that
  suppression. New backend boundary/helper/test formatting passes; a broad
  Prettier check over modified legacy backend files still reports formatting
  differences, so no repository-wide reformat was applied.
- `git diff --check` passes. Local HTTP probes to ports 5000, 8000, 4000, and
  5173 all returned connection refused; no authenticated HTTP or browser test
  was possible.

## TruGen-first sprint verification — 2026-10-18

The official TruGen documentation was rechecked during this sprint:

- [JavaScript SDK authentication](https://docs.trugen.ai/docs/sdks/javascript/authentication)
  documents a server-side `POST https://api.trugen.ai/v1/auth/conversation`
  request using `X-API-Key` and `{ agentId }`, returning a short-lived token.
- [JavaScript SDK basic usage](https://docs.trugen.ai/docs/sdks/javascript/reference/basic-usage)
  documents `@trugen/js-sdk`, `createClient({ token })`, `session.connect()`,
  WebRTC streams, and `session.disconnect()`.
- [Realtime pipeline](https://docs.trugen.ai/docs/agents/pipeline) describes
  provider-managed STT, LLM, TTS, and avatar rendering. It does not document
  disabling independent LLM responses while speaking only Sehat AI-approved
  text.

One bounded request to the documented token endpoint was made using local
configuration: HTTP 200 with a token present in the response. Neither the
credentials, agent identifier, response body, nor token were logged or saved.
No second provider request was made. This verifies authentication/token
issuance only; it does not verify an SDK connection, session ownership, video,
audio, or speech.

The authenticated `/api/trugen` routes and `/api/video` avatar/session/speech
routes remain unavailable, and the AI Doctor page retains its explicit text
consultation fallback. No SDK was installed. The selected outcome remains
**fallback**: until TruGen documents and verifies a way to suppress its
provider-managed LLM and speak only an exact approved backend response, no
provider session token is exposed to the browser and no avatar speech is
enabled.

Sprint checks: `npm --prefix backend test` passed (build and 25/25 tests);
`npm --prefix frontend test` passed (14/14 tests); `git diff --check` passed.
