import type { ReactNode } from 'react';

import { EmbedAutoHeight } from '@/components/EmbedAutoHeight';

/**
 * Layout shared by every /embed/* route. The root layout already strips
 * the site chrome for embed paths; this layer only adds the auto-height
 * emitter so an embedding page can size the iframe to the content.
 */
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <EmbedAutoHeight />
    </>
  );
}
