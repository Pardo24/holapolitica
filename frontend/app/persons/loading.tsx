/**
 * Skeleton for /persons during SSR revalidation.
 *
 * Shows a header placeholder, a search-bar placeholder and 6
 * person-row placeholders so the page mass is recognisable from the
 * first frame.
 */
export default function PersonsLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Carregant diputats…"
      style={{
        paddingTop: 18,
        paddingBottom: 32,
        animation: 'pulse 1.6s ease-in-out infinite',
      }}
    >
      <Bar w="34%" h={11} mb={8} />
      <Bar w="56%" h={28} mb={16} />
      <Bar w="100%" h={44} mb={18} />
      <div>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '48px 1fr',
              gap: 12,
              padding: '12px 0',
              borderBottom: '1px solid var(--rule)',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                background: 'var(--paper-2)',
              }}
            />
            <div>
              <Bar w="60%" h={14} mb={6} />
              <Bar w="34%" h={11} />
            </div>
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
        background: 'var(--paper-2)',
        borderRadius: 4,
        marginBottom: mb,
      }}
    />
  );
}
