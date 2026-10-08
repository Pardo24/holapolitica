import { ImageResponse } from 'next/og';

// iOS "Add to Home Screen" reads the apple-touch-icon: the same mark as the
// favicon (app/icon.tsx), white on the laws' indigo. iOS rounds the corners
// itself, so the square is full-bleed.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #3D4FD1 0%, #1F2A5E 100%)',
        }}
      >
        <div
          style={{
            width: 92,
            height: 92,
            border: '9px solid #fff',
            borderRadius: 10,
            display: 'flex',
            flexDirection: 'column',
            padding: '22px 11px 0',
          }}
        >
          <div style={{ height: 9, borderRadius: 5, background: '#fff', marginBottom: 14, display: 'flex' }} />
          <div style={{ height: 9, borderRadius: 5, background: '#fff', width: '70%', display: 'flex' }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
