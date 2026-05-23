import type { Flow } from 'shared';

import type { ReviewResult, SessionEnvelope } from './api.js';

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

/**
 * Explain (Phase 3) lifecycle. Sibling to SimulationStatus — independent of
 * both AppStatus and SimulationStatus, since explanation freshness is
 * user-driven (each click is a new request, no auto-fetch).
 *
 * `ready.refreshing` flags a click-while-ready so the UI can keep the
 * previous explanation visible behind the new loading hint instead of
 * flashing to a blank state.
 */
export type ExplainStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; explanation: string; refreshing?: boolean }
  | { kind: 'error'; error: AppErrorSummary };

/**
 * Review (Phase 4) lifecycle. Mutually exclusive with `ExplainStatus` in
 * the UI (BA decision #5): the App layer keeps both pieces of state but the
 * FlowPanel only renders one block at a time. Per BA decision #6 the
 * refresh UX is "blank then loading" — there is no `refreshing` flag here.
 */
export type ReviewStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; result: ReviewResult }
  | { kind: 'error'; error: AppErrorSummary };

export interface AppErrorSummary {
  code: string;
  message: string;
  /** HTTP status from server, or 0 for transport / shape errors. */
  status: number;
}
