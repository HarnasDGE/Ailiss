/**
 * Po `threshold` błędach z rzędu provider jest wyłączany na `cooldownMs`
 * (DESIGN §4.1) — w tym czasie zostaje wynik heurystyki.
 */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  lastError: string | undefined;

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 10 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  get isOpen(): boolean {
    return this.now() < this.openUntil;
  }

  get openUntilTime(): number | null {
    return this.isOpen ? this.openUntil : null;
  }

  success(): void {
    this.failures = 0;
    this.lastError = undefined;
  }

  failure(error: string): void {
    this.lastError = error;
    this.failures++;
    if (this.failures >= this.threshold) {
      this.openUntil = this.now() + this.cooldownMs;
      this.failures = 0;
    }
  }

  reset(): void {
    this.failures = 0;
    this.openUntil = 0;
    this.lastError = undefined;
  }
}
