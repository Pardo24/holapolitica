'use client';

import { usePathname } from 'next/navigation';

/**
 * The desktop language switcher: one tiny form per language, POSTed to
 * /api/locale, which sets the cookie and redirects back.
 *
 * Back to WHERE is read at the moment of the click. The switcher used to
 * live in the server-rendered nav, which the App Router does not re-render
 * on client navigations, so its "current page" was the first page of the
 * visit: change language on a deputy's profile and land on the home.
 * ``usePathname`` keeps the no-JS fallback right; ``onSubmit`` adds the
 * query string (a filtered list stays filtered).
 */
export function LangSwitch({ locales, current }: { locales: readonly string[]; current: string }) {
  const pathname = usePathname() ?? '/';
  return (
    <div className="lang" aria-label="Language">
      {locales.map((l, i) => {
        const isActive = l === current;
        return (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && (
              <span aria-hidden="true" style={{ color: 'var(--ink-3)' }}>
                ·
              </span>
            )}
            <form
              action="/api/locale"
              method="POST"
              style={{ display: 'inline' }}
              onSubmit={(e) => {
                const input = e.currentTarget.elements.namedItem('redirect') as HTMLInputElement;
                input.value = window.location.pathname + window.location.search;
              }}
            >
              <input type="hidden" name="locale" value={l} />
              <input type="hidden" name="redirect" value={pathname} />
              <button
                type="submit"
                className={isActive ? 'lang-btn active' : 'lang-btn'}
                aria-current={isActive ? 'true' : undefined}
                aria-label={`Switch language to ${l.toUpperCase()}`}
                style={{
                  background: 'transparent',
                  border: 0,
                  padding: '2px 4px',
                  cursor: 'pointer',
                  font: 'inherit',
                  color: isActive ? 'var(--ink)' : 'var(--ink-3)',
                  fontWeight: isActive ? 700 : 400,
                  textTransform: 'uppercase',
                  letterSpacing: 0,
                  borderRadius: 4,
                }}
              >
                {l.toUpperCase()}
              </button>
            </form>
          </span>
        );
      })}
    </div>
  );
}
