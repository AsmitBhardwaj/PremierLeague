'use client';

import { useEffect, useState } from 'react';

const HERO_CTA = 'hero-cta';
const SIGNOFF_CTA = 'signoff-cta';
/** Hide the bar this far before the sign-off CTA would enter the screen. */
const SIGNOFF_LEAD_PX = 160;

/**
 * Phone-only bottom CTA. It appears once the hero's lower-third CTA has scrolled out of view
 * (above the screen), and hides again as the sign-off CTA approaches, so the two are never
 * visible together. While shown it adds matching bottom padding to the page.
 */
export function StickyCta() {
  const [heroGone, setHeroGone] = useState(false);
  const [signoffNear, setSignoffNear] = useState(false);
  const visible = heroGone && !signoffNear;

  useEffect(() => {
    const hero = document.getElementById(HERO_CTA);
    const signoff = document.getElementById(SIGNOFF_CTA);
    if (!hero || !signoff) return;
    const heroObserver = new IntersectionObserver(([entry]) => {
      if (entry) setHeroGone(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    // Near, on screen or already scrolled past: all of these keep the bar hidden.
    const signoffObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry) setSignoffNear(entry.isIntersecting || entry.boundingClientRect.top < 0);
      },
      { rootMargin: `0px 0px ${SIGNOFF_LEAD_PX}px 0px` },
    );
    heroObserver.observe(hero);
    signoffObserver.observe(signoff);
    return () => {
      heroObserver.disconnect();
      signoffObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.dataset.stickyCta = 'on';
    else delete root.dataset.stickyCta;
    return () => {
      delete root.dataset.stickyCta;
    };
  }, [visible]);

  return (
    <div className={`sticky-cta ${visible ? 'visible' : ''}`} aria-hidden={!visible}>
      <a className="button button-primary button-default" href="/play">
        Start your career <span aria-hidden="true">→</span>
      </a>
    </div>
  );
}
