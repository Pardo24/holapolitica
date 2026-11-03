import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight } from '@/components/icons';

/**
 * The way on at the end of a guide step: one big link to the next step.
 * No hooks, so the client quiz can show it on its results too.
 */
export function VoteGuideNext({
  href,
  eyebrow,
  title,
  body,
  cta,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body?: string;
  cta: string;
}) {
  return (
    <Link href={href as Route} className="vnext">
      <span className="vnext__eyebrow">{eyebrow}</span>
      <span className="vnext__title">{title}</span>
      {body && <span className="vnext__body">{body}</span>}
      <span className="vnext__cta">
        {cta} <ArrowRight size={16} aria-hidden="true" />
      </span>
    </Link>
  );
}
