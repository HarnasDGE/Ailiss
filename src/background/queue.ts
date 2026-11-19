import type { LlmVerdict, PostInput } from '../shared/types';

export const BATCH_SIZE = 5;
export const BATCH_DELAY_MS = 400;
export const MAX_IN_FLIGHT = 2;

export interface BatchQueueDeps {
  /** Wysłanie batcha; rzuca błąd przy awarii providera. */
  classify: (posts: PostInput[]) => Promise<Map<string, LlmVerdict>>;
  delayMs?: number;
}

interface Pending {
  post: PostInput;
  resolve: (verdict: LlmVerdict | null) => void;
}

/**
 * Zbiera pojedyncze żądania z wielu kart w batche (max 5 postów, okno 400 ms)
 * i ogranicza liczbę równoległych żądań do providera.
 */
export class BatchQueue {
  private pending: Pending[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight = 0;
  /** Te same posty z kilku kart → jedno zapytanie. */
  private waiting = new Map<string, Promise<LlmVerdict | null>>();

  constructor(private readonly deps: BatchQueueDeps) {}

  enqueue(post: PostInput): Promise<LlmVerdict | null> {
    const existing = this.waiting.get(post.key);
    if (existing) return existing;
    const promise = new Promise<LlmVerdict | null>((resolve) => {
      this.pending.push({ post, resolve });
      this.schedule();
    }).finally(() => this.waiting.delete(post.key));
    this.waiting.set(post.key, promise);
    return promise;
  }

  private schedule(): void {
    if (this.pending.length >= BATCH_SIZE) {
      this.flush();
      return;
    }
    this.timer ??= setTimeout(() => this.flush(), this.deps.delayMs ?? BATCH_DELAY_MS);
  }

  private flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    while (this.pending.length > 0 && this.inFlight < MAX_IN_FLIGHT) {
      const batch = this.pending.splice(0, BATCH_SIZE);
      void this.run(batch);
    }
    if (this.pending.length > 0) this.timer = setTimeout(() => this.flush(), this.deps.delayMs ?? BATCH_DELAY_MS);
  }

  private async run(batch: Pending[]): Promise<void> {
    this.inFlight++;
    try {
      const verdicts = await this.deps.classify(batch.map((b) => b.post));
      for (const b of batch) b.resolve(verdicts.get(b.post.key) ?? null);
    } catch {
      for (const b of batch) b.resolve(null);
    } finally {
      this.inFlight--;
      if (this.pending.length > 0) this.flush();
    }
  }
}
