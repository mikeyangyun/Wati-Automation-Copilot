import type { Edge, Node, SimulationEvent } from 'shared';

import { matchBranch } from './branchMatcher.js';

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
        botMessages: [`Transferring you to the ${team} team…`],
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
