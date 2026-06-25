/**
 * Local-only Trivia progression: best score and a daily-challenge streak, kept
 * in localStorage (no account, no backend). Privacy-preserving by design — the
 * numbers never leave the device. Used by the homepage hero and the result
 * screen so Trivia feels like a place you come back to.
 */
export interface TriviaStats {
  best: number; // most quesitos collected in a single turn
  streak: number; // consecutive days the daily challenge was completed
  lastDaily: string | null; // YYYY-MM-DD of the last daily challenge played
}

const KEY = 'hp_trivia_stats_v1';
const EMPTY: TriviaStats = { best: 0, streak: 0, lastDaily: null };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function readStats(): TriviaStats {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<TriviaStats>;
    return {
      best: typeof parsed.best === 'number' ? parsed.best : 0,
      streak: typeof parsed.streak === 'number' ? parsed.streak : 0,
      lastDaily: typeof parsed.lastDaily === 'string' ? parsed.lastDaily : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * Record a finished turn. Always updates the best score; for the daily
 * challenge it also advances the streak (consecutive days), keeping it if you
 * already played today and resetting it if you skipped a day.
 */
export function recordResult(quesitos: number, daily: boolean): TriviaStats {
  const prev = readStats();
  const best = Math.max(prev.best, quesitos);
  let streak = prev.streak;
  let lastDaily = prev.lastDaily;

  if (daily) {
    const now = new Date();
    const today = ymd(now);
    const yesterday = ymd(new Date(now.getTime() - 86_400_000));
    if (prev.lastDaily === today) {
      // already counted today — leave the streak as is
    } else if (prev.lastDaily === yesterday) {
      streak = prev.streak + 1;
    } else {
      streak = 1;
    }
    lastDaily = today;
  }

  const next: TriviaStats = { best, streak, lastDaily };
  persist(next);
  return next;
}

function persist(s: TriviaStats): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage disabled — keep the in-memory value */
  }
}

/**
 * Mark today's "pregunta del dia" as answered and advance the streak
 * (consecutive days). Idempotent within a day. Returns the updated stats.
 */
export function recordDailyAnswered(): TriviaStats {
  const prev = readStats();
  const now = new Date();
  const today = ymd(now);
  const yesterday = ymd(new Date(now.getTime() - 86_400_000));
  let streak = prev.streak;
  if (prev.lastDaily === today) {
    // already counted today
  } else if (prev.lastDaily === yesterday) {
    streak = prev.streak + 1;
  } else {
    streak = 1;
  }
  const next: TriviaStats = { best: prev.best, streak, lastDaily: today };
  persist(next);
  return next;
}

/** Whether today's daily question has already been answered on this device. */
export function answeredDailyToday(): boolean {
  const now = new Date();
  return readStats().lastDaily === ymd(now);
}
