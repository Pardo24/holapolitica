/**
 * Skeleton for /initiatives/[id] during SSR revalidation. Mirrors the
 * detail-page header + two-column body so the layout doesn't shift.
 */
export default function InitiativeLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Carregant iniciativa…"
      style={{
        paddingTop: 18,
        paddingBottom: 32,
        animation: 'pulse 1.6s ease-in-out infinite',
      }}
    >
      <Bar w="22%" h={11} mb={10} />
      <Bar w="78%" h={32} mb={10} />
      <Bar w="48%" h={14} mb={28} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 0.9fr',
          gap: 32,
        }}
      >
        <div>
          <Bar w="32%" h={11} mb={8} />
          <Bar w="100%" h={14} mb={6} />
          <Bar w="92%" h={14} mb={6} />
          <Bar w="86%" h={14} mb={20} />
          <div
            style={{
              padding: 18,
              border: '1px solid var(--rule)',
              borderRadius: 8,
              background: 'var(--paper-2)',
            }}
          >
            <Bar w="34%" h={11} mb={8} />
            <Bar w="100%" h={28} mb={6} />
            <Bar w="80%" h={11} />
          </div>
        </div>
        <div>
          <Bar w="40%" h={11} mb={8} />
          <Bar w="100%" h={14} mb={4} />
          <Bar w="90%" h={14} mb={4} />
          <Bar w="80%" h={14} mb={4} />
        </div>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.62; }
        }
        @media (max-width: 860px) {
          [aria-busy="true"] > div { grid-template-columns: 1fr !important; }
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
