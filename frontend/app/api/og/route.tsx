import { ImageResponse } from 'next/og';

import { api } from '@/lib/api';

export const runtime = 'edge';

/**
 * Generate social-share cards for votes (1200x630).
 *
 * Usage: <img src="/api/og?vote=123" />
 *
 * Strict guidelines (see CLAUDE.md):
 * - Only factual data (title, result, counts).
 * - No editorial wording.
 * - Project attribution always visible.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const voteId = url.searchParams.get('vote');

  if (!voteId) {
    return new Response('Missing vote parameter', { status: 400 });
  }

  let vote;
  try {
    vote = await api.votes.get(Number(voteId));
  } catch {
    return new Response('Vote not found', { status: 404 });
  }

  const resultColors: Record<string, { bg: string; fg: string }> = {
    approved: { bg: '#DCFCE7', fg: '#14532D' },
    rejected: { bg: '#FEE2E2', fg: '#7F1D1D' },
    tie: { bg: '#FEF3C7', fg: '#78350F' },
  };
  const resultLabels: Record<string, string> = {
    approved: 'APROVADA',
    rejected: 'REBUTJADA',
    tie: 'EMPAT',
  };
  const colors = resultColors[vote.result] ?? resultColors.approved!;
  const label = resultLabels[vote.result] ?? vote.result.toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'white',
          padding: '60px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div style={{ fontSize: 24, color: '#64748B', display: 'flex' }}>
            Hola Política
          </div>
          <div
            style={{
              fontSize: 22,
              padding: '8px 16px',
              borderRadius: 8,
              background: colors.bg,
              color: colors.fg,
              fontWeight: 700,
              display: 'flex',
            }}
          >
            {label}
          </div>
        </div>

        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            color: '#0F172A',
            lineHeight: 1.2,
            display: 'flex',
            flex: 1,
          }}
        >
          {vote.title.length > 200 ? vote.title.slice(0, 200) + '…' : vote.title}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 24,
            marginTop: 30,
            fontSize: 28,
          }}
        >
          <Stat label="Sí" value={vote.ayes} />
          <Stat label="No" value={vote.noes} />
          <Stat label="Abst." value={vote.abstentions} />
          <Stat label="Abs." value={vote.absent} />
        </div>

        <div
          style={{
            marginTop: 24,
            fontSize: 18,
            color: '#94A3B8',
            display: 'flex',
          }}
        >
          {new Date(vote.voted_at).toLocaleDateString('ca-ES', { dateStyle: 'long' })}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 16, color: '#64748B' }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, color: '#0F172A' }}>{value}</div>
    </div>
  );
}
