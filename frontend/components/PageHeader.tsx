import type { CSSProperties, ReactNode } from 'react';

/**
 * Page-level header used at the top of every primary route.
 *
 * The title, and under it one short sentence that says what the page is
 * for. That sentence used to be a grey all-caps eyebrow set beside the
 * title ("ATLES · AGREGATS DESCRIPTIUS · CAP MÈTRICA UNILATERAL"): it read
 * as a label rather than as language, it explained more than anyone asked,
 * and in capitals at 11px it made every page open on something dull. Now
 * it is plain sentence case at reading size, directly under the title, so
 * the page opens the way an app screen does: what this is, in a line.
 *
 * Keep subtitles to one line of plain words. The detail belongs in the
 * page, or on /about.
 *
 * Optional `cta` slot renders to the right of the title on desktop (under
 * it on a phone); `children` render below the subtitle (filters, a meta
 * strip).
 */
export function PageHeader({
  title,
  subtitle,
  icon,
  hue,
  cta,
  children,
  className,
  style,
  bordered = false,
  headingClassName = 'h-headline',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Optional Lucide icon rendered before the H1 — small, accent-tinted. */
  icon?: ReactNode;
  /** The section's colour for the icon (a --hue-* token); accent if unset. */
  hue?: string;
  cta?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Add a 1px bottom border to mark the end of the header band. */
  bordered?: boolean;
  /** Override the H1 typographic class (e.g. 'h-display' for hero pages). */
  headingClassName?: string;
}) {
  return (
    <header
      className={['page-header', className].filter(Boolean).join(' ')}
      style={{
        paddingTop: 28,
        paddingBottom: 18,
        borderBottom: bordered ? '1px solid var(--rule)' : undefined,
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h1
          className={headingClassName}
          style={{ margin: 0, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 12 }}
        >
          {icon && (
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 'none',
                color: '#fff',
                width: 38,
                height: 38,
                borderRadius: 999,
                background: hue ?? 'var(--accent)',
              }}
            >
              {icon}
            </span>
          )}
          <span style={{ minWidth: 0 }}>{title}</span>
        </h1>
        {cta}
      </div>
      {subtitle && <p className="page-header-sub">{subtitle}</p>}
      {children && <div style={{ marginTop: 12 }}>{children}</div>}
    </header>
  );
}
