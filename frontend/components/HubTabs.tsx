import Link from 'next/link';
import type { Route } from 'next';

/**
 * Underline-style tab strip used at the top of "hub" pages (/votes, /persons)
 * to switch between sibling surfaces without leaving the route. Tabs are
 * plain URL state — bookmarkable, no JS required, SSR-friendly. The visual
 * language matches the kind-tabs already used at /topics (font weight + ink
 * underline) so the system feels uniform.
 *
 * Plain `<Link>` + active boolean — no Headless UI / Radix, as the task
 * spec mandates.
 */
export function HubTabs({
  tabs,
  ariaLabel,
}: {
  tabs: { href: Route; label: string; active: boolean; sublabel?: string }[];
  ariaLabel: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="hub-tabs"
      style={{
        display: 'flex',
        gap: 0,
        marginTop: 4,
        borderBottom: '1px solid var(--rule)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '12px 18px',
            textDecoration: 'none',
            color: t.active ? 'var(--ink)' : 'var(--ink-3)',
            borderBottom: t.active
              ? '2px solid var(--ink)'
              : '2px solid transparent',
            marginBottom: -1,
            fontWeight: t.active ? 600 : 500,
            whiteSpace: 'nowrap',
            flex: '0 0 auto',
          }}
          aria-current={t.active ? 'page' : undefined}
        >
          <span style={{ fontSize: 14 }}>{t.label}</span>
          {t.sublabel && (
            <span
              className="tabular"
              style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}
            >
              {t.sublabel}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
