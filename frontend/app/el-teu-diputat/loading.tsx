import { PageSkeleton } from '@/components/PageSkeleton';

/** /el-teu-diputat: header, the province picker, then the deputies. */
export default function DeputyLoading() {
  return <PageSkeleton search rows={4} />;
}
