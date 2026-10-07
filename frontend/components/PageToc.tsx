'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * "On this page" for long reference pages.
 *
 * One list, two shapes:
 *   - desktop: a sticky column beside the text, the active section marked;
 *   - phone: a sticky row of chips under the app bar, scrolled so the
 *     active chip stays in view, the way an app's segmented header does.
 *
 * Plain ``#id`` links, so every section is addressable from anywhere on
 * the site (``/about#ia`` from an "AI summary" label, ``/about#glossari``
 * from a term) and the browser does the scrolling. The observer only
 * decides which entry to highlight.
 */
export function PageToc({
  items,
  title,
}: {
  items: { id: string; label: string }[];
  title: string;
}) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);
  const rowRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const sections = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => el != null);
    if (sections.length === 0) return;
    // A section counts as "current" once its top passes a line just under
    // the sticky bars; the bottom margin keeps a short section from
    // stealing the highlight while it is merely visible lower down.
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        const first = items.find((it) => visible.get(it.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-120px 0px -55% 0px', threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
    // Arriving on a hash: highlight it straight away.
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash && items.some((it) => it.id === hash)) setActive(hash);
    return () => observer.disconnect();
  }, [items]);

  // Keep the active chip centred in the phone's row.
  useEffect(() => {
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({
      left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }, [active]);

  return (
    <nav className="page-toc" aria-label={title}>
      <span className="page-toc__title">{title}</span>
      <ul ref={rowRef} className="page-toc__list no-scrollbar">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              aria-current={active === it.id ? 'location' : undefined}
              onClick={() => setActive(it.id)}
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
