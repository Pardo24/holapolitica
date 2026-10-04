import { getTranslations } from 'next-intl/server';

/**
 * Skeleton for /votes while the SSR page renders.
 *
 * /votes fans out to the legislature list, the topic and group lists and the
 * paginated votes themselves — several backend hits in parallel. On a cold
 * ISR revalidation that adds up to ~1-1.5s; this skeleton makes the page feel
 * instant under that worst case.
 *
 * It mirrors the real chrome: header, one filter card, then the vote cards.
 * A skeleton that promises a different layout is worse than none.
 */
export default async function VotesLoading() {
  const t = await getTranslations('common');
  return (
    <div
      aria-busy="true"
      aria-label={t('loading')}
      style={{ paddingTop: 16, paddingBottom: 32, animation: 'pulse 1.6s ease-in-out infinite' }}
    >
      {/* Eyebrow + title */}
      <Bar w="32%" h={11} mb={8} />
      <Bar w="55%" h={28} mb={18} />

      {/* Filter card: search box + the row of controls under it. */}
      <div
        style={{
          border: '1px solid var(--rule)',
          borderRadius: 14,
          padding: 14,
          marginBottom: 18,
        }}
      >
        <div style={{ height: 44, background: 'var(--paper-2)', borderRadius: 10 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 230px', height: 32, background: 'var(--paper-2)', borderRadius: 999 }} />
          <div style={{ flex: '0 0 110px', height: 32, background: 'var(--paper-2)', borderRadius: 999 }} />
          <div style={{ flex: '0 0 120px', height: 32, background: 'var(--paper-2)', borderRadius: 999, marginLeft: 'auto' }} />
        </div>
      </div>

      {/* Vote cards (4 placeholders) — same shape as VoteCard: chips row,
          headline, the vote block, footer. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 16,
              padding: '18px 18px 16px',
            }}
          >
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Bar w={90} h={18} />
              <Bar w={70} h={18} />
              <div style={{ flex: 1 }} />
              <Bar w={84} h={18} />
            </div>
            <Bar w="88%" h={16} mb={7} />
            <Bar w="62%" h={16} mb={14} />
            <div
              style={{
                height: 74,
                background: 'var(--paper-2)',
                borderRadius: 12,
                marginBottom: 12,
              }}
            />
            <Bar w="40%" h={11} />
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
