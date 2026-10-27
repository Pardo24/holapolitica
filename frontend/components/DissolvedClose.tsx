'use client';

import { X } from 'lucide-react';

/**
 * The home's "Cortes dissolved" note can be closed: a reader who has read
 * it once does not need it on every visit until December.
 *
 * Remembered per browser. As with the first-visit note (IntroNote), a
 * script in <head> (app/layout.tsx) marks <html> before the first paint,
 * and CSS hides the note, so it never shows and then vanishes. Storage can
 * throw (private windows): then the note just shows, as before.
 */

const STORAGE_KEY = 'holapolitica.dissolved-closed.v1';

export const DISSOLVED_CLOSED_SCRIPT = `try{if(localStorage.getItem('${STORAGE_KEY}'))document.documentElement.classList.add('dissolved-closed')}catch(e){}`;

export function DissolvedClose({ label }: { label: string }) {
  function close() {
    document.documentElement.classList.add('dissolved-closed');
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* nothing to remember it with */
    }
  }

  return (
    <button type="button" onClick={close} aria-label={label} title={label} className="dissolved__close">
      <X size={15} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
