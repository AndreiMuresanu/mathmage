/**
 * Calls back regularly even while the tab is hidden. Browsers stop drawing hidden tabs (so
 * Phaser's loop stops) and heavily slow their timers, but timers inside a dedicated Web Worker
 * keep running much closer to schedule. The worker just posts a tick; the work happens on the
 * main thread. Used so a multiplayer host keeps the match going when they switch tabs.
 */
export class BackgroundTicker {
  private worker: Worker | null = null;

  get running(): boolean {
    return this.worker !== null;
  }

  start(onTick: () => void, intervalMs = 33): void {
    if (this.worker) return;
    const source = `setInterval(() => postMessage(0), ${intervalMs});`;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      this.worker = new Worker(url);
      this.worker.onmessage = onTick;
    } catch {
      this.worker = null; // workers unavailable: the match will pause while hidden, as before
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
