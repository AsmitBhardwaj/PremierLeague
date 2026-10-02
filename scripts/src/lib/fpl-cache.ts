import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** scripts/data/cache — gitignored raw FPL JSON. */
export const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'cache');
export const BOOTSTRAP_FILE = join(CACHE_DIR, 'bootstrap-static.json');
export const summaryFile = (id: number): string => join(CACHE_DIR, 'element-summary', `${id}.json`);

export function ensureCacheDirs(): void {
  mkdirSync(join(CACHE_DIR, 'element-summary'), { recursive: true });
}

import { existsSync, readFileSync } from 'node:fs';
import type { FplBootstrapRaw, FplElementSummaryRaw } from '@pl/engine';

export function loadFplCache(): {
  bootstrap: FplBootstrapRaw;
  summaries: Map<number, FplElementSummaryRaw>;
} {
  if (!existsSync(BOOTSTRAP_FILE)) {
    throw new Error('No FPL cache found. Run: pnpm --filter @pl/scripts fpl-sync');
  }
  const bootstrap = JSON.parse(readFileSync(BOOTSTRAP_FILE, 'utf8')) as FplBootstrapRaw;
  const summaries = new Map<number, FplElementSummaryRaw>();
  for (const e of bootstrap.elements) {
    const file = summaryFile(e.id);
    if (existsSync(file)) {
      summaries.set(e.id, JSON.parse(readFileSync(file, 'utf8')) as FplElementSummaryRaw);
    }
  }
  return { bootstrap, summaries };
}
