import type { SeasonRequest, SeasonResponse } from './protocol';

type Pending = {
  resolve: (value: Extract<SeasonResponse, { ok: true }>) => void;
  reject: (error: Error & { reason?: string }) => void;
};

/** Promise wrapper over the season worker: one request in flight per id. */
export class SeasonClient {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor() {
    this.worker = new Worker(new URL('../season.worker.ts', import.meta.url));
    this.worker.onmessage = ({ data }: MessageEvent<SeasonResponse>) => {
      const entry = this.pending.get(data.id);
      if (!entry) return;
      this.pending.delete(data.id);
      if (data.ok) entry.resolve(data);
      else entry.reject(Object.assign(new Error(data.error), { reason: data.reason }));
    };
    this.worker.onerror = () => {
      for (const entry of this.pending.values()) {
        entry.reject(new Error('The browser could not run the season worker.'));
      }
      this.pending.clear();
    };
  }

  send(request: SeasonRequest): Promise<Extract<SeasonResponse, { ok: true }>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...request, id });
    });
  }

  terminate(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}
