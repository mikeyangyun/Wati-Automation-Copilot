# Demo Walkthrough

A self-contained, ~5-minute script for showing the end-to-end Copilot loop: **Describe → Design → Validate → Simulate**. Every prompt below is paste-ready.

For the product spec see [PRODUCT.md](./PRODUCT.md); for architecture see [docs/architecture.md](./docs/architecture.md).

---

## Setup (one minute, before the call)

```bash
nvm use
pnpm install
cp packages/server/.env.example packages/server/.env   # if not already done
# Edit packages/server/.env and set LLM_API_KEY=sk-...
pnpm dev
```

Verify:

```bash
curl -s http://localhost:3000/health
# -> {"status":"ok", ...}
open http://localhost:5173
```

You should see the UI: header with the **Describe → Flow → Test** stepper (currently on Describe), a Prompt panel on the left, and the Flow panel on the right showing an **Example preview** — a buyer/seller routing flow rendered with a dashed border so it's clearly a teaching aid. No live flow is loaded yet; the Test Chatbot widget is not visible until the user clicks **Test Chatbot** later.

**If the LLM call fails during the demo** (network, key, model timeout): the API surfaces a typed `LLM_*` error and the UI shows a recoverable error banner. Click **Generate** again to retry. Generate is the only LLM-dependent step; Explain and Review fail soft (Review keeps structural findings and appends a `SEMANTIC_REVIEW_UNAVAILABLE` info-level issue).

---

## Storyboard

Three scenarios, each lifted from PRODUCT.md §3.2. Run them in order — they tell a single story.

### Scenario A — Happy path (90s)

> **Prompt:** When a new contact messages us, ask whether they are a buyer or seller. Route buyers to sales and send sellers a help article.

1. **Paste** the prompt into the left panel, click **Generate** (or press ⌘+Enter). Point at the header — the stepper steps from **Describe** to **Flow** as the result lands.
2. **Generated flow appears** in the right panel as an auto-laid-out graph. Point out:
   - **Trigger** node at the top, then an **ask_question**, then two branches into `assign_to_team` (Sales) and `send_message` (support article).
   - **Wati-style node cards** — colored header by node type, body shows type-specific preview (message text snippet, expected-replies chips, team name, API method, …).
   - **Labelless arrows (Wati-style)** — routing context lives on the source `ask_question` card's chip palette and on the edge's stroke colour (inherited from the source node's type accent), not on text labels painted across the canvas. Earlier iterations painted `buyer` / `seller` / `fallback` directly on the edges; that produced a visible "pile-up" stripe on wide branching flows and diverged from Wati's actual product, so the labels were removed.
   - **Fallback / catch-all edges render dashed** so the primary branches read first.
   - The underlying `condition` is still present everywhere it matters — the JSON view, Explain output, and simulation traces — only the canvas painting was simplified.
   - Click **View JSON** to show the structured form is the same data, then toggle back to **Graph**.
3. **Click Explain.** A markdown summary streams in above the flow. Read out the top bullet: it should describe the trigger, the question, and the two branches in plain English.
4. **Click Test Chatbot.** A floating chat widget opens over the flow with the bot's opening question ("Are you a buyer or a seller?"), and the header stepper moves to **Test**. Type `buyer` (or tap a quick-reply chip if shown) → bot routes to sales. Click **Reset** in the chat header and try `seller` → seller branch fires. Drag the top-left grip to resize the widget if the chat needs more room.

**Talking points while the chat runs**

- The executor is a deterministic FSM. No LLM is involved during a simulation step — that's why it's reproducible and fast.
- The graph, the JSON view, the chat widget, and the LLM all consume the **same Zod-typed Flow object**.
- Closing the chat widget keeps the session intact; clicking Test Chatbot again resumes the same conversation. Only **Generate** discards it.

### Scenario B — Review value (90s)

> **Prompt:** When someone messages, ask if they need sales or support. Route sales requests to the sales team.

This is intentionally underspecified — no support branch, no fallback for ambiguous replies.

1. **Paste**, click **Generate**.
2. **Click Review.** A panel above the graph lists the issues. Expect a mix of:
   - **Structural errors** (deterministic, never hallucinated) — e.g. `MISSING_FALLBACK`, `UNREACHABLE_NODE`.
   - **Semantic warnings** (LLM-only) — e.g. `MISSING_BRANCH` calling out the support intent.
3. **Click an issue card.** The corresponding node in the graph glows; unrelated nodes dim. Click again to deselect.
4. **Click another issue** — selection moves. This is the "Issue ↔ Graph" bidirectional highlight.

**Talking points**

- Structural and semantic streams run in **parallel** (`Promise.allSettled`). If the LLM throws, the review still returns 200 with all structural findings plus a `SEMANTIC_REVIEW_UNAVAILABLE` info-level issue. Review degrades gracefully.
- On `nodeId` overlap, structural wins — the LLM never duplicates a deterministic finding.

### Scenario C — Iteration loop (60s)

Same prompt as B, but now **revise** it to fix the gap:

> **Prompt:** When someone messages, ask if they need sales or support. Route sales requests to the sales team. Route support requests to the support team. If the reply doesn't match, say "I'll get someone to follow up" and hand off.

1. **Paste** the revised prompt and **Generate** again. The previous flow, explanation, and review all clear automatically; if the chat widget was open, it force-closes and the previous session is discarded.
2. **Click Review** on the new flow. Expect fewer issues (ideally none, or only `info`-level).
3. **Click Test Chatbot** and walk through the new flow: try the matched branches, then an unmatched reply (`hello?`) to trigger the fallback.

**Talking points**

- Editing happens by **regeneration**, not by direct graph manipulation. The graph is intentionally read-only — operators describe intent, the model expresses it.
- Three loops are visible: prompt → flow, flow → review, flow → simulation. Each closes on its own; the user only re-enters at the prompt.

---

## What to call out at the end

- **Schema as the contract.** One Zod type (`Flow`) generates TypeScript types for the server, the web app, and the LLM output parser. Drift between layers becomes a compile error.
- **LLM-free invariants.** `executor/` and `validator/` cannot import from `llm/` — ESLint blocks it. That's how we keep "simulation is deterministic" honest.
- **Provider-agnostic LLM.** Vendor lives behind `LLMProvider`. Swapping to OpenAI is a 30-line adapter and a config change.
- **Test coverage.** 589 automated tests across `shared / server / web` (73 + 257 + 259), plus an in-process simulation smoke harness (`pnpm --filter server simulation-smoke`) and a GitHub Actions CI gate covering typecheck, lint, test, build, and smoke.

---

## Known limitations to mention (rather than be caught on)

Already documented in [README.md § Known Limitations](./README.md#known-limitations):

- **In-memory store, no persistence.** Restart erases flows and sessions. Trivial to swap for Redis/Postgres later; out of scope here.
- **No auth or rate limiting.** All endpoints are open on localhost. Add `@fastify/rate-limit` and an auth layer before any non-local deployment.
- **No per-session step lock.** Two parallel `POST /step` calls on the same `sessionId` race. Real deployments need a per-session async mutex.
- **Graph is read-only.** Permanent product choice; editing happens by re-prompting.

---

## Reset between dry-runs

The store lives in process memory. To start clean between rehearsals:

```bash
# Stop pnpm dev (Ctrl-C in the dev terminal), then:
pnpm dev
```

That's it — no DB to truncate, no cache to flush.
