# Architecture — Runtime Flows

Sequence diagrams for each runtime path through the system. For the package layout and the system map, see the **Architecture** section in [../README.md](../README.md).

Two invariants hold across every flow:

- One Zod-typed Flow drives the graph, the structured view, and the executor.
- The executor is deterministic. The LLM is never invoked during a simulation step.

---

## Generate

`POST /api/flows/generate` — natural-language prompt in, validated Flow out. One retry on schema failure.

```mermaid
sequenceDiagram
    participant UI as Web UI
    participant API as Routes
    participant Agent as FlowAgent
    participant Provider as LLMProvider
    participant Schema as Zod schema
    participant Store as InMemoryStore

    UI->>API: "POST /flows/generate { prompt }"
    API->>Agent: generate(prompt)
    Agent->>Provider: complete(messages)
    Provider-->>Agent: raw text
    Agent->>Schema: parse(raw)
    alt invalid
        Agent->>Provider: retry once
        Provider-->>Agent: raw text
        Agent->>Schema: parse(raw)
    end
    Agent->>Store: save(flow)
    Store-->>Agent: id
    Agent-->>API: flow
    API-->>UI: "{ flow }"
```

---

## Explain and review

Both endpoints load the stored flow. `explain` is LLM-only. `review` runs the structural validator and the `ReviewAgent` in parallel and merges findings by severity.

```mermaid
sequenceDiagram
    participant UI as Web UI
    participant API as Routes
    participant Store as InMemoryStore
    participant Validator as Structural validator
    participant Agent as ReviewAgent
    participant Provider as LLMProvider

    UI->>API: "POST /flows/:id/explain"
    API->>Store: get(id)
    Store-->>API: flow
    API->>Agent: explain(flow)
    Agent->>Provider: complete(messages)
    Provider-->>Agent: explanation
    Agent-->>API: explanation
    API-->>UI: "{ explanation }"

    UI->>API: "POST /flows/:id/review"
    API->>Store: get(id)
    Store-->>API: flow
    API->>Validator: check(flow)
    Validator-->>API: structural issues
    API->>Agent: review(flow)
    Agent->>Provider: complete(messages)
    Provider-->>Agent: semantic issues
    Agent-->>API: semantic issues
    API->>API: merge by severity
    API-->>UI: "{ issues, summary }"
```

---

## Simulate

A session walks through a Flow step by step. The executor auto-runs until it hits an `ask_question` or terminal node; user replies advance it. The LLM is not involved.

```mermaid
sequenceDiagram
    participant UI as Web UI
    participant API as Routes
    participant Executor as FlowExecutor
    participant Store as InMemoryStore

    UI->>API: "POST /flows/:id/simulate/start"
    API->>Store: get(flow)
    API->>Executor: createSession(flow)
    Executor->>Executor: auto-run until ask_question
    Executor->>Store: save(session)
    Executor-->>API: session, botMessages
    API-->>UI: "{ session, botMessages }"

    loop user replies
        UI->>API: "POST /simulate/:sid/step { message }"
        API->>Store: get(session)
        API->>Executor: step(session, message)
        Executor->>Executor: match branch or fallback
        Executor->>Executor: auto-run until next wait or end
        Executor->>Store: save(session)
        Executor-->>API: session, bot messages, events
        API-->>UI: "{ session, botMessages, events }"
    end

    UI->>API: "POST /simulate/:sid/reset"
    API->>Executor: reset(sid)
    Executor->>Store: save(new session)
    Executor-->>API: session, botMessages
    API-->>UI: "{ session, botMessages }"
```
