/**
 * The canonical topic chip — a small pill with the topic's colour dot and
 * name. One component everywhere (vote rows, law rows, the session sheet)
 * so the same semantic object always looks the same. Sized a touch larger
 * than the old inline chips for legibility.
 */
export function TopicChip({ name, color }: { name: string; color: string | null }) {
  const c = color ?? 'var(--ink-3)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 10px 3px',
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 600,
        color: 'var(--ink-2)',
        background: `color-mix(in oklch, ${c} 14%, var(--paper))`,
        border: `1px solid color-mix(in oklch, ${c} 32%, var(--paper))`,
        whiteSpace: 'nowrap',
        lineHeight: 1.3,
        letterSpacing: '0.01em',
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 7, height: 7, borderRadius: 999, background: c, flex: 'none' }}
      />
      {name}
    </span>
  );
}
