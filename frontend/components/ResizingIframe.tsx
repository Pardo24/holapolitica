'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Iframe that resizes itself to its embed content's height, using the
 * `holapolitica:embed-height` message posted by EmbedAutoHeight. Used on
 * /journalists so the live widget previews sit flush — no inner
 * scrollbar, no trailing whitespace below the content.
 *
 * Starts at `fallbackHeight` (so SSR + no-JS render something sensible)
 * and snaps to the real height once the framed document reports it. The
 * message is only accepted when it originates from THIS iframe's own
 * contentWindow.
 */
export function ResizingIframe({
  src,
  title,
  fallbackHeight,
}: {
  src: string;
  title: string;
  fallbackHeight: number;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(fallbackHeight);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      const data = e.data as { type?: string; height?: number } | null;
      if (
        data &&
        data.type === 'holapolitica:embed-height' &&
        typeof data.height === 'number' &&
        Number.isFinite(data.height)
      ) {
        setHeight(Math.max(80, Math.ceil(data.height)));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <iframe
      ref={ref}
      src={src}
      title={title}
      width="100%"
      height={height}
      loading="lazy"
      // No border here: the embedded widget supplies its own .embed-card
      // chrome, so a border on the iframe would double-frame it. This is
      // what makes the preview "part of the page" rather than a pocket.
      style={{ border: 0, display: 'block', width: '100%' }}
    />
  );
}
