import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowUpRight } from 'lucide-react';

/**
 * The foot of every new widget: the way to the full page, and the source.
 *
 * CC-BY asks for attribution, and a reader of someone else's article
 * should be able to see where the figures come from without leaving it:
 * the Congress's open data, through Hola Política.
 */
export async function EmbedFooter({ href, label }: { href: Route; label: string }) {
  const t = await getTranslations('embed_widgets');
  return (
    <footer className="embed-foot">
      <Link href={href}>
        {label}
        <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
      </Link>
      <span>
        {t('source')} <Link href="/">Hola Política</Link> · {t('licence')}
      </span>
    </footer>
  );
}
