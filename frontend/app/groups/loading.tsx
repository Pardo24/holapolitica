/**
 * Skeleton for /groups during SSR revalidation. Mirrors the live
 * page's structure: heading + a grid of group cards.
 */
export default function GroupsLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Carregant grups parlamentaris…"
      style={{
        paddingTop: 18,
        paddingBottom: 32,
        animation: 'pulse 1.6s ease-in-out infinite',
      }}
    >
      <Bar w="38%" h={11} mb={8} />
      <Bar w="62%" h={28} mb={6} />
      <Bar w="80%" h={14} mb={20} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 14,
        }}
      >
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            style={{
              padding: '16px 14px',
              border: '1px solid var(--rule)',
              borderRadius: 12,
              background: 'var(--paper-2)',
              minHeight: 110,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  background: 'var(--paper-3)',
                }}
              />
              <Bar w="60%" h={14} />
            </div>
            <Bar w="40%" h={11} mb={6} />
            <Bar w="80%" h={6} />
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
