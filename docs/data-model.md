# Data Model & API

Base URL: `/api`. JSON in, JSON out. Two resources — **Flow** and **Simulation**. Errors share one shape ([Errors](#errors)). Examples use the buyer / seller reference flow from [PRODUCT.md](../PRODUCT.md).

---

## Flow

The structured representation of a chatbot automation generated from a natural-language prompt. Created once and reused by explain, review, and simulation.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (`flow_...`) |
| `name` | string | Human-readable name |
| `prompt` | string | Original natural-language input |
| `trigger` | object | `{ type, value? }`; type is `new_message` or `keyword` |
| `entryNodeId` | string | Starting node ID |
| `nodes` | Node[] | Flow steps |
| `edges` | Edge[] | Connections between nodes |
| `createdAt` | string | ISO 8601 timestamp |

**Node**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `type` | enum | `trigger`, `send_message`, `ask_question`, `condition`, `assign_to_team`, `api_call`, `wait` |
| `label` | string | Display label |
| `config` | object | Type-specific settings (message text, team name, ...) |
| `position` | object | Optional graph coordinates `{ x, y }` |

**Edge**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `from` | string | Source node ID |
| `to` | string | Target node ID |
| `condition` | string | Optional branch label (`buyer`, `seller`, `fallback`, ...) |

### Endpoints

| Method | URL | Body | Response | Status |
|--------|-----|------|----------|--------|
| `POST` | `/api/flows/generate` | `{ prompt }` | `{ flow }` | 200 · 400 · 422 · 502 |
| `GET` | `/api/flows/:id` | — | `{ flow }` | 200 · 404 |
| `POST` | `/api/flows/:id/explain` | — | `{ explanation }` | 200 · 404 · 502 |
| `POST` | `/api/flows/:id/review` | — | `{ issues, summary }` | 200 · 404 · 502 |

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
      { "id": "n1", "type": "ask_question", "label": "Buyer or seller?", "config": { "text": "Are you a buyer or a seller?" } },
      { "id": "n2", "type": "condition", "label": "Match reply", "config": {} },
      { "id": "n3", "type": "assign_to_team", "label": "Route to Sales", "config": { "team": "sales" } },
      { "id": "n4", "type": "send_message", "label": "Help article", "config": { "text": "Here is our help article: https://..." } }
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

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Session identifier (`sess_...`) |
| `flowId` | string | Source flow |
| `currentNodeId` | string | Currently active node |
| `status` | enum | `running`, `waiting_for_input`, `completed`, `handed_off` |
| `transcript` | Message[] | Ordered bot and user messages |
| `context` | object | `{ retryCount, lastQuestionNodeId? }` |

**Message**

| Field | Type | Description |
|-------|------|-------------|
| `role` | enum | `bot` or `user` |
| `content` | string | Message text |
| `nodeId` | string | Source node (bot messages only) |
| `timestamp` | string | ISO 8601 |

### Endpoints

| Method | URL | Body | Response | Status |
|--------|-----|------|----------|--------|
| `POST` | `/api/flows/:id/simulate/start` | — | `{ session, botMessages }` | 200 · 404 |
| `POST` | `/api/simulate/:sessionId/step` | `{ message }` | `{ session, botMessages, events }` | 200 · 400 · 404 |
| `POST` | `/api/simulate/:sessionId/reset` | — | `{ session, botMessages }` | 200 · 404 |

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
      { "role": "bot", "content": "Are you a buyer or a seller?", "nodeId": "n1", "timestamp": "..." },
      { "role": "user", "content": "buyer", "timestamp": "..." },
      { "role": "bot", "content": "Routing you to Sales.", "nodeId": "n3", "timestamp": "..." }
    ],
    "context": { "retryCount": 0 }
  },
  "botMessages": ["Routing you to Sales."],
  "events": [
    { "type": "branch", "from": "n2", "to": "n3", "condition": "buyer" }
  ]
}
```

---

## Issue

Returned by `/review`.

| Field | Type | Description |
|-------|------|-------------|
| `severity` | enum | `error`, `warning`, or `info` |
| `code` | string | Stable code (see planned set below) |
| `message` | string | Human-readable explanation |
| `nodeIds` | string[] | Affected nodes, when applicable |

### Planned codes (MVP)

**Structural (validator):**

- `MISSING_ENTRY` — no entry node or `entryNodeId` does not exist
- `UNREACHABLE_NODE` — node not reachable from the entry
- `MISSING_FALLBACK` — `ask_question` / `condition` without an unmatched fallback edge
- `DUPLICATE_CONDITION` — multiple edges share the same `condition` label from the same source
- `DANGLING_EDGE` — edge references a non-existent node

**Semantic (`ReviewAgent`):**

- `MISSING_BRANCH` — a business path described in the prompt is not present
- `AMBIGUOUS_ROUTING` — branches the model considers under-specified
- `UNCLEAR_QUESTION` — `ask_question` text is ambiguous or compound

More codes may be added during implementation. The list above is the MVP target.

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

| HTTP | Code | When |
|------|------|------|
| 400 | `INVALID_INPUT` | Request body fails Zod validation |
| 404 | `FLOW_NOT_FOUND`, `SESSION_NOT_FOUND` | Unknown id |
| 422 | `LLM_OUTPUT_INVALID` | Model output failed schema after retry |
| 502 | `LLM_UNAVAILABLE` | Provider error or timeout |
