import { FlowSchema, SessionSchema, type Flow, type Session } from 'shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryStore } from './inMemoryStore.js';

const buildFlow = (overrides: Partial<Flow> = {}): Flow =>
  FlowSchema.parse({
    id: 'flow_a',
    name: 'Echo',
    prompt: 'Say hi',
    trigger: { type: 'new_message' },
    entryNodeId: 'n0',
    nodes: [{ id: 'n0', type: 'trigger', label: 'Start', config: {} }],
    edges: [],
    createdAt: '2026-05-23T07:50:00Z',
    ...overrides,
  });

const buildSession = (overrides: Partial<Session> = {}): Session =>
  SessionSchema.parse({
    id: 'sess_a',
    flowId: 'flow_a',
    currentNodeId: 'n0',
    status: 'running',
    transcript: [],
    context: { retryCount: 0 },
    ...overrides,
  });

describe('InMemoryStore', () => {
  let store: InMemoryStore;
  beforeEach(() => {
    store = new InMemoryStore();
  });

  describe('flows', () => {
    it('returns undefined for an unknown id', () => {
      expect(store.getFlow('flow_missing')).toBeUndefined();
    });

    it('round-trips a saved flow', () => {
      const flow = buildFlow();
      store.saveFlow(flow);
      expect(store.getFlow(flow.id)).toEqual(flow);
    });

    it('overwrites when the same id is saved twice', () => {
      store.saveFlow(buildFlow({ name: 'first' }));
      store.saveFlow(buildFlow({ name: 'second' }));
      expect(store.getFlow('flow_a')?.name).toBe('second');
    });

    it('keeps two distinct flows independent', () => {
      store.saveFlow(buildFlow({ id: 'flow_a', name: 'A' }));
      store.saveFlow(buildFlow({ id: 'flow_b', name: 'B' }));
      expect(store.getFlow('flow_a')?.name).toBe('A');
      expect(store.getFlow('flow_b')?.name).toBe('B');
    });
  });

  describe('sessions', () => {
    it('returns undefined for an unknown id', () => {
      expect(store.getSession('sess_missing')).toBeUndefined();
    });

    it('round-trips a saved session', () => {
      const session = buildSession();
      store.saveSession(session);
      expect(store.getSession(session.id)).toEqual(session);
    });

    it('overwrites when the same id is saved twice', () => {
      store.saveSession(buildSession({ status: 'running' }));
      store.saveSession(buildSession({ status: 'completed' }));
      expect(store.getSession('sess_a')?.status).toBe('completed');
    });
  });

  describe('isolation', () => {
    it('does not surface a session under getFlow or vice versa', () => {
      store.saveFlow(buildFlow({ id: 'shared_id' }));
      store.saveSession(buildSession({ id: 'shared_id' }));
      expect(store.getFlow('shared_id')).toBeDefined();
      expect(store.getSession('shared_id')).toBeDefined();
      expect(store.getFlow('shared_id')).not.toEqual(store.getSession('shared_id'));
    });

    it('keeps separate store instances from sharing state', () => {
      const a = new InMemoryStore();
      const b = new InMemoryStore();
      a.saveFlow(buildFlow());
      expect(b.getFlow('flow_a')).toBeUndefined();
    });
  });
});
