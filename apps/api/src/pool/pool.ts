import { nanoid } from "nanoid";
import { Session } from "./session.js";

export type PoolConfig = {
  maxSize: number;
  warmFrom?: string;
  warmTo?: string;
  staleAfterMs?: number;
};

const DEFAULT_WARM_FROM = "Bucuresti-Nord";
const DEFAULT_WARM_TO = "Brasov";
const DEFAULT_STALE_MS = 15 * 60 * 1000; // 15 minutes

export class SessionPool {
  readonly maxSize: number;
  private readonly warmFrom: string;
  private readonly warmTo: string;
  private readonly staleAfterMs: number;
  private readonly sessions = new Map<string, Session>();

  constructor(cfg: PoolConfig) {
    this.maxSize = cfg.maxSize;
    this.warmFrom = cfg.warmFrom ?? DEFAULT_WARM_FROM;
    this.warmTo = cfg.warmTo ?? DEFAULT_WARM_TO;
    this.staleAfterMs = cfg.staleAfterMs ?? DEFAULT_STALE_MS;
  }

  get size(): number {
    return this.sessions.size;
  }

  getById(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  private async spawn(): Promise<Session> {
    const s = new Session(nanoid(10));
    await s.warm(this.warmFrom, this.warmTo);
    this.sessions.set(s.id, s);
    return s;
  }

  private evict(id: string): void {
    this.sessions.delete(id);
  }

  /**
   * Acquire a session, run fn, release.
   * - If an idle fresh session has a free queue → use it.
   * - Else if pool not full → spawn a new session.
   * - Else → pick the least-busy existing session (shortest queue) and enqueue.
   */
  async withSession<T>(fn: (s: Session) => Promise<T>): Promise<T> {
    const alive = [...this.sessions.values()].filter((s) => s.state !== "dead");

    let session: Session | undefined = alive.find((s) => s.state === "fresh");

    if (!session && this.sessions.size < this.maxSize) {
      session = await this.spawn();
    }

    if (!session) {
      session = alive[0]!;
    }

    if (session.isStale(Date.now(), this.staleAfterMs)) {
      await session.refresh(this.warmFrom, this.warmTo);
    }

    try {
      return await session.run(() => fn(session!));
    } catch (err) {
      if (err instanceof Error && err.name === "CaptchaError") {
        session.kill("captcha");
        this.evict(session.id);
      } else if (err instanceof Error && err.name === "UpstreamError") {
        session.kill("upstream");
        this.evict(session.id);
      }
      throw err;
    }
  }
}
