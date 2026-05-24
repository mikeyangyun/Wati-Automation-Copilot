import { FlowSchema, type Flow } from 'shared';

/**
 * Canonical example flow rendered in the Flow panel before the user has
 * generated anything of their own. Mirrors the buyer/seller routing flow
 * referenced by PRODUCT.md §7 and docs/data-model.md, so the same shape
 * shows up in docs, tests, and the empty-state preview.
 *
 * Constraints on this object:
 *   - It must parse cleanly with `FlowSchema` (we re-parse below so a typo
 *     fails at module load, not at runtime).
 *   - The node ids and edge layout are kept short so dagre lays it out as
 *     a tidy diamond inside the empty Flow panel.
 *   - Node types cover the 5 most visually distinct categories (trigger,
 *     ask_question, condition, assign_to_team, send_message) so a first-
 *     time user sees the dominant cards Wati flows are built from.
 *   - `expectedReplies` is included on the ask_question so the NodeCard
 *     body shows quick-reply chips — that's the most informative preview.
 */
const RAW_SAMPLE_FLOW: Flow = {
  id: 'sample_buyer_seller',
  name: 'Buyer / seller routing',
  prompt:
    'When a new contact messages us, ask if they are a buyer or a seller. Route buyers to the sales team and send sellers our help article.',
  trigger: { type: 'new_message' },
  entryNodeId: 'n0',
  nodes: [
    { id: 'n0', type: 'trigger', label: 'New contact message', config: {} },
    {
      id: 'n1',
      type: 'ask_question',
      label: 'Buyer or seller?',
      config: {
        text: 'Are you a buyer or a seller?',
        expectedReplies: ['Buyer', 'Seller'],
      },
    },
    { id: 'n2', type: 'condition', label: 'Match reply', config: {} },
    {
      id: 'n3',
      type: 'assign_to_team',
      label: 'Route to Sales',
      config: { team: 'Sales' },
    },
    {
      id: 'n4',
      type: 'send_message',
      label: 'Help article',
      config: { text: 'Here is our help article: https://example.com/help' },
    },
  ],
  edges: [
    { id: 'e0', from: 'n0', to: 'n1' },
    { id: 'e1', from: 'n1', to: 'n2' },
    { id: 'e2', from: 'n2', to: 'n3', condition: 'Buyer' },
    { id: 'e3', from: 'n2', to: 'n4', condition: 'Seller' },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

/**
 * Final export — re-parsed through the shared Zod schema so a future typo
 * in the literal above (wrong node type, missing required field, etc.)
 * surfaces immediately when the module is imported rather than when the
 * graph eventually tries to render.
 */
export const SAMPLE_FLOW: Flow = FlowSchema.parse(RAW_SAMPLE_FLOW);
