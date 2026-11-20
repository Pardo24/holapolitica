import { ImageResponse } from 'next/og';

import { MARK_DOT, MARK_INK, MARK_PAPER, MARK_RULE, markSeats } from '@/lib/brandMark';

// iOS "Add to Home Screen" reads the apple-touch-icon: the same mark as the
// favicon (app/icon.tsx). iOS rounds the corners itself, so the square is
// full-bleed.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: MARK_INK }}>
        <svg width="180" height="180" viewBox="0 0 512 512">
          {markSeats().map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={MARK_DOT} fill={MARK_PAPER} />
          ))}
          <rect {...MARK_RULE} fill={MARK_PAPER} />
        </svg>
      </div>
    ),
    { ...size },
  );
}
