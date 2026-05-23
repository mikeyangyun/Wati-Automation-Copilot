import type { Flow } from 'shared';

/**
 * Top-level UI state. Single discriminated union keeps panels' render
 * logic exhaustive and avoids the `if (flow) … else if (error) …` sprawl.
 */
export type AppStatus =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'ready'; flow: Flow }
  | { kind: 'error'; error: AppErrorSummary };

export interface AppErrorSummary {
  code: string;
  message: string;
  /** HTTP status from server, or 0 for transport / shape errors. */
  status: number;
}
