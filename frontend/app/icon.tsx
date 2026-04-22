import { ImageResponse } from 'next/og';

// Next.js will auto-render this on /icon and use it for the favicon.
// The manifest's `icons` entry for /icon-192 + /icon-512 points to this URL
// at request-time; Next caches the response.
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#fbf9f4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 96,
        }}
      >
        <div
          style={{
            width: 320,
            height: 320,
            border: '24px solid #1a2138',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            padding: '88px 0 0',
          }}
        >
          <div style={{ height: 24, background: '#1a2138', marginBottom: 56 }} />
          <div style={{ height: 24, background: '#1a2138' }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
