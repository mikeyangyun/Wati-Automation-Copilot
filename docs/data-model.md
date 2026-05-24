# Data Model & API

Base URL: `/api`. JSON in, JSON out. Two resources — **Flow** and **Simulation**. Errors share one shape ([Errors](#errors)). Examples use the buyer / seller reference flow from [PRODUCT.md](../PRODUCT.md).

---

## Flow

The structured representation of a chatbot automation generated from a natural-language prompt. Created once and reused by explain, review, and simulation.

### Fields

| Field         | Type   | Description                                            |
| ------------- | ------ | ------------------------------------------------------ |
| `id`          | string | Unique identifier (`flow_...`)                         |
| `name`        | string | Human-readable name                                    |
| `prompt`      | string | Original natural-language input                        |
| `trigger`     | object | `{ type, value? }`; type is `new_message` or `keyword` |
| `entryNodeId` | string | Starting node ID                                       |
| `nodes`       | Node[] | Flow steps                                             |
| `edges`       | Edge[] | Connections between nodes                              |
| `createdAt`   | string | ISO 8601 timestamp                                     |

**Node**

| Field      | Type   | Description                                                                                  |
| ---------- | ------ | -------------------------------------------------------------------------------------------- |
| `id`       | string | Unique identifier                                                                            |
| `type`     | enum   | `trigger`, `send_message`, `ask_question`, `condition`, `assign_to_team`, `api_call`, `wait` |
| `label`    | string | Display label                                                                                |
| `config`   | object | Type-specific settings (message text, team name, ...)                                        |
| `position` | object | Optional graph coordinates `{ x, y }`                                                        |

**Notes on `assign_to_team.config.team`** — prefer plain, short queue names like `Sales`, `Billing`, `Support`, or `Customer Success`. The customer-facing handoff transcript is built as `Transferring you to the {team} team…`, with redundant role / group suffixes (`Agent`, `Agents`, `Team`, `Teams`, `Bot`, `Bots`, `Department`, `Dept.`) stripped automatically — so `Sales` and `Sales Agent` both produce `Transferring you to the Sales team…`. Self-contained group names that already imply a queue (`Customer Support`, `Help Desk`, `Sales Squad`, `Customer Service`) are used as-is without appending `team`. The raw `team` value is still emitted on the `handoff` event for trace fidelity — sanitisation is a presentation concern only. See [`packages/server/src/executor/nodeHandlers.ts`](../packages/server/src/executor/nodeHandlers.ts) (`formatHandoffMessage`).

**Edge**

| Field       | Type   | Description                                                |
| ----------- | ------ | ---------------------------------------------------------- |
| `id`        | string | Unique identifier                                          |
| `from`      | string | Source node ID                                             |
| `to`        | string | Target node ID                                             |
| `condition` | string | Optional branch label (`buyer`, `seller`, `fallback`, ...) |

### Endpoints

| Method | URL                      | Body         | Response              | Status                |
| ------ | ------------------------ | ------------ | --------------------- | --------------------- |
| `POST` | `/api/flows/generate`    | `{ prompt }` | `{ flow }`            | 200 · 400 · 422 · 502 |
| `GET`  | `/api/flows/:id`         | —            | `{ flow }`            | 200 · 404             |
| `POST` | `/api/flows/:id/explain` | —            | `{ explanation }`     | 200 · 404 · 502       |
| `POST` | `/api/flows/:id/review`  | —            | `{ issues, summary }` | 200 · 404             |

`/review` does **not** return 502 on LLM failure. The structural validator runs in parallel with the semantic agent; if the LLM throws, the response still returns 200 with an `info`-level `SEMANTIC_REVIEW_UNAVAILABLE` issue appended — review must remain useful even when the model is down (graceful degradation). See [`packages/server/src/routes/flows.ts`](../packages/server/src/routes/flows.ts) for the merging logic.

### Example — `POST /api/flows/generate`

```http
POST /api/flows/generate
Content-Type: application/json

{
  "prompt": "When a new contact messages us, ask if they are a buyer or a seller. Route buyers to the sales team and send sellers our help article."
}
```

```json
{
  "flow": {
    "id": "flow_01h...",
    "name": "Buyer / seller routing",
    "prompt": "When a new contact messages us, ...",
    "trigger": { "type": "new_message" },
    "entryNodeId": "n0",
    "nodes": [
      { "id": "n0", "type": "trigger", "label": "New contact message", "config": {} },
      {
        "id": "n1",
        "type": "ask_question",
        "label": "Buyer or seller?",
        "config": { "text": "Are you a buyer or a seller?" }
      },
      { "id": "n2", "type": "condition", "label": "Match reply", "config": {} },
      {
        "id": "n3",
        "type": "assign_to_team",
        "label": "Route to Sales",
        "config": { "team": "sales" }
      },
      {
        "id": "n4",
        "type": "send_message",
        "label": "Help article",
        "config": { "text": "Here is our help article: https://..." }
      }
    ],
    "edges": [
      { "id": "e0", "from": "n0", "to": "n1" },
      { "id": "e1", "from": "n1", "to": "n2" },
      { "id": "e2", "from": "n2", "to": "n3", "condition": "buyer" },
      { "id": "e3", "from": "n2", "to": "n4", "condition": "seller" }
    ],
    "createdAt": "2026-05-23T07:50:00Z"
  }
}
```

---

## Simulation

A session walks through a Flow step by step in mock chat. Advanced by user messages; resettable. `start` is keyed by flow id (it creates a session); `step` and `reset` are keyed by the returned session id.

### Fields

| Field           | Type      | Description                                               |
| --------------- | --------- | --------------------------------------------------------- |
| `id`            | string    | Session identifier (`sess_...`)                           |
| `flowId`        | string    | Source flow                                               |
| `currentNodeId` | string    | Currently active node                                     |
| `status`        | enum      | `running`, `waiting_for_input`, `completed`, `handed_off` |
| `transcript`    | Message[] | Ordered bot and user messages                             |
| `context`       | object    | `{ retryCount, lastQuestionNodeId? }`                     |

**Message**

| Field       | Type   | Description                     |
| ----------- | ------ | ------------------------------- |
| `role`      | enum   | `bot` or `user`                 |
| `content`   | string | Message text                    |
| `nodeId`    | string | Source node (bot messages only) |
| `timestamp` | string | ISO 8601                        |

### Endpoints

All three endpoints return the same envelope shape (`{ session, botMessages, events, awaitingInput? }`); `botMessages` is the slice produced by this turn and `events` are the executor transitions that fired. `awaitingInput` is present only when the session pauses on an `ask_question` node — see [AwaitingInput](#awaitinginput) below.

| Method | URL                              | Body          | Response                                           | Status          |
| ------ | -------------------------------- | ------------- | -------------------------------------------------- | --------------- |
| `POST` | `/api/flows/:id/simulate/start`  | —             | `{ session, botMessages, events, awaitingInput? }` | 200 · 404       |
| `POST` | `/api/simulate/:sessionId/step`  | `{ message }` | `{ session, botMessages, events, awaitingInput? }` | 200 · 400 · 404 |
| `POST` | `/api/simulate/:sessionId/reset` | —             | `{ session, botMessages, events, awaitingInput? }` | 200 · 404       |

### Example — `POST /api/simulate/:sessionId/step`

```http
POST /api/simulate/sess_01h.../step
Content-Type: application/json

{ "message": "buyer" }
```

```json
{
  "session": {
    "id": "sess_01h...",
    "flowId": "flow_01h...",
    "currentNodeId": "n3",
    "status": "handed_off",
    "transcript": [
      {
        "role": "bot",
        "content": "Are you a buyer or a seller?",
        "nodeId": "n1",
        "timestamp": "..."
      },
      { "role": "user", "content": "buyer", "timestamp": "..." },
      { "role": "bot", "content": "Routing you to Sales.", "nodeId": "n3", "timestamp": "..." }
    ],
    "context": { "retryCount": 0 }
  },
  "botMessages": ["Routing you to Sales."],
  "events": [{ "type": "branch", "from": "n2", "to": "n3", "condition": "buyer" }]
}
```

### AwaitingInput

Optional sidecar in every simulation envelope. Set only when the session is `waiting_for_input` at an `ask_question` node, so the chat UI can render the question text and any predefined replies as quick-reply chips without needing to walk the full Flow.

| Field             | Type     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodeId`          | string   | Node the session is currently paused on                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `text`            | string   | Question text to show as the most recent bot message / heading                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `expectedReplies` | string[] | Optional list of expected replies. When present, the array always has at least one entry — empty arrays are filtered out at the executor boundary. The flow agent prompt asks for 2–4 entries (5 only if every option is genuinely needed); wider menus overwhelm WhatsApp users and produce dense edge-label clusters in the graph. For genuinely large choice spaces, the LLM is steered to use a two-step funnel (ask category first, then ask within category) instead of a single high-fan-out `ask_question`. |

When the session is in any other status (e.g. `running`, `handed_off`, `completed`), `awaitingInput` is omitted.

---

## Issue

Returned by `/review`.

| Field      | Type     | Description                    |
| ---------- | -------- | ------------------------------ |
| `severity` | enum     | `error`, `warning`, or `info`  |
| `code`     | string   | Stable code (see set below)    |
| `message`  | string   | Human-readable explanation     |
| `nodeIds`  | string[] | Affected nodes (`[]` when N/A) |

The `ReviewResult` shape is `{ issues: Issue[], summary: string }` where `summary` is a server-rendered headline string such as `"3 issues found (1 error, 1 warning, 1 info)."`.

### Issue codes (implemented)

**Structural (validator) — deterministic, LLM-free:**

| Code                  | Severity  | When                                                                              |
| --------------------- | --------- | --------------------------------------------------------------------------------- |
| `MISSING_ENTRY`       | `error`   | `entryNodeId` does not match any node in the flow                                 |
| `DANGLING_EDGE`       | `error`   | Edge references a non-existent `from` or `to` node                                |
| `UNREACHABLE_NODE`    | `warning` | Node not reachable via BFS from the entry node                                    |
| `MISSING_FALLBACK`    | `warning` | `ask_question` / `condition` has no default (unconditioned) outgoing edge         |
| `DUPLICATE_CONDITION` | `warning` | Same source node has multiple outgoing edges with the same normalized `condition` |

**Semantic (`ReviewAgent`) — LLM-driven:**

| Code                | Severity            | When                                                                  |
| ------------------- | ------------------- | --------------------------------------------------------------------- |
| `MISSING_BRANCH`    | `warning` / `error` | A business path implied by the prompt has no corresponding edge       |
| `AMBIGUOUS_ROUTING` | `warning`           | Branches are vague or could double-match the same user input          |
| `UNCLEAR_QUESTION`  | `info`              | `ask_question` text is compound, leading, or otherwise hard to answer |

**Meta:**

| Code                          | Severity | When                                                                               |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `SEMANTIC_REVIEW_UNAVAILABLE` | `info`   | The LLM-driven review failed (timeout, schema, or transport); structural still ran |

### Merge / dedup rules

When the structural and semantic streams overlap on the same `nodeId`, **structural wins** (`structural_wins_on_nodeId`). The merged list is then sorted: severity `error` → `warning` → `info`, then structural → semantic within a severity, then by `nodeIds[0]` for stability.

---

## Errors

All errors share one shape:

```json
{
  "error": {
    "code": "FLOW_NOT_FOUND",
    "message": "No flow with id flow_xyz"
  }
}
```

| HTTP | Code                                  | When                                                                                                |
| ---- | ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 400  | `INVALID_INPUT`                       | Request body or params fail Zod validation                                                          |
| 404  | `FLOW_NOT_FOUND`, `SESSION_NOT_FOUND` | Unknown id on a typed route                                                                         |
| 404  | `NOT_FOUND`                           | Catch-all from Fastify's `setNotFoundHandler` (route does not exist)                                |
| 422  | `LLM_OUTPUT_INVALID`                  | Model output failed schema after retry (generate only)                                              |
| 502  | `LLM_UNAVAILABLE`                     | Provider error or timeout (generate + explain). `/review` degrades gracefully — see Endpoints table |
| 500  | `INTERNAL`                            | Unexpected server error (fallback shape, logged with full stack on the server)                      |
