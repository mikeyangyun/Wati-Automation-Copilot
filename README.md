# Wati Automation Builder Copilot

> AI-assisted design and pre-launch validation for Wati chatbot automations.

---

## Status

**Feature complete.** All product surfaces are implemented end-to-end and covered by 418 automated tests:

- **Generate** — `FlowAgent` turns a natural-language prompt into a Zod-validated `Flow`.
- **Mock simulation** — deterministic FSM executor with branch matching, retries, fallback, handoff, and reset.
- **Explain** — markdown-rendered summary of how a flow behaves.
- **Hybrid review** — structural rules + semantic LLM analysis, merged by severity, with graceful degradation when the LLM is unavailable.
- **Read-only graph** — auto-laid-out React Flow rendering with `Graph` / `JSON` toggle, type-coded nodes, condition labels, and issue → node highlight on click.

For the product specification, see [PRODUCT.md](./PRODUCT.md).

---

## Quick Start

**Prerequisites**

- Node `>=20` (project pins Node 22 LTS via `.nvmrc`)
- pnpm `>=9` (project pins `pnpm@11.1.2` via `packageManager`)

**Install and run**

```bash
nvm use                                                # reads .nvmrc
pnpm install
cp packages/server/.env.example packages/server/.env   # see below for LLM config
pnpm dev                                               # server on :3000, web on :5173
```

**LLM configuration**

The default `.env.example` ships with `LLM_PROVIDER=deepseek`. Pick one of:

- **Use the mock provider** (no API key, deterministic, recommended for first run): set `LLM_PROVIDER=mock` in `packages/server/.env`. Generate / Explain / Review will return canned responses.
- **Use a real DeepSeek key**: set `LLM_API_KEY=sk-...` in `packages/server/.env`.

**Verify**

```bash
curl http://localhost:3000/health
# -> { "status": "ok", "uptime": ..., "timestamp": "..." }
```

Open <http://localhost:5173>. The three-panel UI loads:

- **Left** — prompt input with starter examples.
- **Center** — generated flow (graph by default; toggle to JSON), with **Explain** / **Review** actions.
- **Right** — mock chat that auto-starts a simulation as soon as a flow is ready.

**Other scripts**

| Command                                 | What it does                                |
| --------------------------------------- | ------------------------------------------- |
| `pnpm test`                             | Run Vitest across all packages              |
| `pnpm typecheck`                        | Run `tsc` across all packages               |
| `pnpm lint`                             | Run ESLint across the repo                  |
| `pnpm format`                           | Run Prettier in write mode                  |
| `pnpm build`                            | Build all packages                          |
| `pnpm --filter server simulation-smoke` | Run the in-process simulation smoke harness |

---

## Overview

**Wati Automation Builder Copilot** lets operators describe a chatbot automation in plain English and turns it into a Wati-compatible flow. The system explains the resulting logic, reviews it for defects and gaps, and runs a deterministic mock conversation so the design can be walked through before any flow is published.

The Copilot sits **upstream of publish** — design and validate first, then configure the approved flow in the Wati Builder.

**Primary users:** customer operations and CS leads, plus small business owners configuring routing and FAQ bots.

---

## Scope

| In scope (MVP)                                     | Out of scope (MVP)                  |
| -------------------------------------------------- | ----------------------------------- |
| Natural-language input with starter examples       | Drag-and-drop visual editor         |
| Generation of a Wati-style flow from a brief       | Publish or deploy to live channels  |
| Read-only node graph + structured flow view        | Wati API / WhatsApp integration     |
| AI: generate, explain, review                      | Accounts, login, saved workflows    |
| Multi-turn mock simulation with fallback and reset | Persistent storage and flow library |
| Hybrid review (structural + AI semantic)           | AI-authored runtime chat replies    |

See [PRODUCT.md](./PRODUCT.md) for full details and rationale.

---

## Design Principles

### Product & architecture

1. **Design-time AI only.** Generate / explain / review use the LLM. Simulation is deterministic.
2. **Hybrid review.** Code catches structural defects; the LLM catches semantic ones. Findings merge with severity.
3. **Single source of truth.** One flow drives the graph, the structured view, and the executor.
4. **Shared schema.** One Zod type for backend, frontend, and LLM output.

### Engineering

5. **SOLID.** Modules depend on interfaces (`LLMProvider`), not vendor SDKs.
6. **Unified configuration.** All tunables in one env-driven layer; no scattered constants.
7. **Minimise external calls.** Stored flows are reused across endpoints; retry is bounded.
8. **Defence in depth.** Validate inputs, constrain LLM outputs, keep secrets server-only, log metadata not content. See [.cursor/rules/security.mdc](./.cursor/rules/security.mdc).

---

## Design Decisions

| Decision                                               | Rationale                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| TypeScript monorepo (over Python or polyglot)          | Shared Flow types and Zod schema across server + web + validation                 |
| In-memory storage only                                 | MVP is single-session; persistence is out of scope                                |
| `LLMProvider` interface; DeepSeek as the default       | Swap models without changing agent code; provider chosen via env                  |
| Read-only React Flow graph (no editing canvas)         | Operators describe intent in prompts; flow changes happen by regeneration         |
| Deterministic FSM executor (not LLM-driven simulation) | Reproducible mock chat; review and demo behavior are predictable                  |
| Hybrid review (rules + LLM)                            | Structural rules cannot be hallucinated; the model adds judgment, not correctness |

---

## Tech Stack

| Layer      | Choice                                               | Reason                                                |
| ---------- | ---------------------------------------------------- | ----------------------------------------------------- |
| Language   | TypeScript                                           | Shared types across backend, frontend, and validation |
| Monorepo   | pnpm workspaces (`shared` / `server` / `web`)        | One repo, one schema                                  |
| Backend    | Fastify                                              | Lightweight JSON API                                  |
| Frontend   | React + Vite + `@xyflow/react`                       | Standard SPA with read-only flow graph                |
| Validation | Zod                                                  | One source of types for API and LLM output            |
| LLM        | DeepSeek `deepseek-chat` via `LLMProvider` interface | Provider-agnostic; DeepSeek is the default adapter    |

---

## Project Structure

```
Wati-Automation-Copilot/
├── packages/
│   ├── shared/                # Zod schema + shared TS types (Flow, Issue, SimulationEvent, …)
│   ├── server/                # Fastify API, agents, executor, structural validator, store
│   └── web/                   # React + Vite three-panel UI (read-only graph, chat, issue list)
├── docs/
│   ├── architecture.md        # Runtime sequence diagrams
│   └── data-model.md          # Entity fields + REST reference
├── .cursor/rules/             # Security and engineering rules
├── PRODUCT.md                 # Product specification
├── README.md
└── LICENSE
```

Three workspace packages share one Zod schema. The `graph/` subtree in `web` and `validator/` + `executor/` subtrees in `server` are LLM-free by design — enforced via ESLint `no-restricted-imports`.

---

## Architecture

### Module overview

```mermaid
flowchart TB
    subgraph web [packages/web]
        ui[Three-panel UI]
    end

    subgraph server [packages/server]
        routes[HTTP routes]
        flowAgent[FlowAgent]
        reviewAgent[ReviewAgent]
        validator[Structural validator]
        executor[FlowExecutor FSM]
        store[InMemoryStore]
        llm[LLMProvider]
    end

    subgraph shared [packages/shared]
        schema[Zod schema and types]
    end

    ui -->|REST| routes
    routes --> flowAgent
    routes --> reviewAgent
    routes --> executor
    routes --> store
    flowAgent --> llm
    reviewAgent --> llm
    reviewAgent --> validator
    executor --> store
    flowAgent -.-> schema
    reviewAgent -.-> schema
    executor -.-> schema
    validator -.-> schema
    llm --> llmExt[LLM provider API]
```

Three packages share one Flow schema. Agents and the executor depend on the schema; the executor never imports the LLM layer.

### Runtime flows

- **Generate** — `FlowAgent` calls the `LLMProvider`, validates the response against the Zod schema (one retry on failure), and stores the flow.
- **Explain & review** — both load the stored flow. `explain` is LLM-only. `review` runs the structural validator and the `ReviewAgent` in parallel and merges findings by severity.
- **Simulate** — the deterministic FSM executor walks the flow; the LLM is never called during a step.

See [docs/architecture.md](./docs/architecture.md) for the full sequence diagrams.

---

## Data Model & API

Two resources: **Flow** (the generated automation, with nodes and edges) and **Simulation** (a session walking through a flow). Review findings come back as typed issues with severity.

See [docs/data-model.md](./docs/data-model.md) for entity fields, REST endpoints, request/response examples, status codes, and the shared error shape.

---

## Known Limitations

Scope cuts that were deliberate, not oversights:

- **In-memory storage with no eviction.** Generated flows and simulation sessions live in process RAM; they are lost on restart and accumulate over the process lifetime. Persistence and TTL are V2 work.
- **No rate limiting or authentication.** All API routes are public on the listening port. Acceptable for the local-only MVP; add `@fastify/rate-limit` and an auth layer before exposing the server.
- **No per-session step lock.** Two parallel `POST /step` calls on the same `sessionId` race; the loser's message is overwritten. Real deployments would need a per-session async mutex.
- **`@xyflow/react` graph is read-only.** Editing happens by regenerating from a refined prompt, not by direct manipulation. Permanent product choice, not a limitation of the renderer.

---

## Configuration

All settings come from environment variables, parsed once at boot by a single typed `config` module in `packages/server`. The process fails fast on missing required values; nothing else in the code reads `process.env` directly (see Design Principle 6).

| Variable               | Default                 | Required                                                | Description                                                              |
| ---------------------- | ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `LLM_PROVIDER`         | `deepseek`              | no                                                      | Which `LLMProvider` adapter to load (`deepseek`, `openai`, ...)          |
| `LLM_MODEL`            | `deepseek-chat`         | no                                                      | Model id passed to the provider                                          |
| `LLM_API_KEY`          | —                       | **yes** (unless `NODE_ENV=test` or `LLM_PROVIDER=mock`) | Provider API key. **Secret — server-only, never exposed to the browser** |
| `LLM_BASE_URL`         | provider default        | no                                                      | Override endpoint (self-hosted, proxy)                                   |
| `LLM_TIMEOUT_MS`       | `30000`                 | no                                                      | Per-request timeout for the provider                                     |
| `LLM_MAX_RETRY`        | `1`                     | no                                                      | Retries when LLM output fails Zod schema parsing                         |
| `SIMULATION_MAX_RETRY` | `2`                     | no                                                      | Question re-asks in mock chat before falling back                        |
| `PORT`                 | `3000`                  | no                                                      | Fastify HTTP port                                                        |
| `LOG_LEVEL`            | `info`                  | no                                                      | Pino log level (`trace` … `error`)                                       |
| `CORS_ORIGIN`          | `http://localhost:5173` | no                                                      | Allowed SPA origin                                                       |

A reference `.env.example` lives at `packages/server/.env.example`. Secret handling and logging hygiene follow [.cursor/rules/security.mdc](./.cursor/rules/security.mdc) — never log API keys, prompts, or user transcripts; log metadata only.

---

## References

**Project docs**

- Product specification — [PRODUCT.md](./PRODUCT.md)
- Architecture sequence diagrams — [docs/architecture.md](./docs/architecture.md)
- Data model and REST reference — [docs/data-model.md](./docs/data-model.md)
- Security rules — [.cursor/rules/security.mdc](./.cursor/rules/security.mdc)

**External**

- Wati — Understanding nodes in Chatbot Builder — <https://docs.wati.io/docs/understanding-nodes-in-chatbot-builder>
- Wati Help Center — <https://docs.wati.io/>
- DeepSeek API — <https://api-docs.deepseek.com/>
- Fastify — <https://fastify.dev/>
- React Flow / `@xyflow/react` — <https://reactflow.dev/>
- Zod — <https://zod.dev/>

---

## License

Released under the [MIT License](./LICENSE).
