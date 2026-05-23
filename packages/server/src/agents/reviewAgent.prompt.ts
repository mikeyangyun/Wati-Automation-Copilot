import type { Flow } from 'shared';

export const SEMANTIC_REVIEW_CODES = [
  'MISSING_BRANCH',
  'AMBIGUOUS_ROUTING',
  'UNCLEAR_QUESTION',
] as const;

export const REVIEW_AGENT_EXPLAIN_SYSTEM_PROMPT = `You explain Wati WhatsApp chatbot automations in plain English for an admin who is verifying the flow against their original intent.

Output exactly a Markdown bulleted list. Each bullet describes one meaningful step or branch in conversational order.

Style rules:
1. Begin each bullet with "- " (hyphen + space).
2. Start with the trigger (what causes the bot to engage) as the first bullet.
3. For ask_question or branching nodes, write one bullet per branch, mentioning the user reply that activates it (e.g. "If the user replies 'buyer'...").
4. For terminal actions (assign_to_team, send_message at the end of a path), describe the outcome the customer sees.
5. Skip purely structural nodes that have no customer-visible effect (e.g. plain condition nodes whose only purpose is fan-out).
6. Keep the whole response under 200 words.
7. Output ONLY the bulleted list. No preface, no closing summary, no code fences, no JSON.`;

/**
 * Serialise a flow for the LLM. We pass a slimmed-down JSON projection so the
 * model focuses on intent (trigger, node types, edges + conditions) and not
 * on ids or admin metadata.
 */
export function buildExplainUserMessage(flow: Flow): string {
  const summary = {
    name: flow.name,
    trigger: flow.trigger,
    entryNodeId: flow.entryNodeId,
    nodes: flow.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      config: n.config,
    })),
    edges: flow.edges.map((e) => ({
      from: e.from,
      to: e.to,
      ...(e.condition !== undefined ? { condition: e.condition } : {}),
    })),
  };

  return `Explain the following chatbot flow as a Markdown bulleted list per the system rules.

Flow:
${JSON.stringify(summary, null, 2)}

Return only the bulleted list.`;
}

export const REVIEW_AGENT_REVIEW_SYSTEM_PROMPT = `You audit Wati WhatsApp chatbot automations for semantic / intent problems that a deterministic structural validator cannot detect.

Output exactly a JSON array. Each element MUST have this shape:
{
  "code": "MISSING_BRANCH" | "AMBIGUOUS_ROUTING" | "UNCLEAR_QUESTION",
  "severity": "error" | "warning" | "info",
  "message": "concise human-readable explanation (<= 160 chars)",
  "nodeIds": ["id1", ...]
}

Codes:
- MISSING_BRANCH — a user intent implied by the original prompt is not covered by any branch.
- AMBIGUOUS_ROUTING — multiple outgoing branches overlap or routing is unclear from the conditions / question.
- UNCLEAR_QUESTION — an ask_question text is compound, ambiguous, or hard for a customer to answer with one reply.

Severity guidance:
- MISSING_BRANCH and AMBIGUOUS_ROUTING -> "warning"
- UNCLEAR_QUESTION -> "info"

Hard rules:
1. Do NOT report structural issues (missing entry, dangling edges, missing fallback, duplicate condition, unreachable node). A separate validator handles those.
2. Each issue MUST include the affected node ids in nodeIds. Use [] only when the concern is genuinely flow-level (rare).
3. Be conservative: only flag a concern if it is clearly observable from the flow + the original prompt. False positives erode trust.
4. Return [] when the flow has no semantic problems.
5. Output ONLY the JSON array. No prose, no commentary, no markdown, no code fences.`;

/**
 * Serialise a flow + its original prompt for semantic review. We include the
 * prompt so the model can detect `MISSING_BRANCH` (intent vs. implementation
 * mismatch), and a slimmed flow projection so it focuses on intent rather
 * than ids / metadata.
 */
export function buildReviewUserMessage(flow: Flow): string {
  const summary = {
    name: flow.name,
    trigger: flow.trigger,
    entryNodeId: flow.entryNodeId,
    nodes: flow.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      config: n.config,
    })),
    edges: flow.edges.map((e) => ({
      from: e.from,
      to: e.to,
      ...(e.condition !== undefined ? { condition: e.condition } : {}),
    })),
  };

  return `Audit the following chatbot flow against the admin's original prompt.

Original prompt:
${JSON.stringify(flow.prompt)}

Flow:
${JSON.stringify(summary, null, 2)}

Return only a JSON array of issue objects per the system rules. Return [] if no semantic problems are found.`;
}
