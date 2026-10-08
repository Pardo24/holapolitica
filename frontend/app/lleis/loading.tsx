import { PageSkeleton } from '@/components/PageSkeleton';

/** /lleis: header, the search box, then the law rows. */
export default function LawsLoading() {
  return <PageSkeleton search rows={6} />;
}
