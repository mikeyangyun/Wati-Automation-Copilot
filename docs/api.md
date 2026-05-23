# API Reference

Base URL: `/api`. JSON in, JSON out. Two resources — **Flow** and **Simulation**. Errors share one shape ([Errors](#errors)). Examples use the buyer / seller reference flow from [PRODUCT.md](../PRODUCT.md).

For the entities returned by these endpoints, see [README — Data Model](../README.md#data-model).

---

## Flow

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
