# Wati Automation Builder Copilot

> AI-assisted design and pre-launch validation for Wati chatbot automations.

---

## Status

**Pre-implementation.** This README captures the planned product, architecture, and API surface. The runtime scaffold (server, web, shared packages) is not yet in place; a Quick Start section will be added once the project boots.

For the product specification, see [PRODUCT.md](./PRODUCT.md).

---

## Overview

**Wati Automation Builder Copilot** lets operators describe a chatbot automation in plain English and turns it into a Wati-compatible flow. The system explains the resulting logic, reviews it for defects and gaps, and runs a deterministic mock conversation so the design can be walked through before any flow is published.

The Copilot sits **upstream of publish** — design and validate first, then configure the approved flow in the Wati Builder.

**Primary users:** customer operations and CS leads, plus small business owners configuring routing and FAQ bots.

---

## Scope

| In scope (MVP) | Out of scope (MVP) |
|----------------|--------------------|
| Natural-language input with starter examples | Drag-and-drop visual editor |
| Generation of a Wati-style flow from a brief | Publish or deploy to live channels |
| Read-only node graph + structured flow view | Wati API / WhatsApp integration |
| AI: generate, explain, review | Accounts, login, saved workflows |
| Multi-turn mock simulation with fallback and reset | Persistent storage and flow library |
| Hybrid review (structural + AI semantic) | AI-authored runtime chat replies |

See [PRODUCT.md](./PRODUCT.md) for full details and rationale.

---

## Design Principles

Four rules shape both the architecture and the feature scope:

1. **Design-time AI only.** Generation, explanation, and semantic review use a language model. Runtime simulation is deterministic — the model never authors live chat replies.
2. **Hybrid review.** Structural defects (unreachable nodes, missing fallback, broken connections) are caught by code. Semantic gaps (missing branches, ambiguous wording) are caught by the model. Findings are merged and surfaced with severity.
3. **Single source of truth.** One generated flow drives the node graph, the structured view, and the simulation engine. There is no separate UI state to keep in sync.
4. **Shared schema.** The Flow type is defined once and reused across backend, frontend, and LLM output validation. The same Zod schema validates API payloads and model output.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| TypeScript monorepo (over Python or polyglot) | Shared Flow types and Zod schema across server + web + validation |
| In-memory storage only | MVP is single-session; persistence is out of scope |
| `LLMProvider` interface; DeepSeek as the default | Swap models without changing agent code; provider chosen via env |
| Read-only React Flow graph (no editing canvas) | Operators describe intent in prompts; flow changes happen by regeneration |
| Deterministic FSM executor (not LLM-driven simulation) | Reproducible mock chat; review and demo behavior are predictable |
| Hybrid review (rules + LLM) | Structural rules cannot be hallucinated; the model adds judgment, not correctness |

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Language | TypeScript | Shared types across backend, frontend, and validation |
| Monorepo | pnpm workspaces (`shared` / `server` / `web`) | Single repo, one schema |
| Backend | Fastify | Lightweight JSON API, fast scaffold |
| Frontend | React + Vite | Standard pairing with React Flow |
| Graph rendering | `@xyflow/react` (React Flow) | Read-only node graph from flow JSON |
| Schema validation | Zod | Validate LLM output and API payloads from one source of types |
| LLM (default) | DeepSeek `deepseek-chat` | OpenAI-compatible API; available without extra signup |
| LLM (design) | `LLMProvider` interface | Provider-agnostic; OpenAI / Anthropic adapters can be added |
| Testing | Vitest (server-side: executor + validator) | Quality signal without overbuilding |
| Dev orchestration | `concurrently` | Single `pnpm dev` runs server + web |
