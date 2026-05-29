import { Sparkles } from 'lucide-react';

/**
 * Small pill that marks a piece of content as AI-generated. Used next
 * to the plain-language summary headings on vote / initiative detail
 * pages so a reader always knows the explanation was produced by a
 * model (Mistral) and reviewed against the official text, never hand-
 * written editorial. Neutral, factual labelling — no value claim.
 */
export function AiBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--accent)',
        background: 'color-mix(in oklch, var(--accent) 12%, var(--paper))',
        border: '1px solid color-mix(in oklch, var(--accent) 25%, var(--paper))',
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
        flex: 'none',
      }}
    >
      <Sparkles size={11} strokeWidth={2} aria-hidden="true" />
      {label}
    </span>
  );
}
