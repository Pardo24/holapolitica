/**
 * Skeleton for /topics during SSR revalidation. Mirrors the grid of
 * topic cards in the live page.
 */
export default function TopicsLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Carregant temes…"
      style={{
        paddingTop: 18,
        paddingBottom: 32,
        animation: 'pulse 1.6s ease-in-out infinite',
      }}
    >
      <Bar w="34%" h={11} mb={8} />
      <Bar w="56%" h={28} mb={6} />
      <Bar w="80%" h={14} mb={22} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            style={{
              padding: '14px 14px 16px',
              border: '1px solid var(--rule)',
              borderRadius: 12,
              background: 'var(--paper-2)',
              minHeight: 110,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'var(--paper-3)',
              }}
            />
            <Bar w="70%" h={13} />
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

function Bar({ w, h, mb = 0 }: { w: number | string; h: number; mb?: number }) {
  return (
    <div
      style={{
        width: typeof w === 'number' ? `${w}px` : w,
        height: h,
        background: 'var(--paper-3)',
        borderRadius: 4,
        marginBottom: mb,
      }}
    />
  );
}
