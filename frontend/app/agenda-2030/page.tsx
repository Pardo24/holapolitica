import { redirect } from 'next/navigation';

/**
 * Disabled for the public launch: the SDG (Agenda 2030) lens isn't
 * useful yet because no initiative has been classified against the
 * SDG taxonomy by the auto-classifier (only the editorial theme
 * taxonomy is in active rotation). The route used to render a
 * dedicated landing page; for now we redirect to /topics so a stray
 * link doesn't 404. Re-enable by restoring the previous implementation
 * from git history once SDG classification ships in production.
 */
export default function Agenda2030Redirect(): never {
  redirect('/topics');
}
