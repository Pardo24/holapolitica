/**
 * The canonical topic chip: the topic's name as a square, outlined tag.
 * One component everywhere (vote rows, law rows, the session sheet) so the
 * same semantic object always looks the same.
 *
 * Monochrome since the "diari de sessions" restyle: the topic colours were
 * decoration (pink for gender, green for environment) and competed with
 * the colours that mean something, the groups' and the vote's. ``color``
 * is still accepted so callers need not change.
 */
export function TopicChip({ name }: { name: string; color?: string | null }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 7px 2px',
        borderRadius: 2,
        fontSize: 11.5,
        fontWeight: 500,
        color: 'var(--ink-2)',
        background: 'transparent',
        border: '1px solid var(--rule-strong)',
        whiteSpace: 'nowrap',
        lineHeight: 1.3,
      }}
    >
      {name}
    </span>
  );
}
