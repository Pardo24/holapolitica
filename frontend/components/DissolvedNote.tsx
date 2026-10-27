import { getTranslations } from 'next-intl/server';

import { DissolvedClose } from '@/components/DissolvedClose';

/**
 * The Cortes are dissolved for the 29 November 2026 election: no plenaries
 * between the dissolution and the new chambers' constitutive sessions.
 * Real Decreto 806/2026 (BOE-A-2026-20742): dissolved on publication,
 * 6 October; "las Cámaras resultantes se reunirán, en sesiones
 * constitutivas, el día 23 de diciembre".
 *
 * Without it the home said "latest plenary, 26 days ago" and the topics
 * "nothing on the next agenda", and the silence read as a gap in our data.
 */

const DISSOLVED_FROM = '2026-10-06';
const CONSTITUTED_ON = '2026-12-23';

export function congressDissolved(now: Date = new Date()): boolean {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  return today >= DISSOLVED_FROM && today < CONSTITUTED_ON;
}

export async function DissolvedNote({
  compact = false,
  top = false,
  dismissible = false,
}: {
  compact?: boolean;
  /** First thing on a page: clear of the navigation bar above it. */
  top?: boolean;
  /** With a close button that is remembered (DissolvedClose): the home. */
  dismissible?: boolean;
}) {
  if (!congressDissolved()) return null;
  const t = await getTranslations('dissolved');
  return (
    <p
      className={`dissolved${compact ? ' dissolved--compact' : ''}${top ? ' dissolved--top' : ''}${dismissible ? ' dissolved--dismissible' : ''}`}
      role="note"
    >
      <strong>{t('title')}</strong> {t('body')}
      {dismissible && <DissolvedClose label={t('close')} />}
    </p>
  );
}
