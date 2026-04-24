import { bootstrap, type CfrSession } from "../cfr/client.js";
import { SerializedQueue } from "./queue.js";

export type SessionState = "cold" | "fresh" | "busy" | "dead";
export type DeathReason = "captcha" | "upstream" | "bootstrap-failed" | "age-expired-soft";

export class Session {
  readonly id: string;
  readonly queue = new SerializedQueue();
  state: SessionState = "cold";
  lastWarmedAt = 0;
  deathReason: DeathReason | null = null;
  private creds: CfrSession | null = null;

  constructor(id: string) {
    this.id = id;
  }

  get creds_(): CfrSession {
    if (!this.creds) throw new Error(`Session ${this.id} not warmed`);
    return this.creds;
  }

  async warm(from: string, to: string): Promise<void> {
    try {
      this.creds = await bootstrap(from, to);
      this.state = "fresh";
      this.lastWarmedAt = Date.now();
      this.deathReason = null;
    } catch (err) {
      this.kill("bootstrap-failed");
      throw err;
    }
  }

  kill(reason: DeathReason): void {
    this.state = "dead";
    this.deathReason = reason;
    this.creds = null;
  }

  run<T>(fn: (creds: CfrSession) => Promise<T>): Promise<T> {
    return this.queue.run(() => {
      const c = this.creds_;
      this.state = "busy";
      return fn(c).finally(() => {
        if (this.state === "busy") this.state = "fresh";
      });
    });
  }

  isStale(now: number, thresholdMs: number): boolean {
    return now - this.lastWarmedAt > thresholdMs;
  }

  async refresh(from: string, to: string): Promise<void> {
    await this.warm(from, to);
  }
}
