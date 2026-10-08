import { ImageResponse } from 'next/og';

// Next.js will auto-render this on /icon and use it for the favicon.
// The manifest's `icons` entry for /icon-192 + /icon-512 points to this URL
// at request-time; Next caches the response.
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

/** The mark (a framed page with two lines) in white on the laws' indigo,
 *  in a rounded square, like the app's own icon. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 112,
          background: 'linear-gradient(135deg, #3D4FD1 0%, #1F2A5E 100%)',
        }}
      >
        <div
          style={{
            width: 260,
            height: 260,
            border: '26px solid #fff',
            borderRadius: 28,
            display: 'flex',
            flexDirection: 'column',
            padding: '62px 30px 0',
          }}
        >
          <div style={{ height: 26, borderRadius: 13, background: '#fff', marginBottom: 40, display: 'flex' }} />
          <div style={{ height: 26, borderRadius: 13, background: '#fff', width: '70%', display: 'flex' }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
