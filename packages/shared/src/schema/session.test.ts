import { describe, expect, it } from 'vitest';

import { SessionSchema, SessionStatusEnum } from './session';

const baseSession = {
  id: 'sess_1',
  flowId: 'flow_1',
  currentNodeId: 'n0',
  status: 'running',
  transcript: [],
  context: { retryCount: 0 },
};

describe('SessionStatusEnum', () => {
  it('lists every status the executor can produce', () => {
    expect(SessionStatusEnum.options).toEqual([
      'running',
      'waiting_for_input',
      'completed',
      'handed_off',
    ]);
  });
});

describe('SessionSchema — happy paths', () => {
  it('parses a freshly created running session', () => {
    const session = SessionSchema.parse(baseSession);
    expect(session.status).toBe('running');
    expect(session.transcript).toEqual([]);
    expect(session.context.retryCount).toBe(0);
  });

  it('parses a session awaiting input with retry context', () => {
    const session = SessionSchema.parse({
      ...baseSession,
      status: 'waiting_for_input',
      context: { retryCount: 1, lastQuestionNodeId: 'n1' },
      transcript: [
        {
          role: 'bot',
          content: 'Are you a buyer or a seller?',
          nodeId: 'n1',
          timestamp: '2026-05-23T07:50:00Z',
        },
      ],
    });
    expect(session.status).toBe('waiting_for_input');
    expect(session.context.lastQuestionNodeId).toBe('n1');
  });
});

describe('SessionSchema — violations', () => {
  it('rejects an unknown status', () => {
    expect(() => SessionSchema.parse({ ...baseSession, status: 'paused' })).toThrow();
  });

  it('rejects a negative retryCount', () => {
    expect(() =>
      SessionSchema.parse({
        ...baseSession,
        context: { retryCount: -1 },
      }),
    ).toThrow();
  });

  it('rejects a transcript entry that fails MessageSchema', () => {
    expect(() =>
      SessionSchema.parse({
        ...baseSession,
        transcript: [
          {
            role: 'bot',
            content: 'hi',
            timestamp: '2026-05-23T07:50:00Z',
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects missing context', () => {
    const { context: _ignored, ...withoutContext } = baseSession;
    void _ignored;
    expect(() => SessionSchema.parse(withoutContext)).toThrow();
  });
});
