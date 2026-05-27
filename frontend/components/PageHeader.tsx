import type { CSSProperties, ReactNode } from 'react';

/**
 * Page-level header used at the top of every primary route.
 *
 * Layout: the **title is the anchor** of the row. The eyebrow/subtitle
 * sits on the **right**, small and muted, on viewports ≥ 640px. On
 * narrower screens the row wraps and the subtitle reflows underneath
 * the title, still right-aligned (the title is the longer string most
 * of the time, so it carries the leftmost column).
 *
 * Previously every page started with a small all-caps eyebrow ABOVE
 * the title — that read as label-before-headline and pushed the
 * H1 visually to second place. Inverting it puts the page name first
 * and demotes the contextual eyebrow to a captionable label.
 *
 * Optional `cta` slot accepts a button/link rendered after the
 * subtitle on desktop; useful for "Recorregut d'una llei →" style
 * actions. `children` renders below the header row (e.g. a lede
 * paragraph or a metadata strip).
 */
export function PageHeader({
  title,
  subtitle,
  icon,
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
      className={className}
      style={{
        paddingTop: 28,
        paddingBottom: children ? 18 : 14,
        borderBottom: bordered ? '1px solid var(--ink)' : undefined,
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h1
          className={headingClassName}
          style={{ margin: 0, minWidth: 0, display: 'inline-flex', alignItems: 'baseline', gap: 12 }}
        >
          {icon && (
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 'none',
                color: 'var(--accent)',
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'color-mix(in oklch, var(--accent) 12%, var(--paper))',
                transform: 'translateY(4px)',
              }}
            >
              {icon}
            </span>
          )}
          <span style={{ minWidth: 0 }}>{title}</span>
        </h1>
        {(subtitle || cta) && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              minWidth: 0,
            }}
          >
            {subtitle && (
              <span
                className="eyebrow"
                style={{
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  lineHeight: 1.3,
                }}
              >
                {subtitle}
              </span>
            )}
            {cta}
          </div>
        )}
      </div>
      {children && <div style={{ marginTop: 10 }}>{children}</div>}
    </header>
  );
}
