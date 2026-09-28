import { FileText, Sparkles } from 'lucide-react';

/**
 * Says where the text above or below it came from.
 *
 * Two states, and both matter:
 *  - ``ai``: the headline is a machine-written summary of the law's own
 *    text. A reader should never have to guess whether a sentence was
 *    written by the Congress or by a model, and the small sparkle pill in
 *    the card footer ("original text") only said the original was
 *    available, not that the headline was generated.
 *  - ``none``: there is no summary yet, so what follows is the official
 *    wording. Silence here read as "this law is written in legalese";
 *    saying it plainly separates "we haven't done it" from "this is it".
 *
 * Deliberately not a link or a control: it is a label, and the card
 * already carries the affordances (the original-text toggle, the link to
 * the law itself).
 */
export function SummaryProvenance({ kind, label }: { kind: 'ai' | 'none'; label: string }) {
  const Icon = kind === 'ai' ? Sparkles : FileText;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        marginBottom: 6,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
      }}
    >
      <Icon
        size={11}
        strokeWidth={2}
        aria-hidden="true"
        style={{ color: kind === 'ai' ? 'var(--accent)' : 'var(--ink-3)', flex: 'none' }}
      />
      {label}
    </span>
  );
}
