'use client';

import { usePathname } from 'next/navigation';
import { Flag } from '@/components/icons';

const ADDRESS = 'dades@holapolitica.org';

function mailto(url: string, subject: string, body: string): string {
  const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace('{url}', url))}`;
  return `mailto:${ADDRESS}?${params}`;
}

/**
 * "Seen a mistake?" on every page: an email to the data address with the
 * page's own URL already in it, so a reader does not have to describe where
 * they were. The full URL (filters included) is read at click time; until
 * then the link carries the path, which is what the server can render.
 *
 * ``body`` holds a literal ``{url}`` placeholder (read with ``t.raw``).
 */
export function ReportErrorLink({ label, subject, body }: { label: string; subject: string; body: string }) {
  const pathname = usePathname();
  return (
    <a
      href={mailto(pathname, subject, body)}
      onClick={(e) => {
        e.currentTarget.href = mailto(window.location.href, subject, body);
      }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--ink-2)', marginRight: 12 }}
    >
      <Flag size={12} aria-hidden="true" />
      {label}
    </a>
  );
}
