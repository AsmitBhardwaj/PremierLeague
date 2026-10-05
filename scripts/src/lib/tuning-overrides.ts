import { SEASON, TUNING } from '@pl/engine';

/**
 * Apply `--set path=value` arguments for this run only. Paths normally walk into TUNING; prefix a
 * path with `season.` to walk into SEASON instead. Examples: `--set penaltyShare.central=0.08`,
 * `--set zoneWeight.MID.5=0.6`, or `--set season.formBaseline.GK=6`.
 */
export function applyTuningOverrides(args: readonly string[]): void {
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--set') continue;
    const [path, raw] = (args[i + 1] ?? '').split('=');
    if (!path || raw === undefined || Number.isNaN(Number(raw))) {
      throw new Error('use --set a.b=1.5');
    }
    const keys = path.split('.');
    const root = keys[0] === 'season' ? SEASON : TUNING;
    if (keys[0] === 'season') keys.shift();
    let target = root as unknown as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
    target[keys.at(-1)!] = Number(raw);
  }
}
