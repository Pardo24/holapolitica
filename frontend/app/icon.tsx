import { ImageResponse } from 'next/og';

import { MARK_DOT, MARK_INK, MARK_PAPER, MARK_RULE, markSeats } from '@/lib/brandMark';

// Next.js will auto-render this on /icon and use it for the favicon.
// The manifest's `icons` entry for /icon-192 + /icon-512 points to this URL
// at request-time; Next caches the response.
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

/** The mark (lib/brandMark.ts): the chamber's seats over a rule, paper on
 *  ink, in a square. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: MARK_INK }}>
        <svg width="512" height="512" viewBox="0 0 512 512">
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
