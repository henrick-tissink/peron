export class SerializedQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(() => fn(), () => fn());
    this.tail = next.catch(() => undefined);
    return next;
  }
}
