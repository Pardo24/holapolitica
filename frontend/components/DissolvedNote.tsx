import { getTranslations } from 'next-intl/server';

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

export async function DissolvedNote({ compact = false }: { compact?: boolean }) {
  if (!congressDissolved()) return null;
  const t = await getTranslations('dissolved');
  return (
    <p className={compact ? 'dissolved dissolved--compact' : 'dissolved'} role="note">
      <strong>{t('title')}</strong> {t('body')}
    </p>
  );
}
