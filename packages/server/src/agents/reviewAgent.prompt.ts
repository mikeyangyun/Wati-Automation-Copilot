import type { Flow } from 'shared';

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
