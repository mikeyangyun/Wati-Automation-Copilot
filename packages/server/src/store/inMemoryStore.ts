import type { Flow, Session } from 'shared';

export class InMemoryStore {
  private readonly flows = new Map<string, Flow>();
  private readonly sessions = new Map<string, Session>();

  saveFlow(flow: Flow): void {
    this.flows.set(flow.id, flow);
  }

  getFlow(id: string): Flow | undefined {
    return this.flows.get(id);
  }

  saveSession(session: Session): void {
    this.sessions.set(session.id, session);
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }
}
