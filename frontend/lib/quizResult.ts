/**
 * A shared "Com et representen?" result in a link: ``?r=<group slug>.<% of
 * votes in common>.<votes compared>``. Written by components/AlignQuiz.tsx
 * when the reader shares, read by the page's metadata and its share image.
 */

export interface QuizResult {
  slug: string;
  pct: number;
  compared: number;
}

export function quizResultParam(r: QuizResult): string {
  return `${r.slug}.${r.pct}.${r.compared}`;
}

export function parseQuizResult(raw: string | null | undefined): QuizResult | null {
  const m = /^([a-z0-9-]{2,60})\.(\d{1,3})\.(\d{1,3})$/.exec(raw ?? '');
  if (!m) return null;
  const pct = Number(m[2]);
  const compared = Number(m[3]);
  if (pct > 100 || compared < 1 || compared > 100) return null;
  return { slug: m[1]!, pct, compared };
}
