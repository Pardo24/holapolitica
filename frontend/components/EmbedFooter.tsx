import { getTranslations } from 'next-intl/server';
import { ArrowUpRight } from 'lucide-react';

/**
 * The foot of every new widget: the way to the full page, and the source.
 *
 * CC-BY asks for attribution, and a reader of someone else's article
 * should be able to see where the figures come from without leaving it:
 * the Congress's open data, through Hola Política.
 */
export async function EmbedFooter({ href, label }: { href: string; label: string }) {
  const t = await getTranslations('embed_widgets');
  return (
    <footer className="embed-foot">
      <a href={href}>
        {label}
        <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
      </a>
      <span>
        {t('source')} <a href="/">Hola Política</a> · {t('licence')}
      </span>
    </footer>
  );
}
