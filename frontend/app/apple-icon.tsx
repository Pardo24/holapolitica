import { ImageResponse } from 'next/og';

// iOS "Add to Home Screen" reads the apple-touch-icon. We render a 180×180
// PNG that matches the Mirall paper-and-ink aesthetic used by the app icon.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
          padding: 36,
        }}
      >
        <div
          style={{
            width: 108,
            height: 108,
            border: '8px solid #1a2138',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            padding: '30px 0 0',
          }}
        >
          <div style={{ height: 8, background: '#1a2138', marginBottom: 22 }} />
          <div style={{ height: 8, background: '#1a2138' }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
