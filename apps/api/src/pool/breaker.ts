export type BreakerConfig = {
  threshold: number;
  windowMs: number;
  cooldownMs: number;
};

export class CircuitBreaker {
  private events: number[] = [];
  private openedAt: number | null = null;

  constructor(private readonly cfg: BreakerConfig) {}

  record(now: number): void {
    this.events.push(now);
    const cutoff = now - this.cfg.windowMs;
    this.events = this.events.filter((t) => t >= cutoff);
    if (this.events.length >= this.cfg.threshold && this.openedAt === null) {
      this.openedAt = now;
    }
  }

  isOpen(now: number): boolean {
    if (this.openedAt === null) return false;
    if (now - this.openedAt >= this.cfg.cooldownMs) {
      this.openedAt = null;
      this.events = [];
      return false;
    }
    return true;
  }

  retryAfterSec(now: number): number {
    if (this.openedAt === null) return 0;
    const remaining = this.cfg.cooldownMs - (now - this.openedAt);
    return Math.max(1, Math.ceil(remaining / 1000));
  }
}
