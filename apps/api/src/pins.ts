export type PinMapConfig = { ttlMs: number };

type Entry = { sessionId: string; expiresAt: number };

export class PinMap {
  private readonly ttlMs: number;
  private readonly map = new Map<string, Entry>();

  constructor(cfg: PinMapConfig) {
    this.ttlMs = cfg.ttlMs;
  }

  get size(): number {
    return this.map.size;
  }

  set(transactionString: string, sessionId: string): void {
    this.map.set(transactionString, {
      sessionId,
      expiresAt: Date.now() + this.ttlMs,
    });
    this.sweep();
  }

  setMany(sessionId: string, transactionStrings: string[]): void {
    const expiresAt = Date.now() + this.ttlMs;
    for (const tx of transactionStrings) {
      this.map.set(tx, { sessionId, expiresAt });
    }
    this.sweep();
  }

  get(transactionString: string): string | undefined {
    const entry = this.map.get(transactionString);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(transactionString);
      return undefined;
    }
    return entry.sessionId;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [tx, entry] of this.map) {
      if (entry.expiresAt <= now) this.map.delete(tx);
    }
  }
}
