// Fetches FPL data and caches the raw JSON under scripts/data/cache/ (gitignored).
//   pnpm --filter @pl/scripts fpl-sync [--refresh]
// Requests are sequential with a short delay; anything already cached is skipped unless --refresh.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { BOOTSTRAP_FILE, ensureCacheDirs, summaryFile } from './lib/fpl-cache';

const BASE = 'https://fantasy.premierleague.com/api';
const DELAY_MS = 300;
const MAX_ATTEMPTS = 4;
const refresh = process.argv.includes('--refresh');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'premier-league-club-builder (personal project)' },
      });
      if (res.ok) return await res.text();
      if (attempt >= MAX_ATTEMPTS || (res.status !== 429 && res.status < 500)) {
        throw new Error(`${url} -> HTTP ${res.status}`);
      }
      console.warn(`  HTTP ${res.status} for ${url}, retrying (${attempt}/${MAX_ATTEMPTS})`);
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      console.warn(`  ${String(err)}, retrying (${attempt}/${MAX_ATTEMPTS})`);
    }
    await sleep(2000 * attempt);
  }
}

function writeAtomic(file: string, body: string): void {
  JSON.parse(body); // refuse to cache anything that is not valid JSON
  writeFileSync(`${file}.tmp`, body);
  renameSync(`${file}.tmp`, file);
}

interface BootstrapPlayer {
  id: number;
  status: string;
}

async function main(): Promise<void> {
  ensureCacheDirs();

  let fetched = 0;
  if (refresh || !existsSync(BOOTSTRAP_FILE)) {
    console.log('Fetching bootstrap-static ...');
    writeAtomic(BOOTSTRAP_FILE, await fetchJson(`${BASE}/bootstrap-static/`));
    fetched++;
    await sleep(DELAY_MS);
  } else {
    console.log('bootstrap-static cached, skipping (use --refresh to re-fetch)');
  }

  const bootstrap = JSON.parse(readFileSync(BOOTSTRAP_FILE, 'utf8')) as {
    elements: BootstrapPlayer[];
  };
  // Players with status "u" have left the league; they can never be in a squad, so skip them.
  const players = bootstrap.elements.filter((p) => p.status !== 'u');
  console.log(
    `${players.length} players (${bootstrap.elements.length - players.length} unavailable skipped)`,
  );

  let cached = 0;
  for (const [i, p] of players.entries()) {
    const file = summaryFile(p.id);
    if (!refresh && existsSync(file)) {
      cached++;
      continue;
    }
    writeAtomic(file, await fetchJson(`${BASE}/element-summary/${p.id}/`));
    fetched++;
    if (fetched % 25 === 0)
      console.log(`  ${i + 1}/${players.length} (fetched ${fetched}, cached ${cached})`);
    await sleep(DELAY_MS);
  }
  console.log(`Done. Fetched ${fetched} file(s), reused ${cached} cached summaries.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
