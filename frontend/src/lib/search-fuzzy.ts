/**
 * Fuzzy scoring for global search autocomplete (no external dependency).
 * Scores: 3 = exact substring, 2 = word-boundary match, 1 = character-order match.
 */

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

/** Score 3: query is exact substring of text */
function scoreSubstring(text: string, q: string): number {
  const idx = text.indexOf(q);
  if (idx === -1) return 0;
  // Prefer match at start
  if (idx === 0) return 3;
  return 2.5;
}

/** Score 2: query matches at word boundary (e.g. "graf" in "Grafana") */
function scoreWordBoundary(text: string, q: string): number {
  const re = new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  return re.test(text) ? 2 : 0;
}

/** Score 1: query chars appear in order in text (e.g. "prm" in "Prometheus") */
function scoreCharOrder(text: string, q: string): number {
  let ti = 0;
  for (let i = 0; i < q.length; i++) {
    const idx = text.indexOf(q[i], ti);
    if (idx === -1) return 0;
    ti = idx + 1;
  }
  return 1;
}

/**
 * Returns a score > 0 if query matches text (fuzzy). Higher = better match.
 */
export function scoreFuzzy(text: string, query: string): number {
  const t = normalize(text);
  const q = normalize(query);
  if (!q) return 0;
  if (t === q) return 4;
  const sub = scoreSubstring(t, q);
  if (sub > 0) return sub;
  const word = scoreWordBoundary(t, q);
  if (word > 0) return word;
  return scoreCharOrder(t, q);
}

/**
 * Filter and sort items by fuzzy score. Each item has a searchable string (or string[]).
 */
export function filterAndSortByFuzzy<T>(
  items: T[],
  query: string,
  getSearchable: (item: T) => string | string[]
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = items
    .map((item) => {
      const s = getSearchable(item);
      const strs = Array.isArray(s) ? s : [s];
      let best = 0;
      for (const str of strs) {
        if (!str) continue;
        const sc = scoreFuzzy(str, query);
        if (sc > best) best = sc;
      }
      return { item, score: best } as const;
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const sa = getSearchable(a.item);
      const sb = getSearchable(b.item);
      const lenA = Array.isArray(sa) ? Math.min(...sa.map((s) => (s || "").length)) : (sa || "").length;
      const lenB = Array.isArray(sb) ? Math.min(...sb.map((s) => (s || "").length)) : (sb || "").length;
      return lenA - lenB;
    });
  return scored.map((x) => x.item);
}
