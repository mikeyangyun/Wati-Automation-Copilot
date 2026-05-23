import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { Issue } from 'shared';
import { z } from 'zod';

import type { FlowGenerator } from '../agents/flowAgent.js';
import type { FlowReviewer } from '../agents/reviewAgent.js';
import { AppError } from '../errors.js';
import { mergeIssues } from '../review/merge.js';
import type { InMemoryStore } from '../store/inMemoryStore.js';
import { validateFlow } from '../validator/structuralValidator.js';

export interface FlowsRoutesDeps {
  agent: FlowGenerator;
  reviewer: FlowReviewer;
  store: InMemoryStore;
}

/**
 * Body schema for POST /api/flows/generate.
 * `.trim()` normalises stored/forwarded prompt; `.min(1)` then rejects
 * whitespace-only input at the edge before any LLM call is made.
 */
const GenerateRequestSchema = z.object({
  prompt: z.string().trim().min(1),
});

const FlowIdParamsSchema = z.object({
  id: z.string().min(1),
});

export function buildFlowsRoutes(deps: FlowsRoutesDeps): FastifyPluginAsync {
  return async function flowsRoutes(app: FastifyInstance) {
    app.post('/flows/generate', async (req) => {
      const body = GenerateRequestSchema.parse(req.body);
      const flow = await deps.agent.generate(body.prompt);
      deps.store.saveFlow(flow);
      return { flow };
    });

    app.get('/flows/:id', async (req) => {
      const { id } = FlowIdParamsSchema.parse(req.params);
      const flow = deps.store.getFlow(id);
      if (!flow) {
        throw new AppError('FLOW_NOT_FOUND', `Flow ${id} not found`, 404);
      }
      return { flow };
    });

    app.post('/flows/:id/explain', async (req) => {
      const { id } = FlowIdParamsSchema.parse(req.params);
      const flow = deps.store.getFlow(id);
      if (!flow) {
        throw new AppError('FLOW_NOT_FOUND', `Flow ${id} not found`, 404);
      }
      const explanation = await deps.reviewer.explain(flow);
      return { explanation };
    });

    /**
     * Hybrid review: structural validator (deterministic, fast) and semantic
     * reviewer (LLM, slow) run in parallel via `Promise.allSettled`. When the
     * LLM fails for any reason we degrade gracefully — structural findings
     * still ship, plus an `info`-level `SEMANTIC_REVIEW_UNAVAILABLE` marker so
     * the client knows the coverage is partial. The endpoint therefore never
     * 5xx's on LLM trouble; it 5xx's only on programmer error.
     */
    app.post('/flows/:id/review', async (req) => {
      const { id } = FlowIdParamsSchema.parse(req.params);
      const flow = deps.store.getFlow(id);
      if (!flow) {
        throw new AppError('FLOW_NOT_FOUND', `Flow ${id} not found`, 404);
      }

      const [structuralOutcome, semanticOutcome] = await Promise.allSettled([
        Promise.resolve().then(() => validateFlow(flow)),
        deps.reviewer.review(flow),
      ]);

      if (structuralOutcome.status === 'rejected') {
        // Structural validator is pure & synchronous; a throw here is a bug.
        throw structuralOutcome.reason instanceof Error
          ? structuralOutcome.reason
          : new Error(String(structuralOutcome.reason));
      }
      const structural = structuralOutcome.value;

      let semantic: Issue[];
      if (semanticOutcome.status === 'fulfilled') {
        semantic = semanticOutcome.value;
      } else {
        semantic = [
          {
            severity: 'info',
            code: 'SEMANTIC_REVIEW_UNAVAILABLE',
            message: 'Semantic review is temporarily unavailable. Structural checks still ran.',
            nodeIds: [],
          },
        ];
        req.log.warn(
          { err: semanticOutcome.reason, flowId: id },
          'semantic review failed; degrading to structural only',
        );
      }

      const merged = mergeIssues(structural, semantic);
      return merged;
    });
  };
}
