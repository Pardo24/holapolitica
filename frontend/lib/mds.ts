/**
 * Lay out items in 2D from a pairwise *similarity* matrix, so that similar
 * items end up close together — the engine behind "El Mapa", where parties
 * that vote alike sit near each other.
 *
 * Method: classical stress majorization (SMACOF). Target distance between i,j
 * is `1 - similarity` (∈ [0,1]); pairs with no data get zero weight (ignored).
 * Deterministic — initial positions sit on a circle, no randomness — so the
 * same data always yields the same map (and it can run in a server component).
 *
 * The axes carry no inherent meaning (MDS recovers relative distances, not a
 * left–right scale); only proximity and clustering are interpretable.
 */
export interface Point {
  x: number;
  y: number;
}

export function layoutFromSimilarity(
  ids: string[],
  similarity: (a: string, b: string) => number | null,
  iterations = 300,
): Map<string, Point> {
  const n = ids.length;
  const out = new Map<string, Point>();
  if (n === 0) return out;
  if (n === 1) {
    out.set(ids[0]!, { x: 0.5, y: 0.5 });
    return out;
  }

  // Target distances + weights.
  const d: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const w: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = similarity(ids[i]!, ids[j]!);
      if (s == null) continue;
      const dist = Math.max(0.02, 1 - s);
      d[i]![j] = dist;
      d[j]![i] = dist;
      w[i]![j] = 1;
      w[j]![i] = 1;
    }
  }

  // Deterministic circle init.
  const pos: Point[] = ids.map((_, i) => ({
    x: 0.5 + 0.4 * Math.cos((2 * Math.PI * i) / n),
    y: 0.5 + 0.4 * Math.sin((2 * Math.PI * i) / n),
  }));

  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      let sx = 0;
      let sy = 0;
      let sw = 0;
      for (let j = 0; j < n; j++) {
        if (i === j || w[i]![j] === 0) continue;
        const dx = pos[i]!.x - pos[j]!.x;
        const dy = pos[i]!.y - pos[j]!.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        const wij = w[i]![j]!;
        // SMACOF Guttman transform term.
        sx += wij * (pos[j]!.x + d[i]![j]! * (dx / dist));
        sy += wij * (pos[j]!.y + d[i]![j]! * (dy / dist));
        sw += wij;
      }
      if (sw > 0) {
        pos[i]!.x = sx / sw;
        pos[i]!.y = sy / sw;
      }
    }
  }

  // Normalise to a [0,1] box with a small margin.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pos) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const span = Math.max(spanX, spanY);
  ids.forEach((id, i) => {
    out.set(id, {
      x: 0.08 + 0.84 * ((pos[i]!.x - minX) / span),
      y: 0.08 + 0.84 * ((pos[i]!.y - minY) / span),
    });
  });
  return out;
}
