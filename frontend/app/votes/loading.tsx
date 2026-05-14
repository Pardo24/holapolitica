/**
 * Skeleton for /votes while the SSR page renders.
 *
 * /votes fans out to the calendar strip, the topic carousel and the
 * paginated list — about half a dozen backend hits in parallel. On a
 * cold ISR revalidation that adds up to ~1-1.5s; this skeleton makes
 * the page feel instant even under that worst case.
 */
export default function VotesLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Carregant votacions…"
      style={{ paddingTop: 16, paddingBottom: 32, animation: 'pulse 1.6s ease-in-out infinite' }}
    >
      {/* Eyebrow + title */}
      <Bar w="32%" h={11} mb={8} />
      <Bar w="55%" h={28} mb={18} />

      {/* Calendar strip */}
      <div style={{ display: 'flex', gap: 8, overflow: 'hidden', marginBottom: 18 }}>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 'none',
              width: 60,
              height: 78,
              background: 'var(--paper-2)',
              borderRadius: 10,
            }}
          />
        ))}
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <div
          style={{
            flex: '1 1 220px',
            height: 44,
            background: 'var(--paper-2)',
            borderRadius: 10,
          }}
        />
        <div
          style={{
            flex: '0 0 96px',
            height: 44,
            background: 'var(--paper-2)',
            borderRadius: 10,
          }}
        />
      </div>

      {/* Vote rows (5 placeholders) */}
      <div>
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '64px 1fr auto',
              gap: 14,
              padding: '14px 0',
              borderBottom: '1px solid var(--rule)',
              alignItems: 'center',
            }}
          >
            <Bar w={56} h={14} />
            <div>
              <Bar w="80%" h={14} mb={6} />
              <Bar w="40%" h={12} />
            </div>
            <Bar w={90} h={20} />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.62; }
        }
      `}</style>
    </div>
  );
}

function Bar({
  w,
  h,
  mb = 0,
}: {
  w: number | string;
  h: number;
  mb?: number;
}) {
  return (
    <div
      style={{
        width: typeof w === 'number' ? `${w}px` : w,
        height: h,
        background: 'var(--paper-2)',
        borderRadius: 4,
        marginBottom: mb,
      }}
    />
  );
}
