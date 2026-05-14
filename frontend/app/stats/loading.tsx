/**
 * Skeleton for /stats while Next.js (re)renders the page on the server.
 *
 * The /stats route fans out ~10 backend fetches and does a fair amount
 * of SSR work — when the Vercel edge has to revalidate (cold ISR,
 * roughly every 5 minutes) users would otherwise stare at a blank
 * page for ~2s. This file is rendered instantly while the page
 * suspends.
 *
 * Visual budget: cheap CSS-only shimmering rectangles in the same
 * vertical rhythm as the real sections, no client JS, no fetches.
 */
export default function StatsLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Carregant estadístiques…"
      style={{ paddingTop: 18, paddingBottom: 32, animation: 'pulse 1.6s ease-in-out infinite' }}
    >
      {/* Page header skeleton */}
      <div style={{ marginBottom: 24 }}>
        <Bar w="38%" h={11} mb={10} />
        <Bar w="62%" h={32} mb={10} />
        <Bar w="80%" h={14} mb={4} />
        <Bar w="50%" h={14} />
      </div>

      {/* Tabs skeleton */}
      <div style={{ display: 'flex', gap: 18, marginBottom: 22 }}>
        <Bar w={120} h={28} />
        <Bar w={140} h={28} />
      </div>

      {/* Pie chart skeleton (first section now) */}
      <Card>
        <Bar w="40%" h={16} mb={10} />
        <Bar w="80%" h={12} mb={20} />
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: 280,
          }}
        >
          <div
            style={{
              width: 240,
              height: 240,
              borderRadius: '50%',
              background:
                'conic-gradient(var(--paper-2) 0deg, var(--paper-3) 90deg, var(--paper-2) 180deg, var(--paper-3) 270deg)',
            }}
          />
        </div>
      </Card>

      {/* Cohesion carousel skeleton */}
      <Card>
        <Bar w="34%" h={16} mb={10} />
        <Bar w="70%" h={12} mb={20} />
        <div style={{ display: 'flex', gap: 12, overflow: 'hidden' }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                flex: 'none',
                width: 220,
                height: 140,
                background: 'var(--paper-2)',
                borderRadius: 8,
              }}
            />
          ))}
        </div>
      </Card>

      {/* Coincidence matrix skeleton */}
      <Card>
        <Bar w="40%" h={16} mb={10} />
        <Bar w="80%" h={12} mb={20} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: 4,
            maxWidth: 520,
          }}
        >
          {Array.from({ length: 64 }, (_, i) => (
            <div
              key={i}
              style={{
                aspectRatio: '1 / 1',
                background: 'var(--paper-2)',
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      </Card>

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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: '22px 0 28px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      {children}
    </section>
  );
}
