/**
 * Three-state workflow stepper rendered in the app header.
 *
 * Replaces the previous per-panel "Step 1 · Describe" eyebrow with a
 * single global indicator, so users can see the whole journey
 * (Describe → Flow → Test) regardless of which panel is in focus.
 *
 * State semantics:
 *   - `done`     — step has been completed and is now in the past. Rendered
 *                  with a check mark and a muted accent.
 *   - `active`   — the step the user should currently engage with. Rendered
 *                  with the bold accent color and an outlined index disc.
 *   - `pending`  — not yet reachable. Rendered muted with no accent.
 *
 * The component is purely presentational: parent owns the derivation from
 * application state, which keeps the stepper trivially testable in
 * isolation.
 */
export type StepState = 'pending' | 'active' | 'done';

export interface StepperStep {
  /** Visible label below the disc. Keep it short — single word ideally. */
  label: string;
  state: StepState;
}

export interface StepperProps {
  steps: ReadonlyArray<StepperStep>;
}

export function Stepper({ steps }: StepperProps) {
  return (
    <ol className="stepper" aria-label="Workflow progress">
      {steps.map((step, idx) => (
        <li
          key={step.label}
          className={`stepper-item stepper-item-${step.state}`}
          data-testid={`stepper-item-${idx + 1}`}
          aria-current={step.state === 'active' ? 'step' : undefined}
        >
          <span className="stepper-disc" aria-hidden="true">
            {step.state === 'done' ? <CheckIcon /> : idx + 1}
          </span>
          <span className="stepper-label">{step.label}</span>
          {idx < steps.length - 1 ? (
            <span
              className={`stepper-connector stepper-connector-${step.state === 'done' ? 'done' : 'pending'}`}
              aria-hidden="true"
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 8.5 6.5 12 13 4.5" />
    </svg>
  );
}
