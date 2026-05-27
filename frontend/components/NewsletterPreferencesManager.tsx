'use client';

/**
 * Newsletter topic-preferences manager.
 *
 * Replaces the previous browser-Push UI on the /notifications page. The
 * mental model is now:
 *
 *   1. Subscribe (email).
 *   2. Pick the broad topic umbrellas (or fine-grained themes inside them).
 *   3. Receive a weekly newsletter scoped to those topics.
 *
 * The browser-Push code remains intact in :file:`NotificationsManager`
 * and is gated off via the ``ENABLE_BROWSER_PUSH`` flag on the page —
 * we may reintroduce it later, possibly as a second channel.
 *
 * Neutrality:
 *   - No reactions, no emoji, no editorial framing.
 *   - The topic umbrellas are a UX shortcut, not a value judgement.
 *   - Mirrors `NewsletterSignup` privacy copy.
 *
 * Backend integration is currently mocked: see
 * :file:`app/api/newsletter-preferences/route.ts` for the TODO and the
 * cookie-based "already subscribed" hack.
 */

import type React from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Mail, ShieldCheck, Sparkles } from 'lucide-react';

import { NewsletterSignup } from '@/components/NewsletterSignup';
import { type Topic } from '@/lib/api';
import { pickTopicName } from '@/lib/topics';
import {
  TOPIC_CATEGORIES,
  categoryLabel,
  type TopicCategory,
} from '@/lib/topic_categories';

const SUBSCRIBED_COOKIE = 'hp_newsletter_subscribed';

interface Props {
  topics: Topic[];
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function readSubscribedCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .some((part) => part.trim().startsWith(`${SUBSCRIBED_COOKIE}=1`));
}

function clearSubscribedCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SUBSCRIBED_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function NewsletterPreferencesManager({ topics }: Props): React.ReactElement {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const [subscribed, setSubscribed] = useState<boolean>(false);
  // Long-lived "manage" token, pulled from the URL (?token=…) when the
  // user lands here from a confirmation / digest email. Required to
  // POST changes to the backend. When absent we still render the
  // picker so the user can play with it locally, but the Save button
  // surfaces an explanation.
  const [manageToken, setManageToken] = useState<string | null>(null);
  // Hydration: read the cookie on mount. SSR can't see it (it's an
  // optional client UX flag, not auth), so we start with the conservative
  // assumption "not subscribed" and switch once we've checked.
  useEffect(() => {
    setSubscribed(readSubscribedCookie());
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const tok = sp.get('token');
      if (tok && tok.length >= 8) setManageToken(tok);
    }
  }, []);

  if (!subscribed) {
    return (
      <section
        className="newsletter-pref-signup"
        style={{
          marginTop: 24,
          borderRadius: 16,
          border: '1px solid var(--rule-strong)',
          background:
            'linear-gradient(135deg, color-mix(in oklch, var(--accent) 6%, var(--paper)) 0%, var(--paper-2) 100%)',
          overflow: 'hidden',
        }}
      >
        <div
          className="newsletter-pref-signup__inner"
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr)',
            alignItems: 'center',
            gap: 24,
            padding: '22px 24px',
          }}
        >
          <div
            aria-hidden="true"
            className="newsletter-pref-signup__icon"
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'var(--paper)',
              color: 'var(--accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 0 rgba(15,23,42,.04)',
              flex: 'none',
            }}
          >
            <Mail size={32} strokeWidth={1.6} aria-hidden="true" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              className="eyebrow"
              style={{ marginBottom: 4, color: 'var(--accent)' }}
            >
              {t('newsletter_eyebrow')}
            </div>
            <h2
              className="serif newsletter-pref-signup__title"
              style={{
                margin: '0 0 6px',
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--ink)',
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
              }}
            >
              {t('newsletter_signup_headline')}
            </h2>
            <p
              className="newsletter-pref-signup__intro"
              style={{
                fontSize: 13,
                color: 'var(--ink-2)',
                margin: 0,
                lineHeight: 1.55,
                maxWidth: 540,
              }}
            >
              {t('newsletter_signup_intro')}
            </p>
          </div>
        </div>
        <div
          className="newsletter-pref-signup__form-wrap"
          style={{
            padding: '4px 24px 18px',
          }}
        >
          <NewsletterSignup variant="bare" />
          <ul
            className="newsletter-pref-signup__trust"
            style={{
              listStyle: 'none',
              margin: '12px 0 0',
              padding: 0,
              display: 'flex',
              gap: 18,
              flexWrap: 'wrap',
              fontSize: 11,
              color: 'var(--ink-3)',
            }}
          >
            <li style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={13} aria-hidden="true" />
              {t('newsletter_trust_gdpr')}
            </li>
            <li style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={13} aria-hidden="true" />
              {t('newsletter_trust_no_opinion')}
            </li>
          </ul>
        </div>
        <style>{`
          @media (max-width: 640px) {
            .newsletter-pref-signup {
              margin-top: 16px !important;
              border-radius: 14px !important;
            }
            .newsletter-pref-signup__inner {
              padding: 16px 16px 6px !important;
              gap: 14px !important;
            }
            .newsletter-pref-signup__icon {
              width: 48px !important;
              height: 48px !important;
              border-radius: 12px !important;
            }
            .newsletter-pref-signup__icon svg {
              width: 24px !important;
              height: 24px !important;
            }
            .newsletter-pref-signup__title {
              font-size: 17px !important;
            }
            .newsletter-pref-signup__intro {
              font-size: 12px !important;
              line-height: 1.45 !important;
            }
            .newsletter-pref-signup__form-wrap {
              padding: 4px 16px 16px !important;
            }
            /* The nested NewsletterSignup already has its own mobile
               polish; we override its top margin so the form sits
               flush against the trust signals + the card chrome above. */
            .newsletter-pref-signup .newsletter-signup {
              margin-top: 0 !important;
            }
            .newsletter-pref-signup .newsletter-signup > .eyebrow,
            .newsletter-pref-signup .newsletter-signup p {
              display: none;
            }
            .newsletter-pref-signup .newsletter-signup-form {
              flex-direction: row !important;
              gap: 6px !important;
            }
            .newsletter-pref-signup .newsletter-signup-form > input {
              flex: 1 1 auto !important;
              width: auto !important;
              height: 40px !important;
            }
            .newsletter-pref-signup .newsletter-signup-form > button {
              flex: 0 0 auto !important;
              width: auto !important;
              min-height: 40px !important;
              padding-left: 14px !important;
              padding-right: 14px !important;
            }
            .newsletter-pref-signup__trust {
              gap: 12px !important;
              font-size: 10px !important;
            }
          }
        `}</style>
      </section>
    );
  }

  return (
    <PreferencesPicker
      topics={topics}
      locale={locale}
      manageToken={manageToken}
      onUnsubscribe={() => {
        clearSubscribedCookie();
        setSubscribed(false);
      }}
    />
  );
}

// =================================================================
// PreferencesPicker — the post-subscription topic chooser.
// =================================================================

function PreferencesPicker({
  topics,
  locale,
  manageToken,
  onUnsubscribe,
}: {
  topics: Topic[];
  locale: string;
  manageToken: string | null;
  onUnsubscribe: () => void;
}): React.ReactElement {
  const t = useTranslations('notifications');

  // Map slug → topic for O(1) lookup inside category accordions.
  const topicBySlug = useMemo(() => {
    const m = new Map<string, Topic>();
    topics.forEach((tp) => m.set(tp.slug, tp));
    return m;
  }, [topics]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [message, setMessage] = useState<string>('');

  const toggle = useCallback((slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const selectAll = useCallback((slugs: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      slugs.forEach((s) => next.add(s));
      return next;
    });
  }, []);

  const clearGroup = useCallback((slugs: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      slugs.forEach((s) => next.delete(s));
      return next;
    });
  }, []);

  // Topics not covered by any category fall through to a "miscellaneous"
  // bucket inside the advanced section so the user can still pick them
  // even if we forgot to update TOPIC_CATEGORIES.
  const uncategorisedSlugs = useMemo(() => {
    const covered = new Set<string>();
    TOPIC_CATEGORIES.forEach((cat) =>
      cat.topic_slugs.forEach((s) => covered.add(s)),
    );
    return topics.filter((tp) => !covered.has(tp.slug)).map((tp) => tp.slug);
  }, [topics]);

  // Identify which categories are fully selected — used to set the
  // "category-level" payload sent to the backend, since the backend
  // may store either fine-grained slugs or category roll-ups.
  const fullySelectedCategories = useMemo(() => {
    return TOPIC_CATEGORIES.filter((cat) => {
      const known = cat.topic_slugs.filter((s) => topicBySlug.has(s));
      return known.length > 0 && known.every((s) => selected.has(s));
    }).map((cat) => cat.slug);
  }, [selected, topicBySlug]);

  const dirty = useMemo(() => {
    if (selected.size !== applied.size) return true;
    for (const slug of selected) if (!applied.has(slug)) return true;
    return false;
  }, [selected, applied]);

  const handleSave = useCallback(async () => {
    if (!manageToken) {
      setStatus('error');
      setMessage(t('newsletter_save_needs_token'));
      return;
    }
    setStatus('saving');
    setMessage('');
    try {
      const res = await fetch('/api/newsletter-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // The backend authenticates by token, not email. The link
          // arrives in the welcome / digest email as `?token=…`; the
          // useEffect above reads it on mount.
          token: manageToken,
          topic_slugs: Array.from(selected),
          // Forward the resolved categories too in case a future
          // backend version wants the user's umbrella choice for the
          // digest summary section.
          category_slugs: fullySelectedCategories,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setApplied(new Set(selected));
      setStatus('saved');
      setMessage(t('newsletter_saved'));
    } catch {
      setStatus('error');
      setMessage(t('newsletter_save_error'));
    }
  }, [selected, fullySelectedCategories, manageToken, t]);

  return (
    <div style={{ marginTop: 18, paddingBottom: dirty ? 88 : 0 }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={eyebrowStyle}>{t('newsletter_already_subscribed')}</div>
            <h2
              style={{
                margin: '2px 0 0',
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              {t('newsletter_preferences_title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onUnsubscribe}
            style={linkButtonStyle}
            // Lets the user reset the local subscription state — useful
            // for testing the empty-state form and as a manual escape
            // hatch until the backend exposes a proper "unsubscribe" CTA.
          >
            {t('newsletter_change_email')}
          </button>
        </div>
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 13,
            color: 'var(--ink-3)',
            lineHeight: 1.5,
          }}
        >
          {t('newsletter_preferences_intro')}
        </p>
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {TOPIC_CATEGORIES.map((cat) => (
          <CategoryAccordion
            key={cat.slug}
            category={cat}
            locale={locale}
            topicBySlug={topicBySlug}
            selected={selected}
            onToggle={toggle}
            onSelectAll={selectAll}
            onClearGroup={clearGroup}
          />
        ))}

        {uncategorisedSlugs.length > 0 && (
          <AdvancedSection
            slugs={uncategorisedSlugs}
            topicBySlug={topicBySlug}
            selected={selected}
            onToggle={toggle}
          />
        )}
      </div>

      {message && (
        <p
          role="status"
          aria-live="polite"
          style={{
            marginTop: 14,
            padding: '10px 12px',
            fontSize: 13,
            color: 'var(--ink-2)',
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
            borderRadius: 10,
          }}
        >
          {message}
        </p>
      )}

      {dirty && (
        <div role="region" aria-label={t('newsletter_unsaved_changes')} style={stickyBarStyle}>
          <div
            style={{
              maxWidth: 720,
              margin: '0 auto',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 13,
                color: 'var(--ink-2)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t('newsletter_unsaved_changes')}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={status === 'saving'}
              style={primaryButtonStyle}
            >
              {status === 'saving' ? '…' : t('newsletter_save_cta')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =================================================================
// CategoryAccordion — one umbrella with its child topic chips inside.
// =================================================================

function CategoryAccordion({
  category,
  locale,
  topicBySlug,
  selected,
  onToggle,
  onSelectAll,
  onClearGroup,
}: {
  category: TopicCategory;
  locale: string;
  topicBySlug: Map<string, Topic>;
  selected: Set<string>;
  onToggle: (slug: string) => void;
  onSelectAll: (slugs: string[]) => void;
  onClearGroup: (slugs: string[]) => void;
}): React.ReactElement {
  const t = useTranslations('notifications');
  const knownTopics = category.topic_slugs
    .map((slug) => topicBySlug.get(slug))
    .filter((tp): tp is Topic => Boolean(tp));
  const knownSlugs = knownTopics.map((tp) => tp.slug);
  const selectedInCategory = knownSlugs.filter((s) => selected.has(s)).length;
  const total = knownSlugs.length;
  const label = categoryLabel(category, locale);

  return (
    <details
      // All categories expand by default. Daniel preferred a fully-
      // opened picker over a tap-to-expand list — easier to tick
      // checkboxes across umbrellas in a single pass.
      open
      style={{
        borderRadius: 12,
        border: '1px solid var(--rule)',
        background: 'var(--paper)',
        padding: '0 4px',
      }}
    >
      <summary
        style={{
          listStyle: 'none',
          cursor: 'pointer',
          minHeight: 56,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          userSelect: 'none',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            {label}
          </span>
          <span
            className="tabular"
            style={{
              display: 'block',
              fontSize: 12,
              color: 'var(--ink-3)',
              marginTop: 2,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {t('newsletter_category_count', {
              selected: selectedInCategory,
              total,
            })}
          </span>
        </span>
        <span aria-hidden="true" style={{ fontSize: 18, color: 'var(--ink-3)' }}>
          ▾
        </span>
      </summary>

      <div style={{ padding: '4px 14px 14px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => onSelectAll(knownSlugs)}
            disabled={selectedInCategory === total}
            style={smallButtonStyle}
          >
            {t('newsletter_category_select_all')}
          </button>
          <button
            type="button"
            onClick={() => onClearGroup(knownSlugs)}
            disabled={selectedInCategory === 0}
            style={smallButtonStyle}
          >
            {t('newsletter_category_clear')}
          </button>
        </div>

        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          {knownTopics.map((tp) => {
            const checked = selected.has(tp.slug);
            return (
              <li key={tp.slug}>
                <button
                  type="button"
                  onClick={() => onToggle(tp.slug)}
                  aria-pressed={checked}
                  style={chipStyle(checked, tp.color_hex ?? null)}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: tp.color_hex ?? 'var(--ink-3)',
                      flex: 'none',
                    }}
                  />
                  <span>{pickTopicName(tp, locale)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}

// =================================================================
// AdvancedSection — flat list of topics not covered by any umbrella.
// =================================================================

function AdvancedSection({
  slugs,
  topicBySlug,
  selected,
  onToggle,
}: {
  slugs: string[];
  topicBySlug: Map<string, Topic>;
  selected: Set<string>;
  onToggle: (slug: string) => void;
}): React.ReactElement {
  const t = useTranslations('notifications');
  const ts = slugs
    .map((s) => topicBySlug.get(s))
    .filter((tp): tp is Topic => Boolean(tp));
  return (
    <details
      style={{
        borderRadius: 12,
        border: '1px dashed var(--rule)',
        background: 'var(--paper-2)',
        padding: '0 4px',
      }}
    >
      <summary
        style={{
          listStyle: 'none',
          cursor: 'pointer',
          minHeight: 44,
          padding: '10px 14px',
          fontSize: 13,
          color: 'var(--ink-3)',
        }}
      >
        {t('newsletter_section_all_topics')}
      </summary>
      <ul
        style={{
          listStyle: 'none',
          padding: '4px 14px 14px',
          margin: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        {ts.map((tp) => {
          const checked = selected.has(tp.slug);
          return (
            <li key={tp.slug}>
              <button
                type="button"
                onClick={() => onToggle(tp.slug)}
                aria-pressed={checked}
                style={chipStyle(checked, tp.color_hex ?? null)}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: tp.color_hex ?? 'var(--ink-3)',
                    flex: 'none',
                  }}
                />
                <span>{tp.name_ca}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

// =================================================================
// Styles
// =================================================================

const cardStyle: CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--rule)',
  borderRadius: 14,
  padding: '14px 16px',
  boxShadow: '0 1px 0 rgba(15,23,42,.03)',
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  fontWeight: 600,
};

function chipStyle(checked: boolean, color: string | null): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    minHeight: 32,
    borderRadius: 999,
    background: checked ? 'var(--ink)' : 'var(--paper)',
    color: checked ? 'var(--paper)' : 'var(--ink)',
    border: '1px solid',
    borderColor: checked ? 'var(--ink)' : 'var(--rule-strong)',
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
    // Subtle accent: when un-checked the topic dot already carries the
    // category colour; when checked, the ink-on-paper inversion is
    // enough so we don't need to recolour the dot.
    ...(checked
      ? {}
      : color
        ? { boxShadow: 'inset 0 0 0 0 transparent' }
        : {}),
  };
}

const smallButtonStyle: CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--rule-strong)',
  borderRadius: 999,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--ink)',
  cursor: 'pointer',
  minHeight: 32,
  fontFamily: 'inherit',
};

const linkButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--accent)',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '6px 0',
};

const stickyBarStyle: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  background: 'color-mix(in oklch, var(--paper) 92%, transparent)',
  backdropFilter: 'saturate(140%) blur(8px)',
  WebkitBackdropFilter: 'saturate(140%) blur(8px)',
  borderTop: '1px solid var(--rule)',
  zIndex: 40,
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};

const primaryButtonStyle: CSSProperties = {
  background: 'var(--ink)',
  color: 'var(--paper)',
  border: '1px solid var(--ink)',
  borderRadius: 10,
  padding: '10px 18px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  minHeight: 44,
  fontFamily: 'inherit',
};
