# Wati Automation Builder Copilot — Product Specification

> **Document type:** Product prototype & scope definition  
> **Version:** 1.0  
> **Status:** Specification locked; implementation complete

---

## 1. Executive Summary

**Wati Automation Builder Copilot** is an AI-assisted workflow design tool for Wati chatbot automations.

Users describe automation intent in **natural language**. The system produces a **Wati-compatible chatbot flow**, explains the logic in plain language, surfaces structural and semantic risks, and supports **pre-launch conversation simulation** — all before any flow is published to a live channel.

**Value proposition:** Reduce the time and expertise required to design, understand, and validate chatbot automations inside the Wati ecosystem.

---

## 2. Product Positioning

### 2.1 In Scope

| Dimension           | Definition                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primary input**   | Natural language description of automation intent                                                                                                                                |
| **Core artifact**   | Structured flow (machine-readable definition + read-only node graph)                                                                                                             |
| **AI capabilities** | Generation, explanation, and review                                                                                                                                              |
| **Validation**      | Multi-turn mock conversation with fallback handling and session reset                                                                                                            |
| **Node vocabulary** | Aligned with Wati Chatbot Builder: `trigger`, `send_message`, `ask_question`, `condition`, `assign_to_team`, `api_call`, `wait` (see [docs/data-model.md](./docs/data-model.md)) |

### 2.2 Out of Scope (MVP)

| Excluded                                | Rationale                                                       |
| --------------------------------------- | --------------------------------------------------------------- |
| Drag-and-drop visual editor             | Copilot generates flows; manual node editing is not part of MVP |
| Publish / deploy to live channels       | MVP covers design and pre-launch validation only                |
| Wati API / WhatsApp integration         | Requires production infrastructure beyond MVP                   |
| Persistent accounts and saved workflows | MVP focuses on a single-session design experience               |
| AI-generated live chat at runtime       | Simulation follows the designed flow predictably                |

### 2.3 Relationship to the Wati Platform

```mermaid
flowchart LR
    subgraph Platform["Wati Platform (full product)"]
        P1["Design automations"]
        P2["Publish to WhatsApp / channels"]
        P3["Reduce support workload"]
    end

    subgraph Copilot["Automation Builder Copilot (this product)"]
        C1["NL → Flow generation"]
        C2["Explain + Review"]
        C3["Pre-launch simulation"]
    end

    Platform -.->|"Copilot covers AI-assisted design and validation"| Copilot
```

The Copilot sits **upstream** of publish: it helps users design and verify flows before they are configured or deployed in Wati Chatbot Builder.

---

## 3. Target Users

### 3.1 Primary Personas

| Persona                  | Needs                                                                   |
| ------------------------ | ----------------------------------------------------------------------- |
| **Operations / CS lead** | Build routing and FAQ bots without deep Builder expertise               |
| **Small business owner** | Describe intent in plain language instead of configuring nodes manually |

### 3.2 Reference Scenarios

**Scenario A — Buyer / seller routing**

> When a new contact messages us, ask whether they are a buyer or seller. Route buyers to sales and send sellers a help article.

**Scenario B — FAQ routing**

> If the user asks about pricing, route to sales. If they ask about support, route to the support team and send an FAQ link.

**Scenario C — Incomplete flow (review stress test)**

> When someone messages, ask if they need sales or support. Route sales requests to the sales team.

Expected review findings: missing support branch, no fallback for ambiguous replies, incomplete user journey.

---

## 4. User Journey

### 4.1 Overview

The mental model has four user-journey stages — **Describe → Design → Validate → Simulate** — which the UI surfaces as a three-step header stepper (**Describe → Flow → Test**); the middle "Flow" step covers both Design (inspect) and Validate (Explain / Review), since both happen on the Flow panel. Users may loop back to regeneration if review or simulation surfaces issues.

```mermaid
flowchart TD
    subgraph Stage1["Describe"]
        A[Enter automation intent in natural language]
    end

    subgraph Stage2["Design"]
        B[Generate Wati-style flow]
        C[Inspect flow definition and node graph]
    end

    subgraph Stage3["Validate"]
        D[Request AI explanation]
        E[Run AI review]
    end

    subgraph Stage4["Simulate"]
        F[Click Test Chatbot — session created]
        G[Send simulated user replies]
        H{Outcome acceptable?}
        I[Revise prompt and regenerate]
        J[Pre-launch validation complete]
        K[Reset session]
    end

    A --> B --> C
    C --> D
    C --> E
    D --> F
    E --> F
    F --> G --> H
    H -->|No| I --> B
    H -->|Yes| J
    G --> K --> G
```

### 4.2 Step-by-Step Flow

The header stepper (**Describe → Flow → Test**) advances visually as the user progresses through these steps.

| Step | User action                                                     | System response                                                                                                     | UI surface      |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1    | Enter or select a starter prompt (or pick a recent)             | Header stepper highlights **Describe**                                                                              | Prompt panel    |
| 2    | Click **Generate** (or press ⌘+Enter / Ctrl+Enter)              | Produces structured flow; renders node graph (auto-laid-out). Stepper advances to **Flow**.                         | Prompt → Flow   |
| 3    | Inspect the graph or toggle to JSON                             | Read-only artifact available for inspection                                                                         | Flow panel      |
| 4    | Click **Explain**                                               | Plain-language markdown summary of trigger, branches, and outcomes                                                  | Flow panel      |
| 5    | Click **Review**                                                | Issue list with severity (errors, warnings, info); click an issue to highlight the affected nodes in the graph      | Flow panel      |
| 6    | Click **Test Chatbot**                                          | Floating chat widget opens over the Flow panel and the bot sends its opening message. Stepper advances to **Test**. | Floating widget |
| 7    | Type replies (e.g. `buyer`, `seller`) or tap a quick-reply chip | Bot follows branches; shows actions and session state                                                               | Floating widget |
| 8    | Click **Reset** (chat header) or close the widget               | Reset clears transcript and restarts from entry node, same session id. Closing keeps the session for re-open.       | Floating widget |
| 9    | If issues found, edit prompt and click Generate again           | New flow replaces previous artifact; the chat widget force-closes and the session is discarded                      | Prompt panel    |

### 4.3 Simulation Sub-Journey

Once the user clicks **Test Chatbot**, the floating chat widget opens and the user walks through one or more conversation paths before signing off on the flow. Closing the widget keeps the session intact for re-open; only a fresh **Generate** discards it.

```mermaid
sequenceDiagram
    participant U as User (operator)
    participant C as Copilot UI
    participant S as Simulation engine

    Note over U,S: Session is started lazily on the first<br/>Test Chatbot click against a given flow.
    U->>C: Click "Test Chatbot"
    C->>S: Create session from flow entry
    S-->>C: Bot: opening question (with optional quick-reply chips)
    C-->>U: Floating widget shows bot message

    U->>C: Send "buyer" (typed or chip tap)
    C->>S: Match branch and advance
    S-->>C: Bot: routed to Sales
    C-->>U: Show path result

    U->>C: Reset session (chat header)
    C->>S: New session from entry
    S-->>C: Bot: opening question
    U->>C: Send "seller"
    S-->>C: Bot: help article message
    C-->>U: Both paths verified

    Note over U,C: User can close the widget to inspect the graph<br/>and re-open it later — the session persists.
```

### 4.4 Recommended Workflow

1. **Generate** — turn intent into a structured flow
2. **Explain / Review** — confirm logic and catch gaps before simulating
3. **Simulate** — test happy paths and edge cases (e.g. buyer, seller, unclear reply)
4. **Reset / Regenerate** — reset to re-test; regenerate if the flow itself needs changes

---

## 5. Feature Specification

### 5.1 MVP (P0)

| Feature                    | Description                                       | Acceptance criteria                                        |
| -------------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| **Natural language input** | Text area with example prompts                    | User can type or select a starter prompt                   |
| **Flow generation**        | Turn natural language into a Wati-style node flow | Valid flow with trigger, nodes, and branches               |
| **Flow definition view**   | Collapsible structured view of the generated flow | Same artifact drives graph and simulation                  |
| **Flow graph**             | Read-only visual map of nodes and connections     | Node types and paths are clearly identifiable              |
| **AI explanation**         | Plain-language flow summary                       | Non-technical users can understand bot behavior            |
| **AI review**              | Structural + semantic analysis                    | Detects missing branches, missing fallback, etc.           |
| **Multi-turn simulation**  | Mock chat through the flow                        | Supports ask → reply → branch → action sequences           |
| **Fallback handling**      | Unmatched input behavior                          | Uses fallback edge when defined; otherwise retry / clarify |
| **Session reset**          | Reset simulation                                  | Clears transcript and restarts from entry node             |

### 5.2 Delivered post-MVP polish

These items were originally P1 but have shipped:

| Feature                    | Description                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| UI polish                  | Wati-style node cards (colored header, type-specific body preview); 3-step header stepper; PromptPanel with starters, recents, ⌘+Enter hint. |
| Additional starter prompts | Four menu-driven starters covering ordering, support routing, appointment booking, and insurance intake.                                     |
| Test Chatbot widget        | Floating, drag-to-resize chat widget over the Flow panel — replaces the always-on chat column. Size persisted in `localStorage`.             |
| Recent-prompt history      | Last 5 submitted prompts deduped and persisted in `localStorage`, surfaced as one-click recall in the Prompt panel.                          |

### 5.3 Still post-MVP (P1)

| Feature                             | Description                                                          |
| ----------------------------------- | -------------------------------------------------------------------- |
| Curated example flows               | Quick-start templates for common automations, not just text prompts. |
| Persistent storage and flow library | Survive process restart, allow loading prior flows by id.            |

### 5.4 Explicitly Excluded

- Drag-and-drop node editing
- Publish / deploy
- Live channel integration
- User accounts and login
- Long-term flow library / versioning

---

## 6. Interface

Header with the app title and a **Describe → Flow → Test** stepper, over a two-panel layout (**Prompt** left, **Flow** right). A **Mock Chat** widget floats over the Flow panel on demand, opened via the **Test Chatbot** button.

```
┌────────────────────────────────────────────────────────────────────┐
│  Wati Automation Builder Copilot         ① Describe ─ ② Flow ─ ③ Test │
├──────────────┬─────────────────────────────────────────────────────┤
│ PROMPT       │ FLOW                                                │
│ [textarea]   │ [Explain][Review][View JSON][▶ Test Chatbot]        │
│ [Generate]   │ ┌─────────── node graph ───────────┐                │
│ starters ▾   │ │  trigger → ask → branch          │                │
│ recents ↻    │ │              ┌────────────────┐  │ ← floating     │
│ ⌘+Enter      │ │              │ MOCK CHAT      │  │   chat widget  │
│              │ │              │ transcript     │  │   (draggable   │
│              │ │              │ [Send] [Reset] │  │    resize)     │
│              │ │              └────────────────┘  │                │
│              │ └──────────────────────────────────┘                │
└──────────────┴─────────────────────────────────────────────────────┘
```

- One generated flow drives the graph, JSON view, review, and simulation.
- The Flow panel defaults to **Graph**; toggle to JSON for the raw structure.
- Users change the flow by editing the prompt and regenerating — not by dragging nodes.
- **Generate** (or ⌘+Enter) in Prompt; **Explain** / **Review** / **View JSON** / **Test Chatbot** in Flow; **Send** / **Reset** / close in the chat widget.
- The chat widget opens only after Test Chatbot is clicked. Closing it preserves the session; clicking Test Chatbot again re-opens the same conversation. A fresh **Generate** force-closes the widget and discards the session.
- The widget can be resized by dragging its top-left grip; the chosen size is persisted in `localStorage` across reloads.
- The most recently submitted prompts (max 5, deduped) are persisted in `localStorage` and surfaced as a one-click **Recent** list below the starters.

---

## 7. Reference Flow — Buyer / Seller Routing

Canonical example for QA and walkthroughs.

**Prompt**

> When a new contact messages us, ask if they are a buyer or a seller. Route buyers to the sales team and send sellers a link to our help article.

**Flow**

```mermaid
flowchart TD
    T[New contact message] --> Q[Ask: buyer or seller?]
    Q --> C{Match reply}
    C -->|buyer| B[Route to Sales]
    C -->|seller| S[Send help article]
    C -->|unclear| F[Ask to reply buyer or seller]
    F --> Q
```

**Node types used:** `trigger`, `ask_question`, `condition`, `assign_to_team`, `send_message`

| Test          | User input        | Expected result                    |
| ------------- | ----------------- | ---------------------------------- |
| Buyer path    | `buyer`           | Routed to Sales                    |
| Seller path   | `seller`          | Help article sent                  |
| Unclear reply | `hello` → `buyer` | Clarification, then route to Sales |

Review must pass on a complete version of this flow; must fail if seller path or fallback is missing.

---

## 8. Simulation & Review

**Simulation** runs the designed flow step by step in mock chat — not open-ended conversation. Pauses on questions; follows branches on match; uses fallback or clarification when reply is unclear; **Reset** restarts from entry. `api_call` nodes are accepted in generated flows but executed as mocks during simulation — no real HTTP request is made.

**Review** returns findings with severity (`error`, `warning`, `info`):

- **Structural:** unreachable steps, missing fallback, broken connections
- **Semantic:** missing business paths, ambiguous routing

|                   | Review                         | Simulation                             |
| ----------------- | ------------------------------ | -------------------------------------- |
| Question answered | "What's wrong with this flow?" | "What happens if the user says buyer?" |

**Generation, explanation, and review** use AI. **Simulation** follows the flow as built.

---

## 9. MVP Decisions

- Natural language in; no canvas editor
- Output: flow definition + read-only node graph
- Multi-turn simulation with fallback and session reset
- No publish or live channel integration
- Scenarios B (FAQ) and C (incomplete flow) used to test generalization and review

---
