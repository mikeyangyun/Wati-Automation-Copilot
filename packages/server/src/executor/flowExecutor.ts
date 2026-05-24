import type { AwaitingInput, Edge, Flow, Node, Session, SimulationEvent } from 'shared';
import { newSessionId } from 'shared';

import { AppError } from '../errors.js';
import type { InMemoryStore } from '../store/inMemoryStore.js';
import { matchBranch } from './branchMatcher.js';
import { stepNode } from './nodeHandlers.js';

/**
 * Hard cap on auto-run iterations to defend against cyclic flows that would
 * otherwise spin the executor forever. 100 is far above any realistic chain
 * length between two `ask_question` pauses.
 */
const AUTO_RUN_STEP_CAP = 100;

/** Reserved team string used when retry-exhaustion forces a human handoff. */
const HUMAN_HANDOFF_TEAM = 'human';

const RETRY_EXHAUST_MESSAGE = "Sorry, I couldn't understand. Transferring you to a human.";

export interface ExecutorResult {
  session: Session;
  botMessages: string[];
  events: SimulationEvent[];
  /**
   * Present only when `session.status === 'waiting_for_input'` AND the
   * paused node is an `ask_question`. Lets the chat UI render quick-reply
   * chips without needing to look up the flow.
   */
  awaitingInput?: AwaitingInput;
}

export interface FlowExecutorOptions {
  store: InMemoryStore;
  /** Maximum number of fallback retries before forcing a human handoff. */
  maxRetry: number;
  /** Injectable clock for deterministic transcript timestamps. */
  now?: () => string;
}

export class FlowExecutor {
  private readonly store: InMemoryStore;
  private readonly maxRetry: number;
  private readonly now: () => string;

  constructor(opts: FlowExecutorOptions) {
    this.store = opts.store;
    this.maxRetry = opts.maxRetry;
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  createSession(flow: Flow): ExecutorResult {
    const session: Session = {
      id: newSessionId(),
      flowId: flow.id,
      currentNodeId: flow.entryNodeId,
      status: 'running',
      transcript: [],
      context: { retryCount: 0 },
    };
    return this.autoRunAndPersist(flow, session, undefined, [], []);
  }

  step(sessionId: string, message: string): ExecutorResult {
    if (typeof message !== 'string' || !message.trim()) {
      throw new AppError('INVALID_INPUT', 'message must be a non-empty string', 400);
    }
    const stored = this.store.getSession(sessionId);
    if (!stored) {
      throw new AppError('SESSION_NOT_FOUND', `Session ${sessionId} not found`, 404);
    }
    if (stored.status === 'completed' || stored.status === 'handed_off') {
      throw new AppError('INVALID_INPUT', `Session ${sessionId} is already ${stored.status}`, 400);
    }
    const flow = this.store.getFlow(stored.flowId);
    if (!flow) {
      throw new AppError(
        'FLOW_NOT_FOUND',
        `Flow ${stored.flowId} backing session ${sessionId} is missing`,
        404,
      );
    }

    const session: Session = structuredClone(stored);
    const trimmed = message.trim();
    this.appendUserMessage(session, trimmed);

    const currentNode = mustGetNode(flow, session.currentNodeId);
    const outgoing = outgoingEdges(flow, currentNode.id);
    const resolution = resolveReply(currentNode, outgoing, trimmed);

    const events: SimulationEvent[] = [];
    const botMessages: string[] = [];

    if (resolution.event) events.push(resolution.event);

    if (resolution.incrementRetry) {
      session.context.retryCount += 1;
      events.push({
        type: 'retry',
        nodeId: currentNode.id,
        count: session.context.retryCount,
      });

      if (session.context.retryCount > this.maxRetry) {
        this.appendBotMessage(session, RETRY_EXHAUST_MESSAGE, currentNode.id);
        botMessages.push(RETRY_EXHAUST_MESSAGE);
        events.push({ type: 'handoff', nodeId: currentNode.id, team: HUMAN_HANDOFF_TEAM });
        session.status = 'handed_off';
        this.store.saveSession(session);
        return { session, botMessages, events };
      }
    }

    if (resolution.kind === 'advance') {
      session.currentNodeId = resolution.edge.to;
      return this.autoRunAndPersist(flow, session, trimmed, botMessages, events);
    }

    // kind === 'stay' — re-ask the question and pause.
    if (currentNode.type === 'ask_question') {
      this.appendBotMessage(session, currentNode.config.text, currentNode.id);
      botMessages.push(currentNode.config.text);
    }
    session.status = 'waiting_for_input';
    this.store.saveSession(session);
    return withAwaitingInput({ session, botMessages, events }, flow);
  }

  reset(sessionId: string): ExecutorResult {
    const stored = this.store.getSession(sessionId);
    if (!stored) {
      throw new AppError('SESSION_NOT_FOUND', `Session ${sessionId} not found`, 404);
    }
    const flow = this.store.getFlow(stored.flowId);
    if (!flow) {
      throw new AppError(
        'FLOW_NOT_FOUND',
        `Flow ${stored.flowId} backing session ${sessionId} is missing`,
        404,
      );
    }
    const session: Session = {
      ...structuredClone(stored),
      currentNodeId: flow.entryNodeId,
      status: 'running',
      transcript: [],
      context: { retryCount: 0 },
    };
    return this.autoRunAndPersist(flow, session, undefined, [], []);
  }

  /**
   * Walk the flow from `session.currentNodeId` until the executor either
   * pauses on an `ask_question` (`wait`) or reaches a terminal node. Mutates
   * `session` along the way; saves it to the store before returning.
   */
  private autoRunAndPersist(
    flow: Flow,
    session: Session,
    lastUserMessage: string | undefined,
    initialBotMessages: string[],
    initialEvents: SimulationEvent[],
  ): ExecutorResult {
    const botMessages: string[] = [...initialBotMessages];
    const events: SimulationEvent[] = [...initialEvents];

    for (let step = 0; step < AUTO_RUN_STEP_CAP; step += 1) {
      const node = mustGetNode(flow, session.currentNodeId);
      const outgoing = outgoingEdges(flow, node.id);
      const result = stepNode(node, { outgoingEdges: outgoing, lastUserMessage });

      for (const text of result.botMessages) {
        this.appendBotMessage(session, text, node.id);
        botMessages.push(text);
      }
      for (const ev of result.events) {
        events.push(ev);
      }

      const advance = result.advance;
      if (advance.kind === 'wait') {
        session.status = 'waiting_for_input';
        this.store.saveSession(session);
        return withAwaitingInput({ session, botMessages, events }, flow);
      }

      if (advance.kind === 'terminal') {
        session.status = advance.status;
        this.store.saveSession(session);
        return { session, botMessages, events };
      }

      // advance.kind === 'follow'
      const edge = flow.edges.find((e) => e.id === advance.edgeId);
      if (!edge) {
        throw new AppError('INTERNAL', `Edge ${advance.edgeId} not found in flow ${flow.id}`, 500);
      }
      session.currentNodeId = edge.to;
    }

    throw new AppError(
      'INTERNAL',
      `Simulation step cap (${AUTO_RUN_STEP_CAP}) exceeded — flow likely has a cycle without ask_question`,
      500,
    );
  }

  private appendUserMessage(session: Session, content: string): void {
    session.transcript.push({
      role: 'user',
      content,
      timestamp: this.now(),
    });
  }

  private appendBotMessage(session: Session, content: string, nodeId: string): void {
    session.transcript.push({
      role: 'bot',
      content,
      nodeId,
      timestamp: this.now(),
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

function mustGetNode(flow: Flow, nodeId: string): Node {
  const node = flow.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new AppError('INTERNAL', `Node ${nodeId} not found in flow ${flow.id}`, 500);
  }
  return node;
}

/**
 * Attach `awaitingInput` to a paused result if and only if the current node
 * is an `ask_question`. `condition` / `api_call` / `wait` pauses don't take
 * user input, so the chat UI shouldn't render an input prompt for them.
 */
function withAwaitingInput(result: ExecutorResult, flow: Flow): ExecutorResult {
  if (result.session.status !== 'waiting_for_input') return result;
  const node = flow.nodes.find((n) => n.id === result.session.currentNodeId);
  if (!node || node.type !== 'ask_question') return result;
  const expectedReplies = node.config.expectedReplies;
  const awaitingInput: AwaitingInput = {
    nodeId: node.id,
    text: node.config.text,
    ...(expectedReplies && expectedReplies.length > 0 ? { expectedReplies } : {}),
  };
  return { ...result, awaitingInput };
}

function outgoingEdges(flow: Flow, nodeId: string): Edge[] {
  return flow.edges.filter((e) => e.from === nodeId);
}

type ReplyResolution =
  | { kind: 'advance'; edge: Edge; event?: SimulationEvent; incrementRetry: false }
  | { kind: 'advance'; edge: Edge; event: SimulationEvent; incrementRetry: true }
  | { kind: 'stay'; event: SimulationEvent; incrementRetry: true };

/**
 * Resolve a user reply against an `ask_question` node's outgoing edges.
 *
 * - If the node has no conditional edges at all → just follow the first edge.
 *   This handles the LLM topology `ask_question → condition → branches`, where
 *   the matching happens at the downstream `condition` node, not here.
 * - If there are conditional edges → use `matchBranch`. `none` means re-ask.
 */
function resolveReply(currentNode: Node, edges: Edge[], reply: string): ReplyResolution {
  const conditional = edges.filter((e) => e.condition !== undefined);

  if (conditional.length === 0) {
    const first = edges[0];
    if (!first) {
      // Ask_question with no outgoing edges — degenerate flow. Stay and re-ask.
      return {
        kind: 'stay',
        event: {
          type: 'fallback',
          nodeId: currentNode.id,
          reason: 'ask_question has no outgoing edges',
        },
        incrementRetry: true,
      };
    }
    return { kind: 'advance', edge: first, incrementRetry: false };
  }

  const match = matchBranch(reply, edges);
  if (match.kind === 'exact') {
    return {
      kind: 'advance',
      edge: match.edge,
      event: {
        type: 'branch',
        from: currentNode.id,
        to: match.edge.to,
        ...(match.edge.condition ? { condition: match.edge.condition } : {}),
      },
      incrementRetry: false,
    };
  }
  if (match.kind === 'fallback') {
    return {
      kind: 'advance',
      edge: match.edge,
      event: {
        type: 'fallback',
        nodeId: currentNode.id,
        reason: 'no matching branch for reply',
      },
      incrementRetry: true,
    };
  }
  // No exact match and no fallback edge — stay on this node and retry.
  return {
    kind: 'stay',
    event: {
      type: 'fallback',
      nodeId: currentNode.id,
      reason: 'no matching branch and no fallback edge',
    },
    incrementRetry: true,
  };
}
