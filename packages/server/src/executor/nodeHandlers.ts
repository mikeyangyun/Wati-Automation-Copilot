import type { Edge, Node, SimulationEvent } from 'shared';

import { matchBranch } from './branchMatcher.js';

/**
 * Build the customer-facing handoff line from a `team` field that the LLM
 * (or a hand-edited flow) put on an `assign_to_team` node.
 *
 * Why this exists: a literal template `"the ${team} team"` reads badly
 * when the LLM picks a name that already implies a group ("Sales Agent",
 * "Support Team", "Help Desk"). Real example we hit during testing:
 * `team = "Sales Agent"` → `"Transferring you to the Sales Agent team…"`
 * which makes the recipient wonder whether they're being handed to an AI
 * agent or a human queue. We normalise here so the message is always
 * unambiguous regardless of what name the model produced.
 *
 * Rules:
 *   1. Strip role / group suffixes the template would double up on
 *      (Agent, Agents, Team, Teams, Bot, Bots, Department / Dept.).
 *   2. If the cleaned name already names a group ("Customer Support",
 *      "Help Desk", "Sales Squad"), use it as-is — appending "team"
 *      would produce "Help Desk team…", which is worse.
 *   3. Empty / whitespace-only names fall back to a generic "a human
 *      teammate" line so the customer is never told they're being
 *      transferred to literal nothing.
 *
 * The raw `team` value is still emitted on the `handoff` event for
 * trace fidelity — sanitisation is a presentation concern only.
 */
export function formatHandoffMessage(rawTeam: string): string {
  const trimmed = rawTeam.trim();
  if (trimmed.length === 0) {
    return 'Transferring you to a human teammate…';
  }
  // Strip trailing role/group noise the template would otherwise duplicate.
  // The `(?:^|\s+)` anchor lets us also strip the noise word when it is the
  // *entire* input (e.g. raw `team` was just "Team" or "Agents") — that
  // degenerate case then drops through to the generic fallback below.
  const stripped = trimmed
    .replace(/(?:^|\s+)(agents?|teams?|bots?|dept\.?|departments?)\s*$/i, '')
    .trim();
  if (stripped.length === 0) {
    // e.g. raw `team` was literally "Team" or "Agents" — degrade gracefully.
    return 'Transferring you to a human teammate…';
  }
  // Already a self-contained group name (Customer Support, Help Desk, …)
  // → don't append "team".
  if (/\b(support|desk|squad|crew|service)\b/i.test(stripped)) {
    return `Transferring you to the ${stripped}…`;
  }
  return `Transferring you to the ${stripped} team…`;
}

/**
 * Pure-function step result returned by every node handler. The orchestrator
 * (`FlowExecutor`) is responsible for applying the `advance` directive — the
 * handlers themselves never touch the session or the store.
 */
export type NodeAdvance =
  | { kind: 'follow'; edgeId: string }
  | { kind: 'wait' }
  | { kind: 'terminal'; status: 'completed' | 'handed_off' };

export interface NodeStepResult {
  /** Bot transcript lines to append, in order. */
  botMessages: string[];
  events: SimulationEvent[];
  advance: NodeAdvance;
}

export interface NodeContext {
  outgoingEdges: ReadonlyArray<Edge>;
  /**
   * The most recent user reply. Only meaningful for `condition` nodes
   * (which fork on it). Pass `undefined` when no reply has happened yet.
   */
  lastUserMessage?: string;
}

/**
 * Dispatch on `node.type`. Every branch is exhaustive over the
 * discriminated `Node` union; TypeScript will fail compilation if a new
 * node type is added to `shared` without a handler here.
 */
export function stepNode(node: Node, ctx: NodeContext): NodeStepResult {
  switch (node.type) {
    case 'trigger':
      return advanceOrComplete(ctx);

    case 'send_message':
      return {
        botMessages: [node.config.text],
        events: [],
        advance: advanceOrComplete(ctx).advance,
      };

    case 'ask_question':
      return {
        botMessages: [node.config.text],
        events: [],
        advance: { kind: 'wait' },
      };

    case 'condition':
      return stepCondition(node, ctx);

    case 'assign_to_team': {
      const team = node.config.team;
      return {
        botMessages: [formatHandoffMessage(team)],
        // Trace event keeps the raw `team` value so downstream logs /
        // analytics see exactly what the flow author named the queue.
        events: [{ type: 'handoff', nodeId: node.id, team }],
        advance: { kind: 'terminal', status: 'handed_off' },
      };
    }

    case 'api_call': {
      const event: SimulationEvent = {
        type: 'mock-api-call',
        nodeId: node.id,
        ...(node.config.url ? { url: node.config.url } : {}),
      };
      return {
        botMessages: [],
        events: [event],
        advance: advanceOrComplete(ctx).advance,
      };
    }

    case 'wait':
      // `wait` is silent and instant in mock simulation — no transcript line,
      // no event, no actual delay.
      return {
        botMessages: [],
        events: [],
        advance: advanceOrComplete(ctx).advance,
      };
  }
}

/**
 * Pick the next edge for nodes that auto-advance unconditionally. If the node
 * has multiple outgoing edges, the first one wins (well-formed flows for these
 * node types have exactly one outgoing edge). If there are no outgoing edges,
 * the simulation reaches a `completed` terminal.
 */
function advanceOrComplete(ctx: NodeContext): NodeStepResult {
  const first = ctx.outgoingEdges[0];
  if (!first) {
    return { botMessages: [], events: [], advance: { kind: 'terminal', status: 'completed' } };
  }
  return { botMessages: [], events: [], advance: { kind: 'follow', edgeId: first.id } };
}

/**
 * `condition` is a transparent fork — it picks an outgoing edge by matching
 * the last user reply against edge.condition labels. If no reply is in scope
 * (degenerate flow: `condition` reached before any `ask_question`), it falls
 * through to the first unconditional outgoing edge if any; otherwise it
 * `completed`-terminates with a `fallback` event for traceability.
 */
function stepCondition(
  node: Extract<Node, { type: 'condition' }>,
  ctx: NodeContext,
): NodeStepResult {
  if (ctx.lastUserMessage === undefined) {
    const unconditional = ctx.outgoingEdges.find((e) => !e.condition);
    if (unconditional) {
      return {
        botMessages: [],
        events: [],
        advance: { kind: 'follow', edgeId: unconditional.id },
      };
    }
    return {
      botMessages: [],
      events: [
        { type: 'fallback', nodeId: node.id, reason: 'condition reached without prior user reply' },
      ],
      advance: { kind: 'terminal', status: 'completed' },
    };
  }

  const match = matchBranch(ctx.lastUserMessage, ctx.outgoingEdges);
  if (match.kind === 'exact') {
    return {
      botMessages: [],
      events: [
        {
          type: 'branch',
          from: node.id,
          to: match.edge.to,
          ...(match.edge.condition ? { condition: match.edge.condition } : {}),
        },
      ],
      advance: { kind: 'follow', edgeId: match.edge.id },
    };
  }
  if (match.kind === 'fallback') {
    return {
      botMessages: [],
      events: [{ type: 'fallback', nodeId: node.id, reason: 'no matching branch for reply' }],
      advance: { kind: 'follow', edgeId: match.edge.id },
    };
  }
  // None — condition has no fallback edge and no exact match. Terminate
  // gracefully so the UI can show "Conversation reached the end."
  return {
    botMessages: [],
    events: [
      { type: 'fallback', nodeId: node.id, reason: 'no matching branch and no fallback edge' },
    ],
    advance: { kind: 'terminal', status: 'completed' },
  };
}
