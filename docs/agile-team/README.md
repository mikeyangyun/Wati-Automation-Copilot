# Agile micro-team — Wati Automation Copilot

Role boundaries and **BA → UX → TL → Dev → QA** order for feature work in this repo.

**Skill entry point:** [.cursor/skills/agile-micro-team/SKILL.md](../.cursor/skills/agile-micro-team/SKILL.md) — invoke with `@agile-micro-team` or reference `docs/agile-team`.

## Goals

- **Lower token usage**: One artifact per role; downstream cites AC/slice IDs instead of replaying context.
- **Fast iteration**: Scope + acceptance first; vertical slices; each round is demoable in the two-panel UI (Prompt + Flow) with the floating Test Chatbot widget.

## Feature micro-cycle

| Order | Role | Artifact                                                    |
| ----- | ---- | ----------------------------------------------------------- |
| 1     | BA   | Story, MVP in/out, acceptance criteria                      |
| 2     | UX   | Prompt / flow graph / mock chat layout + states             |
| 3     | TL   | Slices across `shared` · `server` · `web`, API hints, risks |
| 4     | Dev  | Implement by slice; brief completion notes                  |
| 5     | QA   | AC checklist, demo smoke, Vitest edges where relevant       |

## Project docs (not a separate blueprint file)

TL and Dev align with:

- [PRODUCT.md](../PRODUCT.md) · [README.md](../README.md)
- [docs/data-model.md](../data-model.md) · [docs/architecture.md](../architecture.md)
- [.cursor/rules/security.mdc](../.cursor/rules/security.mdc) · [.cursor/rules/quality.mdc](../.cursor/rules/quality.mdc)

## Role index

| File                                         | Role |
| -------------------------------------------- | ---- |
| [business-analyst.md](./business-analyst.md) | BA   |
| [ux-designer.md](./ux-designer.md)           | UX   |
| [tech-lead.md](./tech-lead.md)               | TL   |
| [developer.md](./developer.md)               | Dev  |
| [qa-engineer.md](./qa-engineer.md)           | QA   |

## Prompt example

```text
@agile-micro-team Implement "mock chat reset": short BA → UX → TL first,
then slice across packages/server executor + packages/web MockChat panel,
QA against docs/data-model.md simulate endpoints.
Honor MVP scope in PRODUCT.md — no persistence or Wati API.
```
