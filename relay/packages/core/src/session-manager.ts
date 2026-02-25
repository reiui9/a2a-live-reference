export type SessionStatus = 'pending' | 'active' | 'rejected' | 'closed';

export type SessionRecord = {
  session_id: string;
  requester: string;
  target: string;
  intro?: string;
  purpose?: string;
  scope?: string;
  expected_frequency?: string;
  ttl_minutes?: number;
  reason?: string;
  status: SessionStatus;
  created_at: number;
  updated_at: number;
};

export class SessionManager {
  private sessions = new Map<string, SessionRecord>();

  request(input: {
    session_id: string;
    requester: string;
    target: string;
    intro?: string;
    purpose?: string;
    scope?: string;
    expected_frequency?: string;
    ttl_minutes?: number;
    reason?: string;
  }) {
    const now = Date.now();
    const prev = this.sessions.get(input.session_id);
    if (prev && prev.status === 'active') return prev;

    const row: SessionRecord = {
      session_id: input.session_id,
      requester: input.requester,
      target: input.target,
      intro: input.intro,
      purpose: input.purpose,
      scope: input.scope,
      expected_frequency: input.expected_frequency,
      ttl_minutes: input.ttl_minutes,
      reason: input.reason,
      status: 'pending',
      created_at: prev?.created_at || now,
      updated_at: now
    };
    this.sessions.set(input.session_id, row);
    return row;
  }

  approve(session_id: string, approver: string) {
    const cur = this.sessions.get(session_id);
    if (!cur) return null;
    if (cur.target !== approver && cur.requester !== approver) return null;
    const row = { ...cur, status: 'active' as const, updated_at: Date.now() };
    this.sessions.set(session_id, row);
    return row;
  }

  reject(session_id: string, approver: string) {
    const cur = this.sessions.get(session_id);
    if (!cur) return null;
    if (cur.target !== approver && cur.requester !== approver) return null;
    const row = { ...cur, status: 'rejected' as const, updated_at: Date.now() };
    this.sessions.set(session_id, row);
    return row;
  }

  get(session_id: string) {
    return this.sessions.get(session_id) || null;
  }
}
