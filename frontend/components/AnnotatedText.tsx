import { Fragment, type ReactNode } from 'react';

import { GlossaryTerm } from '@/components/GlossaryTerm';
import { findInlineGlossaryMatches } from '@/lib/glossary';

/**
 * Render free text and wrap any known parliamentary jargon in
 * ``<GlossaryTerm>`` so users get a tooltip on hover/tap. The matching
 * dictionary lives in ``lib/glossary.ts`` and covers both Catalan and
 * Spanish spellings — Congreso descriptions come in Spanish, so the
 * scanner has to accept "Convalidación" the same as "Convalidació".
 *
 * The scanner is case-insensitive and longest-match-wins so
 * "Tramitació en lectura única" beats the shorter "Lectura única". The
 * visible label keeps the case from the source text (we preserve the
 * substring verbatim), but the glossary lookup is done against the
 * canonical key — so an ALL-CAPS "DEROGACIÓN" still resolves to the
 * Catalan-keyed definition.
 *
 * Server Component safe. The wrapping ``<GlossaryTerm>`` is a Client
 * Component, which React allows to be nested inside server output.
 *
 * Usage::
 *
 *     <AnnotatedText text={vote.title} />
 *
 * If the input is null/empty the component renders nothing. If no
 * known terms appear, the children fall back to the plain string and
 * the wrapper adds zero DOM overhead.
 */
export function AnnotatedText({
  text,
}: {
  text: string | null | undefined;
}): ReactNode {
  if (!text) return null;
  const parts = findInlineGlossaryMatches(text);
  if (parts.length === 1 && typeof parts[0] === 'string') {
    // Fast path: nothing matched. Return the bare string so callers that
    // pass us into ``SummaryHover`` keep the ``typeof children === 'string'``
    // optimisation in that component.
    return parts[0];
  }
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          // ``p.visible`` is the source-cased substring (e.g. "DEROGACIÓN")
          // — we hand that to the user as the label. ``p.key`` is the
          // canonical glossary key (e.g. "Derogación") used for lookup.
          <GlossaryTerm key={i} term={p.key}>
            {p.visible}
          </GlossaryTerm>
        ),
      )}
    </>
  );
}
