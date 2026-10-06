# pie-jev architecture specification

**Status:** Proposal. Implementation-ready after the validation gates in this document pass.
**Date:** 2026-02-22
**Purpose:** Add a Pi provider/model integration so `pie-ez-pass` can use OpenRouter TypeSafe JEV model `typesafe/jev-1.13` through OpenRouter's nonstandard alpha Decisions endpoint.

## 1. Executive summary

`pie-jev` is a Pi extension, not a replacement for `pie-ez-pass`. It registers one provider and one model. The provider owns the nonstandard HTTP request/response adapter. `pie-ez-pass` remains the policy owner, tool-call hook, permanent-rule evaluator, human confirmation boundary, and fail-closed decision point.

The provider receives the existing reviewer prompt and returns a normal Pi `AssistantMessage` whose text is the existing strict assessment object: `ACCEPT` or `ESCALATE`, plus rationale. No JEV output may directly approve a tool call. Every malformed, ambiguous, unavailable, or cancelled result becomes an escalation at the `pie-ez-pass` boundary.

**Hard boundary:** the OpenRouter Decisions request and response schema is not established by the installed Pi documentation or this repository. Do not infer it from Chat Completions, Responses, or JEV marketing material. The unknowns are explicit validation gates below.

## 2. Scope

### In scope

- Register provider identifier `openrouter-jev` and model identifier `typesafe/jev-1.13` with Pi.
- Resolve OpenRouter credentials using Pi's provider authentication contract.
- Translate the existing `pie-ez-pass` reviewer assessment input into the Decisions API request.
- Translate a Decisions result into the existing `AssistantMessage`/assessment contract.
- Support request timeout, cancellation, bounded retries, and safe error classification.
- Preserve `pie-ez-pass`'s local human confirmation and fail-closed behaviour.
- Provide configuration, validation, privacy controls, telemetry, tests, rollout, and rollback guidance.

### Non-goals

- Changing `pie-ez-pass` policy, permanent rules, prompts, transcript limits, or human UI.
- Adding an autonomous permission authority or session-wide approvals.
- Treating JEV confidence as permission without policy validation.
- Supporting arbitrary OpenRouter models or generic chat traffic in the first release.
- Persisting prompts, tool inputs, transcripts, rationales, or secrets.
- Implementing a guessed Decisions API schema.
- Making Decisions endpoint availability a prerequisite for ordinary Pi startup.

## 3. Existing contracts to preserve

From `pie-ez-pass` source:

- Reviewed tools: `bash`, `edit`, `write`.
- Reviewer input fields include request ID, source, message, tool call ID/name, path, command, target, tool input preview, surface, value, and session metadata.
- Reviewer prompt contains the rendered transcript and a JSON permission request. Evidence is explicitly untrusted.
- Output parser accepts a strict object with `outcome` equal to `ACCEPT` or `ESCALATE`, and non-empty rationale of at most 4,000 characters.
- Reviewer calls Pi `Provider.streamSimple`, with `maxRetries: 0`, at most 1,000 output tokens, configured timeout, abort signal, and optional reasoning.
- Any provider, authentication, model, parsing, timeout, cancellation, or internal failure returns escalation.
- `ACCEPT` returns an empty tool-call result. `ESCALATE` invokes local confirmation; without UI it blocks.
- Existing retries are bounded: three attempts by default, with 250 ms and 1,000 ms delays.

`pie-jev` must satisfy the same provider-facing contract. It must not bypass `parseReviewAssessment` or manufacture acceptance after an API error.

## 4. Architecture

```text
Pi extension loader
        |
        v
 pie-jev factory ----------------------+
   | registerProvider                   |
   | provider auth/model                |
   | lifecycle cleanup                  |
   v                                    |
Pi ModelRegistry                         |
   | provider: openrouter-jev            |
   | model: typesafe/jev-1.13            |
   v                                    |
pie-ez-pass config ----------------> reviewer
                                      |
                         build policy + transcript prompt
                                      |
                         Provider.streamSimple(model, context, options)
                                      |
                                      v
                           pie-jev stream adapter
                             | validate request contract
                             | map to Decisions request
                             | fetch / alpha endpoint
                             | parse/validate response
                             | map to AssistantMessage
                                      |
                                      v
                         parseReviewAssessment
                                      |
                         ACCEPT or ESCALATE
                                      |
                 local confirmation / fail closed
```

Data flow is one-way. `pie-jev` does not call `ctx.ui`, inspect tool events, alter permanent rules, or decide human approval.

## 5. Load and configuration architecture

### Load modes

The extension factory registers the provider synchronously. It must not make a network request or start a watcher during factory execution. This follows Pi's extension guidance: long-lived or blocking resources start at `session_start` or on demand and close at `session_shutdown`.

At `session_start`, the extension validates configuration and records session-scoped state. Configuration failure must leave the provider unavailable or return a provider error; it must never produce `ACCEPT`.

Provider registration must be available before `pie-ez-pass` resolves its configured provider/model. If load ordering cannot guarantee this, the installation contract must require both extensions to load in one Pi startup and the acceptance test must prove registry visibility before the first `tool_call`.

### Configuration precedence

- Global extension config: `~/.pi/agent/extensions/pie-jev/config.json`, or `$PI_CODING_AGENT_DIR/extensions/pie-jev/config.json`.
- Project config: `<cwd>/.pi/extensions/pie-jev/config.json` only for non-secret endpoint and behaviour overrides.
- Environment variables: credentials only. Do not put secrets in JSON.
- Project configuration cannot override the endpoint to an untrusted host unless an explicit opt-in exists in the final design.

Recommended default for `pie-ez-pass` when enabled:

```json
{
  "provider": "openrouter-jev",
  "model": "typesafe/jev-1.13",
  "reasoning": "low",
  "timeoutMs": 90000
}
```

### Proposed `pie-jev` config schema

This is a proposed contract, not a claim about an upstream schema. Implement with strict unknown-field rejection.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "endpoint": "<validated Decisions endpoint URI>",
  "apiKeyEnv": "OPENROUTER_API_KEY",
  "timeoutMs": 90000,
  "maxAttempts": 3,
  "retryDelaysMs": [250, 1000],
  "model": "typesafe/jev-1.13",
  "confidence": {
    "enabled": false,
    "minimum": 0.95,
    "missing": "escalate"
  },
  "privacy": {
    "sendTranscript": true,
    "sendToolInputPreview": true,
    "redactSecrets": true
  },
  "observability": {
    "enabled": true,
    "logBodyHashesOnly": true
  }
}
```

Schema rules:

| Field | Type and rule | Default | Safety rule |
|---|---|---:|---|
| `endpoint` | URI, HTTPS required except explicitly documented local test mode | validation gate | Reject unknown or non-allowlisted host. |
| `apiKeyEnv` | non-empty environment variable name | `OPENROUTER_API_KEY` | Never accept key literal in config. |
| `timeoutMs` | integer, 1..300000 | `90000` | Per whole review, including retries. |
| `maxAttempts` | integer, 1..3 | `3` | No unbounded retry. |
| `retryDelaysMs` | array of non-negative integers, max two entries | `[250,1000]` | Delay is within total deadline. |
| `model` | exact `typesafe/jev-1.13` in v1 | exact model | Reject arbitrary model IDs until supported. |
| `confidence.enabled` | boolean | `false` | Cannot weaken missing-confidence handling. |
| `confidence.minimum` | number 0..1 | `0.95` | Used only when API confidence is validated. |
| `confidence.missing` | exact `escalate` | `escalate` | No fail-open option. |
| privacy flags | booleans | true/true/true | `redactSecrets` cannot be disabled in production. |
| observability flags | booleans | true/true | Bodies are never logged. |

The `pie-ez-pass` config remains its current schema. Its `provider` and `model` select this provider/model. Its `timeoutMs`, `reasoning`, and `additionalPolicy` remain authoritative for review behaviour; duplicate `pie-jev` timeout settings must be reconciled explicitly during implementation. Recommended rule: effective timeout is the smaller positive value of the two, and attempts/delays come from `pie-jev`.

## 6. Pi provider and model registration contract

Use Pi's complete provider registration form because the endpoint is nonstandard and requires custom `streamSimple`. The installed Pi documentation supports `pi.registerProvider()` with a complete provider, native auth, model catalogue, and custom stream behaviour.

### Provider identity

- Provider ID: `openrouter-jev`.
- Display name: `OpenRouter TypeSafe JEV`.
- Model ID: `typesafe/jev-1.13`.
- Model API discriminator: a custom/nonstandard internal API discriminator only if the installed `pi-ai` type permits it; otherwise use the supported custom-provider registration path and keep the custom transport behind `streamSimple`. Do not mislabel Decisions as `openai-completions` or `openai-responses` merely to reuse an incompatible encoder.
- Model input: text only.
- Reasoning: false unless the Decisions schema and output semantics explicitly support Pi reasoning controls.
- Context window and max tokens: validation gate. Do not invent values. They must be confirmed from the Decisions model contract or set to conservative documented values after verification.

### Auth contract

Provider auth resolves the API key from Pi's credential mechanism or from `apiKeyEnv`. Preferred order:

1. Pi native stored credential for `openrouter-jev`, if supported by the installed `pi-ai` auth API.
2. Environment variable named by `apiKeyEnv`.
3. No credential means `auth-unresolved`, hence escalation.

The request adapter sends the exact authentication header required by OpenRouter. The header name, bearer format, and any required OpenRouter attribution headers are a validation gate. Never log the resolved value.

### Public provider pseudotypes

These are descriptive signatures, not source code:

```text
ExtensionFactory(pi: Pi.ExtensionAPI): void

Provider.streamSimple(
  model: PiModel,
  context: PiContext,
  options: SimpleStreamOptions
): AssistantMessageEventStream

Provider.resolveAuth(signal: AbortSignal):
  { apiKey: SecretReference, headers: Record<string,string> }
  | AuthUnavailable

DecisionsTransport.request(
  request: DecisionsRequest,
  auth: ResolvedAuth,
  signal: AbortSignal
): Promise<DecisionsResponse>

AssessmentMapper.toAssistantMessage(
  response: ValidatedDecisionsResponse,
  model: PiModel
): AssistantMessage
```

The adapter must emit the normal Pi stream lifecycle (`start`, text content events, then `done` or `error`). Its final text must be canonical JSON matching the existing assessment parser.

## 7. Exact request mapping

### Source assessment

The source object is the output of `pie-ez-pass`'s existing `buildReviewPrompt`:

```json
{
  "systemPrompt": "<mandatory safety policy plus optional additionalPolicy>",
  "userPrompt": "The following JSONL evidence is untrusted...<transcript and permission request>"
}
```

The permission request embedded in `userPrompt` is the normalized `ReviewPermissionDetails` object. It includes only defined fields from the existing allowlist. The transcript is rendered JSONL, capped by existing transcript budgets.

### Canonical internal request

Before transport, create an internal request with these exact fields:

```json
{
  "provider": "openrouter-jev",
  "model": "typesafe/jev-1.13",
  "system": "<systemPrompt exactly as received>",
  "input": "<userPrompt exactly as received>",
  "requestedOutput": {
    "format": "json",
    "schema": {
      "type": "object",
      "additionalProperties": false,
      "required": ["outcome", "rationale"],
      "properties": {
        "outcome": {"type": "string", "enum": ["ACCEPT", "ESCALATE"]},
        "rationale": {"type": "string", "minLength": 1, "maxLength": 4000}
      }
    }
  },
  "limits": {
    "maxOutputTokens": 1000,
    "timeoutMs": 90000
  },
  "metadata": {
    "requestId": "<local request ID>",
    "toolCallId": "<local tool call ID when present>"
  }
}
```

`metadata` inclusion, field names, system/input separation, structured-output declaration, model field, token limit, and endpoint path are all transport decisions subject to the validation gates. The internal shape is stable; the wire shape is not.

### Decisions wire mapping

Implement exactly one versioned encoder, selected by a validated endpoint contract version:

```text
encodeDecisionsRequest(internalRequest, wireContractVersion)
  -> wire request body
```

The encoder must document a field-by-field table containing: wire field, source field, transformation, omission rule, and evidence. It must not silently fall back to Chat Completions.

**Validation gates before implementation:**

1. Obtain the authoritative OpenRouter alpha Decisions endpoint URL and API version/header requirements.
2. Obtain an example request for `typesafe/jev-1.13`.
3. Confirm whether input is a string, messages array, typed decision object, or another structure.
4. Confirm system-policy support and whether system content is trusted separately from evidence.
5. Confirm structured output/schema support and exact schema syntax.
6. Confirm model identifier spelling and whether the endpoint expects a model alias or deployment ID.
7. Confirm token, reasoning, temperature, and confidence controls.
8. Confirm metadata support and whether request IDs must be sent in a specific header.
9. Confirm streaming versus non-streaming behaviour.
10. Confirm idempotency/retry semantics and whether retries can duplicate billable decisions.

Until all ten gates pass, the endpoint adapter is not releasable.

## 8. Output mapping

The adapter accepts only a response shape proven by the Decisions contract. It must validate HTTP status, content type, envelope, decision value, rationale, and optional confidence before constructing an assistant message.

Canonical mapping:

| Decisions result | Internal assessment text | Reviewer result |
|---|---|---|
| Valid decision `ACCEPT`, valid rationale, confidence policy satisfied | `{"outcome":"ACCEPT","rationale":"..."}` | `{ kind: "accept" }` |
| Valid decision `ESCALATE`, valid rationale | `{"outcome":"ESCALATE","rationale":"..."}` | `{ kind: "escalate" }` |
| Missing/invalid decision | no assessment | provider failure; escalate |
| Missing/invalid rationale | no assessment | invalid response; escalate |
| Confidence absent while enabled | no assessment | confidence failure; escalate |
| Confidence below threshold | canonical `ESCALATE` only if policy explicitly permits this deterministic mapping; otherwise failure | escalate |

Do not expose hidden reasoning or provider raw output to the user. Rationale is advisory and is truncated by the existing `pie-ez-pass` UI annotation limit of 600 characters.

**Unknown response facts are validation gates:** exact decision field, rationale field, confidence field/range, envelope, streaming event names, refusal/error representation, and whether a model can return a typed object must be verified against a real contract fixture.

## 9. Confidence, threshold, and fail-closed semantics

Current `pie-ez-pass` assessment schema has no confidence field. Therefore v1 defaults confidence enforcement to disabled while still requiring valid outcome and rationale. This is not permission to ignore confidence if the Decisions endpoint returns one.

When confidence is enabled and the API contract confirms a numeric confidence:

- Accept only numeric values in `[0,1]`.
- `ACCEPT` requires `confidence >= minimum`.
- Missing, nonnumeric, out-of-range, or untrusted confidence causes escalation.
- `ESCALATE` always escalates regardless of confidence.
- A threshold comparison must be deterministic and tested at exact boundary values.
- Never convert low confidence into `ACCEPT`.

All failures are fail-closed:

- provider absent or model absent -> escalation;
- missing key -> escalation;
- endpoint unavailable -> escalation;
- timeout/cancel -> escalation;
- non-2xx or malformed JSON -> escalation;
- unknown outcome -> escalation;
- policy/schema mismatch -> escalation;
- logging failure does not alter the decision.

## 10. Errors, timeouts, cancellation, and retries

Use one deadline for the entire review, including auth resolution, network request, response parsing, and retry waits. Combine the caller/session signal with the deadline signal. Pass the combined signal to every blocking operation.

Failure categories exposed to `pie-ez-pass` telemetry:

- `provider-unresolved`
- `model-unresolved`
- `auth-unresolved`
- `provider-error`
- `invalid-response`
- `confidence-failed`
- `timeout`
- `cancelled`
- `internal-error`

Retry only transient transport failures, subject to the total deadline. Do not retry invalid responses, authentication failures, policy violations, or cancellation. If Decisions semantics do not guarantee idempotency, disable retries until confirmed. Retry count is at most three.

Cancellation requirements:

- Abort the fetch and response body reader.
- Stop emitting stream events after cancellation.
- Clear timers and remove abort listeners.
- Do not wait for an uncooperative transport before returning escalation.
- A cancelled old reviewer generation must not replace or affect the current generation.

## 11. Auth and secrets

- Read the OpenRouter key through Pi auth or the configured environment variable.
- Never write keys to config, session files, telemetry, errors, or rationale.
- Redact credential-like assignments in diagnostic strings.
- Do not send unrelated environment variables.
- Use HTTPS and reject certificate errors. No TLS bypass.
- Do not accept endpoint URLs containing credentials.
- Restrict endpoint host to OpenRouter's documented host by default. Require explicit development-only opt-in for a test server.
- Treat transcript, commands, paths, file contents, and tool previews as sensitive. Send only what the existing reviewer prompt sends, subject to privacy flags and documented user consent.
- OpenRouter retention, training, regional processing, and logging terms are external dependencies and must be documented before production enablement.

## 12. Module/file layout

```text
pie-jev/
├── package.json
├── README.md
├── LICENSE
├── schemas/
│   └── config.schema.json
├── src/
│   ├── index.ts                 # Pi extension factory and registration
│   ├── config.ts                # strict config load/validation
│   ├── auth.ts                  # Pi/env credential resolution
│   ├── model.ts                 # fixed model/provider definitions
│   ├── decisions-contract.ts    # versioned validated wire contract types
│   ├── decisions-encoder.ts     # internal request -> wire request
│   ├── decisions-transport.ts   # fetch, deadline, cancellation, status
│   ├── decisions-decoder.ts     # wire response -> validated result
│   ├── stream-adapter.ts        # Pi AssistantMessageEventStream adapter
│   ├── assessment-mapper.ts     # result -> canonical assessment JSON
│   ├── redaction.ts             # privacy-safe metadata and diagnostics
│   └── observability.ts         # counters/events without bodies
└── test/
    ├── encoder.test.ts
    ├── decoder.test.ts
    ├── provider.test.ts
    ├── lifecycle.test.ts
    ├── cancellation.test.ts
    └── privacy.test.ts
```

No module may import `pie-ez-pass` internals at runtime. Integration is through Pi's provider contract and the documented reviewer prompt/assessment contract.

## 13. Extension lifecycle

1. Factory runs. Register provider/model. Do not perform network I/O.
2. Pi creates the model registry.
3. `session_start`: validate configuration, establish session state, and attach session abort handling.
4. `pie-ez-pass` resolves provider/model and invokes `streamSimple` for reviewed calls.
5. Adapter resolves auth and performs one bounded Decisions request.
6. Emit normal Pi stream completion or error. `pie-ez-pass` maps the result or escalates.
7. Configuration reload: construct a new validated generation; abort the old generation; publish the new one only after construction succeeds.
8. `session_shutdown`: abort in-flight calls, close resources, clear references, and emit no further events.
9. `/reload`: registration must be idempotent and must not leave stale providers or timers.

## 14. Observability and privacy

Allowed local events mirror `pie-ez-pass` review telemetry:

```json
{
  "event": "pie_jev.request",
  "requestId": "<opaque local ID>",
  "provider": "openrouter-jev",
  "model": "typesafe/jev-1.13",
  "attempt": 1,
  "durationMs": 412,
  "outcome": "ACCEPT|ESCALATE|ERROR",
  "errorCategory": "<category when applicable>",
  "requestBodyHash": "<optional one-way hash>",
  "responseBodyHash": "<optional one-way hash>"
}
```

Never record raw request/response bodies, transcript text, command/path values, API keys, headers, or provider reasoning. Hashes must use a per-installation salt if correlation across sessions is needed; otherwise omit hashes. Logging is best effort and cannot change permission outcomes.

Metrics: request count, accepted count, escalated count, failure category count, latency buckets, timeout count, cancellation count. Keep labels bounded; never use request content as a label.

## 15. Compatibility and assumptions

- Node.js `>=22.19.0`, matching `pie-ez-pass`.
- Pi packages are compatible with installed `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` versions. Pin/test the supported range.
- Pi supports complete custom providers and `streamSimple` as documented in installed `docs/extensions.md` and `docs/custom-provider.md`.
- `pie-ez-pass` continues to call the provider through `streamSimple` and parse text output.
- OpenRouter supports the named model and grants access to the alpha Decisions endpoint.
- The Decisions endpoint supports a reviewer prompt and a deterministic structured decision, subject to validation.

External assumptions requiring evidence: endpoint URL/path, authentication headers, request schema, response schema, streaming protocol, model capability limits, confidence semantics, rate limits, billing, retention, and retry idempotency. Record evidence and contract version in `decisions-contract.ts` and README before release.

## 16. Test matrix

| Area | Cases | Required result |
|---|---|---|
| Registration | provider/model visible; duplicate load; missing key | visible once; no duplicate; unavailable -> escalation |
| Config | defaults; unknown fields; invalid endpoint; timeout bounds; project precedence | strict validation; unsafe config rejected |
| Auth | Pi credential; env key; missing key; malformed key | resolved without logging; missing -> escalation |
| Encoder | bash/edit/write; optional fields; transcript omission; additional policy | exact fixture mapping; no unintended fields |
| Decoder | valid ACCEPT; valid ESCALATE; malformed JSON; unknown outcome; long rationale | only valid assessment accepted |
| Confidence | disabled; exact threshold; below; missing; out-of-range | threshold semantics deterministic; never fail open |
| Transport | 2xx; 4xx; 401; 429; 5xx; invalid content type; body read failure | correct categories; bounded retry only where allowed |
| Timing | deadline during auth, request, parse, backoff | timeout -> escalation; timers cleared |
| Cancellation | caller abort; session shutdown; reload abort | prompt abort; no late events; old generation isolated |
| Pi stream | start/text/done; error/aborted; empty output | valid event ordering; reviewer receives parseable JSON only on success |
| Integration | `pie-ez-pass` ACCEPT; ESCALATE with UI; no UI; permanent allow/block | existing semantics unchanged |
| Privacy | secret-like command, path, transcript, headers, error | no raw sensitive data in logs |
| Lifecycle | startup without session; session start/shutdown; `/reload` | no background leaks; idempotent cleanup |
| Contract gates | recorded live/fixture request and response | release blocked until all unknowns verified |

Use deterministic mocked transport tests. Add one opt-in integration test against a disposable credential and approved endpoint. Do not put a live key in CI.

## 17. Acceptance criteria

1. `pie-ez-pass` can select `openrouter-jev` / `typesafe/jev-1.13` without source changes to its policy boundary.
2. A valid Decisions response maps to the exact existing assessment schema and produces the expected reviewer verdict.
3. Every listed failure mode escalates or blocks according to existing `pie-ez-pass` behaviour.
4. No guessed wire schema remains: all validation gates have evidence-backed fixtures.
5. Provider registration, auth, timeout, cancellation, and cleanup pass the test matrix.
6. No test or production log contains credentials or raw reviewer evidence.
7. Typecheck, unit tests, build, and an integration smoke test pass on supported Node/Pi versions.
8. The package preserves the pie-ez-pass MIT attribution when distributed alongside or adapted from it.

## 18. Rollout and rollback

### Rollout

1. Implement behind an opt-in configuration; retain `openai-codex` as the default.
2. Validate the Decisions contract with captured, consented fixtures. Do not capture secrets.
3. Run unit, integration, privacy, cancellation, and live smoke tests.
4. Enable for one user/session. Compare escalation and failure rates with the existing reviewer.
5. Expand only after latency, error rate, false acceptance, and false escalation review.
6. Keep a documented contract version and endpoint allowlist.

### Rollback

- Set `pie-ez-pass.provider` and `model` back to their prior values.
- Disable/unload `pie-jev`; existing sessions must abort in-flight calls and fail closed.
- If endpoint or model behaviour changes, immediately remove the provider registration or block its model ID.
- Preserve local permission logging; do not delete evidence needed for incident review.
- Roll back the package and configuration independently. Never roll back to a version that bypasses human confirmation.

## 19. Validation gates register

These facts are intentionally unknown and must be resolved before implementation is declared complete:

- authoritative Decisions endpoint URL and version;
- complete request JSON and required headers;
- complete response JSON and streaming/event protocol;
- exact auth and OpenRouter attribution requirements;
- JEV model availability, context/output limits, and reasoning controls;
- structured output and confidence field semantics;
- rate limits, billing, retention, and training use;
- retry idempotency and request correlation rules;
- Pi custom API discriminator requirements for this installed version.

Evidence must be an authoritative OpenRouter specification, provider response fixture, or approved support confirmation. A plausible field name, inferred endpoint, or Chat Completions analogy is not evidence.

## Revision Log

- 2026-02-22: Initial implementation-ready architecture. Preserved `pie-ez-pass` contracts, specified a custom Pi provider boundary, and marked all unverified Decisions API facts as release-blocking validation gates.
