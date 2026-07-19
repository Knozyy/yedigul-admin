import { randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'yg_local_sid';

function token(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

export class SessionStore {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.sessions = new Map();
  }

  get(id) {
    const session = id ? this.sessions.get(id) : null;
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    session.expiresAt = Date.now() + this.ttlMs;
    return session;
  }

  create() {
    const id = token();
    const session = { id, csrf: token(), remoteToken: null, expiresAt: Date.now() + this.ttlMs };
    this.sessions.set(id, session);
    return session;
  }

  getOrCreate(id) {
    return this.get(id) || this.create();
  }

  clearRemoteToken(session) {
    if (session) session.remoteToken = null;
  }

  verifyCsrf(session, submitted) {
    return Boolean(session && safeEqual(session.csrf, submitted));
  }

  prune() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id);
    }
  }
}

