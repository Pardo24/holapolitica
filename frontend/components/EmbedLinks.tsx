'use client';

import { useEffect } from 'react';

/**
 * Inside a newsroom's iframe, every link opens Hola Política in a new tab.
 *
 * The new widgets reuse the site's own cards, whose links are ordinary
 * in-app links: inside an iframe they would navigate the 300px frame to a
 * full page with no chrome, stranded inside the article. Intercepting the
 * click before Next's router sees it (capture phase, on the document)
 * sends the reader to the page in a tab of its own and leaves the article
 * where it was.
 *
 * Links that already carry a target (the older widgets use _top) and
 * in-page anchors are left alone; outside an iframe nothing changes.
 */
export function EmbedLinks() {
  useEffect(() => {
    if (window.parent === window) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target) return;
      const href = a.getAttribute('href') ?? '';
      if (href.startsWith('#')) return;
      e.preventDefault();
      e.stopPropagation();
      window.open(new URL(href, window.location.origin).href, '_blank', 'noopener');
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  return null;
}
