'use client';

import { useEffect, useState, type ComponentType } from 'react';

/**
 * The hero's studio screen. The frame, names and an empty striped pitch render instantly with the
 * page; the replay itself (renderer + a checked-in engine timeline) loads lazily when idle.
 */
export function HeroMatch({ homeName, awayName }: { homeName: string; awayName: string }) {
  const [Player, setPlayer] = useState<ComponentType<{ reducedMotion: boolean }> | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const listener = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener('change', listener);

    let cancelled = false;
    const load = () => {
      void import('./HeroMatchPlayer').then((module) => {
        if (!cancelled) setPlayer(() => module.HeroMatchPlayer);
      });
    };
    const useIdle = typeof window.requestIdleCallback === 'function';
    const handle = useIdle
      ? window.requestIdleCallback(load, { timeout: 1_200 })
      : window.setTimeout(load, 300);
    return () => {
      cancelled = true;
      query.removeEventListener('change', listener);
      if (useIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  return (
    <div className="studio-screen hero-match">
      <div className="studio-screen-bar">
        <span>Match preview</span>
        <span>20-second matches</span>
      </div>
      <div className="hm-stage">
        {Player ? (
          <Player reducedMotion={reducedMotion} />
        ) : (
          <>
            <div className="hm-bug" aria-hidden="true">
              <span className="hm-tag">Sample match</span>
              <span className="hm-team">{homeName}</span>
              <strong className="hm-score">0–0</strong>
              <span className="hm-team">{awayName}</span>
              <time>0&apos;</time>
            </div>
            <div className="hm-pitch viewer-pitch" aria-hidden="true" />
          </>
        )}
      </div>
      <div className="hm-cta">
        <p>Pick your XI, set tactics, play every match.</p>
        <a className="button button-primary button-default" href="/play">
          Play your own <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  );
}
