---
name: agile-micro-team
description: >-
  Runs BA→UX→TL→Dev→QA micro-flow for Wati Automation Builder Copilot features — NL flow generation, explain/review, mock simulation. Use when implementing a Copilot feature, sprint prototyping, or when the user references agile micro-team, docs/agile-team, or Wati Copilot slices.
disable-model-invocation: true
---

# Agile Micro-Team — Wati Automation Copilot

## When this applies

Building or iterating a **Copilot feature** in this repo (not one-line fixes). Default unless the user opts out.

**MVP guardrails** — reject or defer unless explicitly agreed:

- No drag-and-drop editor, Wati API / WhatsApp publish, auth, DB persistence, or LLM-driven simulation steps
- Flow changes via **regenerate**, not manual node editing
- Simulation stays **deterministic** (`FlowExecutor` only — no LLM at runtime)

## Sources of truth (read before TL/Dev)

| Doc                                                            | Use for                                          |
| -------------------------------------------------------------- | ------------------------------------------------ |
| [PRODUCT.md](../../PRODUCT.md)                                 | Personas, scenarios, in/out scope                |
| [README.md](../../README.md)                                   | Stack, modules, design principles                |
| [docs/data-model.md](../../docs/data-model.md)                 | Flow/Simulation fields, REST, error codes        |
| [docs/architecture.md](../../docs/architecture.md)             | Generate / explain / review / simulate sequences |
| [.cursor/rules/security.mdc](../../.cursor/rules/security.mdc) | Secrets, env, logging                            |
| [.cursor/rules/quality.mdc](../../.cursor/rules/quality.mdc)   | Validation, tests, unsafe paths                  |

TL and Dev must flag conflicts with these docs and propose updates — do not silently drift.

## Core rules

1. **Order**: BA → UX → TL → Dev → QA. No coding before BA acceptance criteria and TL slices.
2. **Token discipline**: Short artifacts (lists/tables). Downstream **references** upstream IDs (AC1, T2) — no replaying full debates.
3. **Architecture invariants**: one Zod Flow schema in `packages/shared`; `executor/` never imports `llm/`; hybrid review = rules authoritative + LLM semantic; reuse stored flows for explain/review/simulate.

## Execution

One agent may run all stages sequentially, or pause after any stage.

| Stage | Role | Output (keep short)                                                              |
| ----- | ---- | -------------------------------------------------------------------------------- |
| 1     | BA   | Story, In/Out vs MVP table, AC (Given/When/Then), Must/Should/Could              |
| 2     | UX   | Two-panel layout (prompt / flow) + floating chat widget, states, copy            |
| 3     | TL   | Slices mapped to `shared` / `server` / `web`, API touchpoints, risks, AC → slice |
| 4     | Dev  | Slice-by-slice; note package + module per slice                                  |
| 5     | QA   | AC table, demo smoke path, executor/validator edges, ship call                   |

### Typical slice order (adapt per feature)

1. `packages/shared` — schema/types if the Flow contract changes
2. `packages/server` — validator → executor → store → agents → routes (backend before UI for API features)
3. `packages/web` — panel wiring, read-only graph, mock chat

### Demo smoke paths (when feature touches end-to-end)

- **Happy**: generate buyer/seller prompt → graph → explain → simulate buyer + seller
- **Review**: defective sales/support prompt → structural + semantic issues surfaced
- **Errors**: missing flow id (404), invalid body (400), LLM/schema failure (422/502)

## Templates

Role charters under [docs/agile-team/](../../docs/agile-team/) — read the matching file **when entering that stage**:

- [README.md](../../docs/agile-team/README.md) · [business-analyst.md](../../docs/agile-team/business-analyst.md) · [ux-designer.md](../../docs/agile-team/ux-designer.md) · [tech-lead.md](../../docs/agile-team/tech-lead.md) · [developer.md](../../docs/agile-team/developer.md) · [qa-engineer.md](../../docs/agile-team/qa-engineer.md)

## Stop conditions

- Requirements ambiguous or out of MVP → BA clarification before UX/TL
- Needs persistence, publish, or canvas editing → stop; propose V2 or get explicit scope change
- Technical blocker → TL spike with stated assumptions, then proceed
- QA fails AC → Dev fix; rerun only impacted smoke paths and related Vitest tests
