import { PageSkeleton } from '@/components/PageSkeleton';

/** Home, and the fallback for every route without a skeleton of its own. */
export default function Loading() {
  return <PageSkeleton />;
}
