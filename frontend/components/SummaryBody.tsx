import { parseSummary } from '@/lib/plainSummary';

/**
 * A plain summary, rendered as what it is.
 *
 * Motions ask for several things, so more than half the summaries end in a
 * numbered list. Printed as one paragraph they are a wall; printed as a list
 * they are readable, and the reader can count the asks. Prose summaries come
 * out as a paragraph, unchanged.
 */
export function SummaryBody({
  text,
  className,
  style,
  listStyle,
  omitLead = false,
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  /** Extra styles for the <ol>, e.g. tighter spacing inside a card. */
  listStyle?: React.CSSProperties;
  /** The page already shows the lead as its headline; render only the list. */
  omitLead?: boolean;
}) {
  const { lead, items } = parseSummary(text);

  if (items.length === 0) {
    if (omitLead) return null;
    return (
      <p className={className} style={{ margin: 0, ...style }}>
        {lead}
      </p>
    );
  }

  return (
    <div className={className} style={style}>
      {lead && !omitLead && <p style={{ margin: 0 }}>{lead}</p>}
      <ol
        style={{
          margin: lead && !omitLead ? '8px 0 0' : 0,
          paddingLeft: '1.35em',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          ...listStyle,
        }}
      >
        {items.map((item, i) => (
          <li key={i} style={{ paddingLeft: 2 }}>
            {item}
          </li>
        ))}
      </ol>
    </div>
  );
}
