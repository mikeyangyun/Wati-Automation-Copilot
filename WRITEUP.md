# Wati Automation Builder Copilot — Write-up

> Plain English → reviewed Wati flow → walked end-to-end in a mock simulator, all before publish.
> 📺 **5-min walkthrough:** [video](#) <!-- TODO: replace # with final Loom / YouTube / Drive URL --> · [storyboard](./DEMO.md)
> Spec: [PRODUCT.md](./PRODUCT.md) · Run: [README.md](./README.md) · Architecture: [docs/architecture.md](./docs/architecture.md) · API & data model: [docs/data-model.md](./docs/data-model.md)

## Problem and MVP scope

Wati operators build chatbot flows node-by-node — fast for experts, slow for new hires. The Copilot sits **upstream of publish**: an operator describes the automation in plain English, gets back a validated flow, sees what it does, what's wrong with it, and walks it end-to-end in a mock chat — without touching the canvas.

**In scope:** four surfaces — **Generate** (prompt → typed `Flow`), **Explain** (markdown), **Review** (hybrid structural + semantic issues with click-to-highlight on the graph), **Test Chatbot** (multi-turn FSM simulation in a floating widget). Read-only graph by design — iteration is "refine the prompt, regenerate". **Out of scope (deliberate):** drag-edit, persistence, publishing to Wati, auth, streaming — V2 line items, none of them unlocks the demo's value prop.

## Architecture and key design decisions

TypeScript pnpm monorepo: **`shared`** (one Zod schema, types, fixtures) · **`server`** (Fastify, executor FSM, agents, validator, simulator) · **`web`** (Vite + React Flow + Zustand). **7 REST endpoints**, in-memory store, **589 tests** (73 / 257 / 259). CI gate covers typecheck / lint / test / build + an in-process simulation smoke harness.

**Request lifecycle (Generate):** `prompt → FlowAgent → LLM → Zod parse + capped retry → structural validator → in-mem store → typed response`. Full Mermaid sequence diagrams for Generate / Explain + Review / Simulate, plus an entity-relationship overview, live in [docs/architecture.md](./docs/architecture.md).

1. **Design-time AI, runtime deterministic.** Generate / explain / review call the LLM; the simulation FSM never does → reproducible demos, no hallucinated runtime branches.
2. **Hybrid review (rules + LLM).** Structural validator owns correctness (broken edges, orphan nodes, missing fallback); LLM adds judgment (vague copy, ambiguous branches). Findings merge by severity, structural wins on conflict. On LLM outage the endpoint still returns 200 with one `info` issue — never a 502.
3. **`LLMProvider` interface.** Every model call goes through one ~30-line abstraction; DeepSeek default, `MockLLMProvider` exercises that seam end-to-end in CI. New vendor = new adapter + env flag, zero changes to agents / executor / review.
4. **Single Zod schema in `shared`.** Parses LLM output, validates HTTP, types the React store, pins fixtures. `graph/` and `executor/` are ESLint-barred from importing `llm/`. One change site; impossible drift.

## How I used Cursor, AI, or agents

An "agile micro-team" workflow driven through Cursor: **BA → UX → TL → Dev → QA**, invoked per feature via the [`agile-micro-team` skill](./.cursor/skills/agile-micro-team/SKILL.md). The point isn't role-play — it's forcing explicit acceptance criteria (BA), invariants (TL), and failure modes (QA) **before** Dev writes code, so each diff is reviewable against named contracts. Cursor accelerated scaffolding, Fastify wiring, panel skeletons, first-pass tests, prompt iteration. I drove architecture, module boundaries, invariants, contract design, every diff sign-off.

## What I reviewed manually

- **Every Cursor-generated diff before commit** — accepted, edited, or rejected. No raw "AI output" commits.
- **LLM output handling.** Zod parses everything; malformed output triggers a capped retry; structured `LLM_INVALID_OUTPUT` / `LLM_UNAVAILABLE` errors map to documented HTTP responses. Output is typed before it touches the executor — no prompt-injection runtime path.
- **Failure modes named before code.** "Review outage → info, never 502", "executor never imports `llm/`" (ESLint-enforced), "no secrets logged" (Zod-validated env + error-mapper redaction).
- **Observability — and how it paid.** Fastify pino with a request-scoped logger; the simulator emits structured step traces, and `DeepSeekProvider` logs `elapsedMs / finish_reason / reasoning_tokens` per call. **Concrete payoff:** during demo prep `generate` started timing out at 60 s. Instead of bumping the timeout I `curl`'d the API directly — found `reasoning_tokens: 1853` on `deepseek-v4-pro`, confirming the "Pro" tier is a reasoning model (like OpenAI o1) burning 1500+ silent tokens before any visible JSON. Swapped to `deepseek-chat`: **40 s → 3.4 s, same prompt, same network**. Added a permanent `reasoning_tokens > 0` warn in the provider so a future env swap surfaces in the first request, not a bug report. The simulator's step traces let me reproduce a failed end-to-end run from stdout without re-instrumenting.
- **Test design.** 589 tests are mine in shape — Cursor drafted cases, I tightened invariants, added the structural-vs-semantic interaction tests, and the in-process simulation smoke harness (`pnpm --filter server simulation-smoke`).

## Trade-offs and V2

| Deliberate trade-off                   | Why now                             | V2                                                |
| -------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| In-memory store, no eviction           | Demos don't need durability         | Postgres + named flows + diff view                |
| No auth / rate limit                   | Local-only MVP on `:3000`           | `@fastify/rate-limit` + workspace scoping + audit |
| Read-only graph                        | Keeps the prompt the single source  | Drag editor alongside (not replacing) prompts     |
| No streaming on `generate` / `explain` | Single chunk is simpler to validate | Token-stream Explain; partial-progress Generate   |
| DeepSeek only                          | Keep eval cheap during the build    | OpenAI + Anthropic adapters + A/B harness         |

**Bigger bet.** Wati API publish integration so a reviewed flow can ship straight to a workspace — closing the loop this MVP intentionally stops one step short of. Minor deferrals (`api_call` stubbed, no per-session step lock, no eviction) are tracked in [README.md](./README.md); each is a sub-day fix that wouldn't change the architecture above.
