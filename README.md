# Wati Automation Builder Copilot

> AI-assisted design and pre-launch validation for Wati chatbot automations.

---

## Status

**Implementation complete.** All product surfaces are implemented end-to-end and covered by 554 automated tests (73 shared / 225 server / 256 web). For the take-home submission summary — what was built, the architecture decisions, and the demo video — see [WRITEUP.md](./WRITEUP.md).

- **Generate** — `FlowAgent` turns a natural-language prompt into a Zod-validated `Flow`. Recent prompts are persisted in `localStorage` for one-click reuse; **⌘+Enter** (or Ctrl+Enter) submits.
- **Mock simulation** — deterministic FSM executor with branch matching, retries, fallback, handoff, and reset. Surfaced through an explicit **Test Chatbot** button that opens a floating, drag-to-resize chat widget.
- **Explain** — markdown-rendered summary of how a flow behaves.
- **Hybrid review** — structural rules + semantic LLM analysis, merged by severity, with graceful degradation when the LLM is unavailable. Click an issue card to highlight the affected nodes on the graph.
- **Read-only graph** — auto-laid-out React Flow rendering with `Graph` / `JSON` toggle. Wati-style node cards (colored header, type-specific body preview, expected-replies chips on `ask_question` cards) and issue → node highlight on click. Edges are intentionally labelless — matching Wati's own builder, routing context is carried by the source `ask_question`'s chips and the edge's stroke colour (inherited from the source node's type accent). Fallback / catch-all edges render with a dashed stroke so the primary branches read first. The underlying `condition` is still present in the flow JSON, Explain output, and simulation traces — only the canvas painting was simplified.
- **Workflow stepper** — three-step indicator (**Describe → Flow → Test**) in the app header advances as the user progresses, replacing per-panel step labels.

For the product specification, see [PRODUCT.md](./PRODUCT.md). For a paste-ready demo script, see [DEMO.md](./DEMO.md).

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

Open <http://localhost:5173>. The UI is a header (title + three-step **Describe → Flow → Test** stepper) over a two-panel layout, with a chat widget that floats over the flow panel on demand:

- **Left — Prompt panel.** Textarea with starter examples, a **Generate** button (also fires on ⌘+Enter / Ctrl+Enter), a one-click **Recent** list backed by `localStorage`, and a soft character-count warning.
- **Right — Flow panel.** Generated flow rendered as an auto-laid-out, read-only graph with Wati-style node cards (default view; toggle to JSON). Header surfaces **Explain**, **Review**, **View JSON**, and **Test Chatbot** buttons. Before the first Generate, the panel shows an **Example preview** — a canonical buyer/seller routing flow rendered through the same graph component, with a dashed-border treatment so it's clearly a teaching aid.
- **Floating chat widget** (over the Flow panel). Opens only after **Test Chatbot** is clicked, persists across closes for the lifetime of the flow, and can be dragged to resize from its top-left grip (size persisted in `localStorage`).

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
│   ├── shared/                # Zod schema + shared TS types (Flow, Issue, SimulationEvent, AwaitingInput, …)
│   ├── server/                # Fastify API, agents, executor, structural validator, store
│   └── web/                   # React + Vite UI: Prompt + Flow panels, floating Test Chatbot widget,
│                              #   workflow stepper, read-only graph, issue list
├── docs/
│   ├── architecture.md        # Runtime sequence diagrams
│   └── data-model.md          # Entity fields + REST reference
├── .cursor/rules/             # Security and engineering rules
├── DEMO.md                    # Paste-ready 5-minute demo script
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
        ui[Two-panel UI + floating chat widget]
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

| Variable               | Default                 | Required                                                | Description                                                                                                                 |
| ---------------------- | ----------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `LLM_PROVIDER`         | `deepseek`              | no                                                      | Which `LLMProvider` adapter to load. Implemented: `deepseek`, `mock`. Adding a vendor is a new case in `createLLMProvider`. |
| `LLM_MODEL`            | `deepseek-v4-pro`       | no                                                      | Heavy / quality model. Used by Generate (FlowAgent) and Review (ReviewAgent.review).                                        |
| `LLM_FAST_MODEL`       | (reuses `LLM_MODEL`)    | no                                                      | Fast / cheap model. Used by Explain (ReviewAgent.explain). Set to e.g. `deepseek-v4-flash` to split routing.                |
| `LLM_API_KEY`          | —                       | **yes** (unless `NODE_ENV=test` or `LLM_PROVIDER=mock`) | Provider API key. **Secret — server-only, never exposed to the browser**                                                    |
| `LLM_BASE_URL`         | provider default        | no                                                      | Override endpoint (self-hosted, proxy)                                                                                      |
| `LLM_TIMEOUT_MS`       | `30000`                 | no                                                      | Per-request timeout for the provider                                                                                        |
| `LLM_MAX_RETRY`        | `1`                     | no                                                      | Retries when LLM output fails Zod schema parsing                                                                            |
| `SIMULATION_MAX_RETRY` | `2`                     | no                                                      | Question re-asks in mock chat before falling back                                                                           |
| `PORT`                 | `3000`                  | no                                                      | Fastify HTTP port                                                                                                           |
| `LOG_LEVEL`            | `info`                  | no                                                      | Pino log level (`trace` … `error`)                                                                                          |
| `CORS_ORIGIN`          | `http://localhost:5173` | no                                                      | Allowed SPA origin                                                                                                          |
| `NODE_ENV`             | `development`           | no                                                      | `development`, `test`, or `production`. `test` exempts `LLM_API_KEY` from being required.                                   |

A reference `.env.example` lives at `packages/server/.env.example`. Secret handling and logging hygiene follow [.cursor/rules/security.mdc](./.cursor/rules/security.mdc) — never log API keys, prompts, or user transcripts; log metadata only.

---

## Deployment

The repo is deployed as **two separate services** — Render for the API, Vercel for the SPA — to keep the LLM key server-side and avoid coupling the static bundle to the long-running Fastify process.

### Backend — Render (Web Service)

| Setting           | Value                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Root Directory    | _empty_ (repo root)                                                                                                     |
| Build Command     | `HUSKY=0 pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter shared build && pnpm --filter server build`   |
| Start Command     | `pnpm --filter server start`                                                                                            |
| Required env vars | `NODE_ENV=production`, `LLM_PROVIDER`, `LLM_API_KEY` (when `LLM_PROVIDER=deepseek`), `CORS_ORIGIN=<your Vercel origin>` |

`--ignore-scripts` skips `esbuild` postinstalls (which pnpm 11 blocks in CI). The server build is `tsc`-only so it does not need them. `shared` is built first because its `package.json` `main` points at the compiled `dist/`, which the runtime `node dist/index.js` then resolves through pnpm's workspace symlink.

### Frontend — Vercel (Vite SPA)

| Setting          | Value                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Framework Preset | `Vite` (or `Other`)                                                   |
| Root Directory   | _empty_ (repo root)                                                   |
| Install Command  | `HUSKY=0 pnpm install --frozen-lockfile --ignore-scripts`             |
| Build Command    | `pnpm --filter shared build && pnpm --filter web build`               |
| Output Directory | `packages/web/dist`                                                   |
| Required env var | `VITE_API_BASE_URL=https://<your-render-host>` (Production + Preview) |

`VITE_API_BASE_URL` makes the SPA call the Render host directly instead of relying on Vercel's same-origin rewrite, which has a ~30 s edge timeout that can cut off slow LLM responses. The fallback `vercel.json` rewrites are kept as a safety net for `/health` and stray paths.

### Wiring checklist

1. Deploy Render → confirm `https://<render-host>/health` returns `{"status":"ok"}`.
2. Deploy Vercel with `VITE_API_BASE_URL` set → confirm `https://<vercel-host>` loads.
3. Set `CORS_ORIGIN` on Render to the exact Vercel origin (no trailing slash) and let Render restart.
4. From the live SPA, run **Generate → Explain → Review → Test Chatbot** end-to-end.

### Free-tier caveat

Render's free Web Service hibernates after ~15 minutes idle; the next request pays a 30–60 s cold start. Either upgrade the Render plan or schedule an external `/health` ping every ~10 minutes if uninterrupted demos matter.

---

## References

**Project docs**

- Take-home write-up — [WRITEUP.md](./WRITEUP.md)
- Product specification — [PRODUCT.md](./PRODUCT.md)
- Demo script — [DEMO.md](./DEMO.md)
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
