import type { Flow } from 'shared';

import type { SessionEnvelope } from './api.js';

/**
 * Flow-generation lifecycle. Independent of simulation lifecycle —
 * the two are kept as sibling state pieces in `App`, not merged into
 * one union, so neither has to enumerate the other's states.
 */
export type AppStatus =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'ready'; flow: Flow }
  | { kind: 'error'; error: AppErrorSummary };

/**
 * Simulation lifecycle. Only meaningful when `AppStatus.kind === 'ready'`.
 *
 * `active.pending` distinguishes idle from "step/reset in-flight" without
 * needing a separate spinner state; it also lets us disable the input
 * while preserving the visible transcript.
 */
export type SimulationStatus =
  | { kind: 'inactive' }
  | { kind: 'starting' }
  | { kind: 'active'; envelope: SessionEnvelope; pending?: 'step' | 'reset' }
  | { kind: 'error'; error: AppErrorSummary };

export interface AppErrorSummary {
  code: string;
  message: string;
  /** HTTP status from server, or 0 for transport / shape errors. */
  status: number;
}
