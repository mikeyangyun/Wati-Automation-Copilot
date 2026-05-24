import type { Flow, Issue } from 'shared';

/**
 * Normalise a string the same way `branchMatcher.normalise` does so the rule
 * and the executor agree on what "matches". Keeping this in lock-step with
 * the runtime matcher is the whole point of the rule — a chip the validator
 * marks as reachable must in fact route to a real edge at runtime.
 */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * `UNREACHABLE_REPLY` (warning)
 *
 * Fires when an `ask_question` node exposes an `expectedReplies` entry that
 * has **no matching outgoing edge `condition`**.
 *
 * Why this matters: the chat UI renders one quick-reply chip per entry in
 * `expectedReplies` and sends the chip text verbatim on click. The server's
 * `branchMatcher` then does a case-insensitive, trimmed equality check
 * against each outgoing edge's `condition` (the literal `"fallback"` label
 * is skipped — it's reserved for the catch-all branch). If no edge matches,
 * the chip "looks valid" to the user but routes them silently to the
 * fallback edge (or, worse, retries on the same node until the retry
 * budget is exhausted). That's a contract violation between the question's
 * advertised choices and the flow's real wiring.
 *
 * The flow-agent prompt already tells the LLM to keep these aligned
 * (rule 6: `condition` labels must mirror an `expectedReplies` entry, or
 * be `"fallback"`), but prompt instructions are advisory — this rule
 * mechanically enforces the contract at review time, so a chip that
 * "looks valid" but secretly takes the fallback path is surfaced as a
 * structural issue rather than silently shipping to the operator.
 *
 * Only `ask_question` nodes are considered; `condition` nodes branch on
 * upstream state, not on `expectedReplies`, and the LLM is documented to
 * leave their config empty (`config: {}`).
 *
 * Output shape: at most one issue per source node, with all unmatched
 * replies quoted in the message — keeps the review panel from drowning a
 * single misconfigured node in N issues when N replies miss.
 */
export function detectUnreachableReplies(flow: Flow): Issue[] {
  const issues: Issue[] = [];

  const conditionsBySource = new Map<string, Set<string>>();
  for (const edge of flow.edges) {
    if (edge.condition === undefined) continue;
    const key = normalize(edge.condition);
    // The literal "fallback" condition is reserved for the catch-all branch
    // and is never matched against a reply — exclude it so a chip that
    // happens to be named "fallback" (which the LLM is told never to emit
    // anyway) is not silently considered "reachable".
    if (key === 'fallback') continue;
    const existing = conditionsBySource.get(edge.from);
    if (existing) {
      existing.add(key);
    } else {
      conditionsBySource.set(edge.from, new Set([key]));
    }
  }

  for (const node of flow.nodes) {
    if (node.type !== 'ask_question') continue;
    const replies = node.config.expectedReplies;
    if (replies === undefined || replies.length === 0) continue;

    const matchable = conditionsBySource.get(node.id) ?? new Set<string>();
    const unmatched: string[] = [];
    for (const reply of replies) {
      if (!matchable.has(normalize(reply))) {
        unmatched.push(reply);
      }
    }

    if (unmatched.length === 0) continue;

    const quoted = unmatched.map((r) => `"${r}"`).join(', ');
    const noun = unmatched.length === 1 ? 'reply' : 'replies';
    issues.push({
      severity: 'warning',
      code: 'UNREACHABLE_REPLY',
      message: `"${node.label}" advertises ${noun} ${quoted} via expectedReplies but no outgoing edge has a matching condition. Tapping ${unmatched.length === 1 ? 'that chip' : 'those chips'} will silently fall through to the default branch.`,
      nodeIds: [node.id],
    });
  }

  return issues;
}
