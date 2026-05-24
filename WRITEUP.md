# Wati Automation Builder Copilot — Take-home Write-up

> AI-assisted design and pre-launch validation for Wati chatbot automations.
> Full product spec → [PRODUCT.md](./PRODUCT.md) · How to run → [README.md](./README.md) · API contract → [docs/data-model.md](./docs/data-model.md) · Demo script → [DEMO.md](./DEMO.md)

---

## What I built

Plain English in, validated Wati flow out. The Copilot sits **upstream of publish** —
operators describe an automation; the Copilot generates, explains, reviews, and lets them
walk through a deterministic mock conversation before any flow reaches a live channel.

**Four capabilities** — **Generate** (prompt → typed `Flow`), **Explain** (markdown
summary), **Review** (hybrid structural + semantic issues with severities and
click-to-highlight on the graph), **Test Chatbot** (multi-turn FSM simulation in a
floating widget). All on Zod contracts shared across server + web + LLM-output parsing,
covered by 554 automated tests (73 shared / 225 server / 256 web).

**Seven REST endpoints** ([docs/data-model.md](./docs/data-model.md)):

```
POST /api/flows/generate              POST /api/flows/:id/simulate/start
GET  /api/flows/:id                   POST /api/simulate/:sessionId/step
POST /api/flows/:id/explain           POST /api/simulate/:sessionId/reset
POST /api/flows/:id/review
```

---

## Architecture decisions

1. **Design-time AI, runtime deterministic.** Generate / explain / review call the LLM;
   the simulation FSM never does. → Reproducible demos, no hallucinated runtime branches.
2. **Hybrid review (rules + LLM).** Structural validator owns correctness (broken edges,
   orphan nodes, schema violations, missing fallback); the LLM adds judgment (vague copy,
   ambiguous branches). Findings merge by severity with structural wins on conflict. On
   model outage the endpoint still returns 200 with the structural findings plus one
   `info` issue — never a 502. → Rules can't be hallucinated; the model can't break the
   contract.
3. **`LLMProvider` interface, DeepSeek default.** Every LLM call goes through one ~30-line
   abstraction; `MockLLMProvider` already exercises that seam end-to-end in CI. Adding
   OpenAI / Anthropic is a new adapter + env flag, zero changes to agents / executor /
   review. → A multi-vendor eval harness is an afternoon's work, not a refactor.
4. **Single Zod schema in `packages/shared`.** One `FlowSchema` parses LLM output,
   validates HTTP requests, types the React store, and pins fixtures. `graph/` and
   `executor/` subtrees are barred from importing `llm/` via ESLint `no-restricted-imports`.
   → One change site; impossible drift between server, web, validator, and prompts.

---

## Demo

**📺 Walkthrough** — _[5-minute video](#)_ <!-- TODO: replace # with final Loom / YouTube / Drive URL before submission -->

**What you'll see in 5 minutes:**

1. Plain-English prompt → typed `Flow` rendered as Wati-style node cards in under a second.
2. The review pass surfacing both deterministic structural defects and LLM-flagged semantic risks, with click-to-highlight wiring straight back to the offending node.
3. The same flow walked end-to-end in the Test Chatbot widget, including a fallback retry and a `reset` mid-conversation — all driven by the server-side FSM, no client-side guesswork.

[DEMO.md](./DEMO.md) is the paste-ready storyboard the recording follows; optional
stills live under [demo/screenshots/](./demo/screenshots/).

---

## Cursor + AI collaboration

Built with a small "agile micro-team" workflow I drove through Cursor:
**BA → UX → TL → Dev → QA**, each invoked per feature via the
[`agile-micro-team` skill](./.cursor/skills/agile-micro-team/SKILL.md).

| What I designed                                  | What Cursor accelerated                            |
| ------------------------------------------------ | -------------------------------------------------- |
| Architecture, module bounds, invariants          | TypeScript / pnpm monorepo scaffolding             |
| `FlowExecutor` FSM + branch resolution semantics | Fastify plugin wiring and Zod boilerplate          |
| Validator rules + severity merge / dedup logic   | Agent prompt drafts and iteration loops            |
| API contract and data model                      | React Flow / panel skeletons and CSS polish        |
| Test strategy (unit / integration / smoke)       | First-pass test cases I then audited and tightened |

Every architectural call and every invariant (executor never imports `llm/`, one schema,
env-driven config, no secrets logged) is mine — I read, edited, rejected, or accepted
every Cursor-generated diff before it landed. The micro-team workflow earned its keep by
forcing me to **articulate failure modes explicitly** before implementation: the review
endpoint's "LLM outage → one `info` issue, never a 502" contract, the executor's ESLint
boundary against importing `llm/`, the `MockLLMProvider` seam — each came out of a TL /
QA pass naming an invariant I'd otherwise have left implicit, then a Dev / QA pair
codifying it as a test.

---

## Known limitations (deliberate scope cuts)

- **In-memory storage, no eviction** — flows + sessions live in process RAM and are
  lost on restart. Persistence is V2 work.
- **No auth, no rate limit** — all routes are public on `:3000`. Acceptable for the
  local-only MVP; `@fastify/rate-limit` + auth before any external exposure.
- **No streaming** — `explain` / `generate` return a single chunk; streaming is
  isolated to the agent + endpoint when added.
- **`api_call` is stubbed at runtime** — executor logs the intent and continues;
  no outbound HTTP fires.
- **Editing happens by regeneration** — the React Flow graph is read-only by design;
  iteration is "refine the prompt, re-generate", not direct manipulation.
- **No per-session step lock** — two parallel `POST /step` calls on the same session
  race; trivial async-mutex fix deferred.

---

## V2 roadmap

- **Wati API integration** — publish approved flows straight to a Wati workspace.
- **Drag-and-drop editor** — alongside (not replacing) prompt-driven generation.
- **Persistent flow library + versioning** — Postgres + named flows + diff view.
- **Multi-tenant + auth** — workspace scoping, API keys, audit log.
- **Streaming** — token-stream the Explain panel; partial-progress UI for Generate.
- **Multi-provider eval harness** — OpenAI + Anthropic adapters behind the existing
  `LLMProvider` interface, with an A/B harness for generation-quality comparisons.
