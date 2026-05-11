// Truncate a long "submitted_by" string to ~N chars with a native expandable
// `<details>`. No client JS: the browser handles the open/close. Falls back to
// showing the full text when shorter than the limit.

const LIMIT = 80;

export function ProposerEllipsis({ text }: { text: string }) {
  const trimmed = text.trim();
  if (trimmed.length <= LIMIT) return <>{trimmed}</>;

  const head = trimmed.slice(0, LIMIT).replace(/[\s,;]+\S*$/, '');
  return (
    <details
      style={{
        display: 'inline',
        color: 'inherit',
      }}
    >
      <summary
        style={{
          display: 'inline',
          cursor: 'pointer',
          listStyle: 'none',
        }}
      >
        {head}
        <span style={{ color: 'var(--ink-3)' }}>… mostra&apos;n més</span>
      </summary>
      <span style={{ display: 'inline' }}>{trimmed}</span>
    </details>
  );
}
