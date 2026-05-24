# UX (User Experience) — experience and UI notes

## Mission

Ensure users **understand** and **complete the primary task**, with clear feedback for loading, empty, and failure.

## Responsibilities

1. **Information architecture**: Copilot layout — header with **Describe → Flow → Test** stepper over a two-panel body (**prompt panel** for NL input, starters, recents; **flow panel** for read-only graph + JSON + Explain/Review/Test Chatbot actions), plus a floating **chat widget** that opens over the flow panel on demand. Wireframe-level bullets or ASCII only.
2. **Critical flows**: Map to generate → explain/review → simulate → reset/regenerate per [PRODUCT.md](../../PRODUCT.md).
3. **States**: Loading, empty data, retryable error, success—one line each on presentation and controls.
4. **Copy cues**: Buttons, headings, error tone—in sync with BA where it matters.
5. **Accessibility floor**: Focus order, contrast, semantics—proportionate for prototype bandwidth.

## Per-feature artifact template

```markdown
## User goal (one line)

...

## Layout / regions

- ...

## Primary flow (steps)

1. ...
2. ...

## States and feedback

| State   | User sees | Actions |
| ------- | --------- | ------- |
| Loading | ...       | ...     |
| Empty   | ...       | ...     |
| Error   | ...       | ...     |
| Success | ...       | ...     |

## Copy draft (optional)

- ...

## UX trade-offs / deferred

- ...
```

## Collaboration boundaries

- **Do not** rewrite BA business acceptance logic; escalate “cannot perceive” mismatches back to BA.
- **Do not** pick frameworks or APIs (TL/Dev); you may constrain interaction—“preview in one click”.
- Avoid full design-system docs scope to **current feature**.

## Token-efficient habits

- Minimal sketches or bullets not long prose about pixels.
- Cite BA for overlaps; UX delta only beyond BA.
