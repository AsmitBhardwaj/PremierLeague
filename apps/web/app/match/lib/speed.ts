import { useCallback, useEffect, useState } from 'react';

/** Playback speed only: ×1 plays a match in about 30 seconds, ×2 in about 15. Never affects results. */
export type PlaybackSpeed = 1 | 2;

export const SPEEDS: readonly PlaybackSpeed[] = [1, 2];
export const SPEED_STORAGE_KEY = '21st-club-playback-speed';

export const parseSpeed = (raw: string | null | undefined): PlaybackSpeed => (raw === '2' ? 2 : 1);

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

/** The remembered speed; ×1 whenever storage is missing, blocked or holds anything else. */
export function readSpeed(storage?: ReadableStorage): PlaybackSpeed {
  try {
    return parseSpeed((storage ?? localStorage).getItem(SPEED_STORAGE_KEY));
  } catch {
    return 1;
  }
}

export function writeSpeed(speed: PlaybackSpeed, storage?: WritableStorage): void {
  try {
    (storage ?? localStorage).setItem(SPEED_STORAGE_KEY, String(speed));
  } catch {
    // Playback still works when storage is blocked or full.
  }
}

/** How long a schedule of `totalMs` takes to watch at this speed. */
export const watchMs = (totalMs: number, speed: PlaybackSpeed): number => totalMs / speed;

/** The remembered speed, shared across matches and sessions. Starts at ×1 until storage is read. */
export function usePlaybackSpeed(): [PlaybackSpeed, (speed: PlaybackSpeed) => void] {
  const [speed, setSpeedState] = useState<PlaybackSpeed>(1);
  useEffect(() => setSpeedState(readSpeed()), []);
  const setSpeed = useCallback((next: PlaybackSpeed) => {
    setSpeedState(next);
    writeSpeed(next);
  }, []);
  return [speed, setSpeed];
}
