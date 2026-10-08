import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ExternalLink, FileText, Sparkles } from 'lucide-react';

import type { Initiative } from '@/lib/api';
import { changeTagIcon, isChangeTag, pdfUrl } from '@/lib/changeTags';

/**
 * "What the text says": the concrete measures of a bill, read from its
 * own text, each with the article it comes from; what it changes, each
 * change with the passage behind it; and the official PDF, prominently.
 *
 * The headline and summary above are written from the title and a short
 * object, and many titles say little ("por el que se modifican diversas
 * normas…"). This is the bill itself, as tabled, so a reader can check
 * any line against the PDF one tap away.
 *
 * Honest about its limits: it is the text as presented (committees can
 * change it), it was read by an AI, and for very long texts only the
 * explanatory statement and the first articles were read.
 */
export async function LawTextPanel({ initiative, locale }: { initiative: Initiative; locale: string }) {
  const t = await getTranslations('law_text');
  const tTags = await getTranslations('change_tags');
  const pdf = pdfUrl(initiative.source_url);
  const lang = locale === 'ca' ? 'ca' : 'es';
  const points = initiative.text_points?.[lang]?.length
    ? initiative.text_points[lang]!
    : (initiative.text_points?.es ?? []);
  const tags = (initiative.change_tags ?? []).filter(isChangeTag);
  const evidence = initiative.change_evidence?.[lang] ?? initiative.change_evidence?.es ?? {};

  if (!pdf && points.length === 0 && !initiative.boe_url) return null;

  return (
    <section className="law-text" aria-labelledby="law-text-title">
      <div className="law-text__head">
        <h2 id="law-text-title">{t('title')}</h2>
        {points.length > 0 && (
          <span className="law-text__ai">
            <Sparkles size={12} strokeWidth={2} aria-hidden="true" />
            {t('ai_label')}
          </span>
        )}
      </div>

      {points.length > 0 ? (
        <ol className="law-text__points">
          {points.map((p, i) => (
            <li key={i}>
              <span className="law-text__n tabular" aria-hidden="true">
                {i + 1}
              </span>
              <span className="law-text__body">
                {p.text}
                {p.ref && <span className="law-text__ref">{p.ref}</span>}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="law-text__empty">{pdf ? t('not_read_yet') : t('no_pdf')}</p>
      )}

      {tags.length > 0 && (
        <div className="law-text__changes">
          <span className="law-text__label">{t('changes_label')}</span>
          <ul>
            {tags.map((tag) => {
              const Icon = changeTagIcon(tag);
              return (
                <li key={tag}>
                  <details>
                    <summary className="change-chip">
                      <Icon size={13} strokeWidth={2} aria-hidden="true" />
                      {tTags(tag)}
                    </summary>
                    {evidence[tag] && (
                      <p className="law-text__evidence">
                        <span>{t('evidence_label')}</span> {evidence[tag]}
                      </p>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="law-text__actions">
        {pdf && (
          <a href={pdf} target="_blank" rel="noopener noreferrer" className="law-text__pdf">
            <FileText size={16} strokeWidth={2} aria-hidden="true" />
            {t('pdf_cta')}
            <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
          </a>
        )}
        {initiative.boe_url && (
          <a href={initiative.boe_url} target="_blank" rel="noopener noreferrer" className="law-text__boe">
            {t('boe_cta')}
            <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
          </a>
        )}
      </div>

      {points.length > 0 && (
        <p className="law-text__note">
          {initiative.text_analysis_source === 'partial' ? t('note_partial') : t('note_full')}{' '}
          <Link href="/about#ia">{t('how_ai')}</Link>
        </p>
      )}
    </section>
  );
}
