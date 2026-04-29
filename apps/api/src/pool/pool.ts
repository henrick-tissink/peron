import { nanoid } from "nanoid";
import { Session } from "./session.js";
import { CircuitBreaker, type BreakerConfig } from "./breaker.js";
import { CaptchaError, UpstreamError } from "../cfr/errors.js";

export type PoolConfig = {
  maxSize: number;
  breaker?: BreakerConfig;
};

export class SessionPool {
  readonly maxSize: number;
  private readonly sessions = new Map<string, Session>();
  private readonly breaker: CircuitBreaker;

  constructor(cfg: PoolConfig) {
    this.maxSize = cfg.maxSize;
    this.breaker = new CircuitBreaker(
      cfg.breaker ?? { threshold: 3, windowMs: 60_000, cooldownMs: 120_000 },
    );
  }

  get size(): number {
    return this.sessions.size;
  }

  getById(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  private async spawn(from: string, to: string): Promise<Session> {
    const s = new Session(nanoid(10));
    await s.warm(from, to);
    this.sessions.set(s.id, s);
    return s;
  }

  private evictOldestIdle(): void {
    let oldest: Session | undefined;
    for (const s of this.sessions.values()) {
      if (s.state === "busy") continue;
      if (!oldest || s.lastWarmedAt < oldest.lastWarmedAt) oldest = s;
    }
    if (oldest) this.sessions.delete(oldest.id);
  }

  // CFR's GetItineraries binds the ConfirmationKey scraped from
  // /ro-RO/Rute-trenuri/{from}/{to} to that exact pair; reusing a session
  // across different routes returns 400. So we always bootstrap a fresh
  // session against the user's pair. The session lingers in the pool so
  // the follow-up Price call can find it via withPinnedSession.
  async withSession<T>(
    from: string,
    to: string,
    fn: (s: Session) => Promise<T>,
  ): Promise<T> {
    const now = Date.now();
    if (this.breaker.isOpen(now)) {
      throw new CaptchaError(
        `pool breaker open; retry in ${this.breaker.retryAfterSec(now)}s`,
      );
    }

    if (this.sessions.size >= this.maxSize) {
      this.evictOldestIdle();
    }
    const session = await this.spawn(from, to);

    try {
      return await session.run(() => fn(session));
    } catch (err) {
      if (err instanceof CaptchaError) {
        session.kill("captcha");
        this.sessions.delete(session.id);
        this.breaker.record(Date.now());
      } else if (err instanceof Error && err.name === "UpstreamError") {
        session.kill("upstream");
        this.sessions.delete(session.id);
      }
      throw err;
    }
  }

  async withPinnedSession<T>(
    sessionId: string,
    fn: (s: Session) => Promise<T>,
  ): Promise<T> {
    const now = Date.now();
    if (this.breaker.isOpen(now)) {
      throw new CaptchaError(
        `pool breaker open; retry in ${this.breaker.retryAfterSec(now)}s`,
      );
    }
    const session = this.sessions.get(sessionId);
    if (!session || session.state === "dead") {
      throw new UpstreamError(`pinned session ${sessionId} unavailable`, 410);
    }
    try {
      return await session.run(() => fn(session));
    } catch (err) {
      if (err instanceof CaptchaError) {
        session.kill("captcha");
        this.sessions.delete(session.id);
        this.breaker.record(Date.now());
      } else if (err instanceof Error && err.name === "UpstreamError") {
        session.kill("upstream");
        this.sessions.delete(session.id);
      }
      throw err;
    }
  }

  get breakerOpen(): boolean {
    return this.breaker.isOpen(Date.now());
  }
}
