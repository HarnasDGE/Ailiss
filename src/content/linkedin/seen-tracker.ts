/**
 * Zapamiętuje posty, które użytkownik już zobaczył (realnie widoczne na ekranie).
 * Takich postów nie zwijamy automatycznie — późna decyzja (LLM, doładowany tekst)
 * zamienia się w dyskretną etykietę zamiast „znikania” treści pod oczami czytelnika.
 */
const MIN_VISIBLE_PX = 120;

export class SeenTracker {
  private readonly seen = new WeakSet<Element>();
  private readonly observer: IntersectionObserver;

  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const visible = entry.intersectionRect.height;
          if (visible >= Math.min(MIN_VISIBLE_PX, entry.boundingClientRect.height * 0.5)) {
            this.seen.add(entry.target);
            this.observer.unobserve(entry.target);
          }
        }
      },
      { threshold: [0, 0.1, 0.25, 0.5, 1] },
    );
  }

  track(el: Element): void {
    this.observer.observe(el);
  }

  isSeen(el: Element): boolean {
    return this.seen.has(el);
  }

  disconnect(): void {
    this.observer.disconnect();
  }
}
