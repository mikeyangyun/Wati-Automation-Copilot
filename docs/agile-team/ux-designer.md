# UX (User Experience) — experience and UI notes

## Mission

Ensure users **understand** and **complete the primary task**, with clear feedback for loading, empty, and failure.

## Responsibilities

1. **Information architecture**: Three-panel Copilot layout — **prompt panel** (NL input + examples), **flow view** (read-only graph + JSON), **mock chat** (simulate + explain/review output). Wireframe-level bullets or ASCII only.
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
| State | User sees | Actions |
|-------|-----------|---------|
| Loading | ... | ... |
| Empty | ... | ... |
| Error | ... | ... |
| Success | ... | ... |

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
