/** Accent-insensitive, typo-tolerant player-name search. */

const SPECIAL: Record<string, string> = {
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ß: 'ss',
};

export function normalizeName(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[øæœłđðþß]/g, (char) => SPECIAL[char] ?? char)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

const tolerance = (length: number) => (length <= 3 ? 0 : length <= 6 ? 1 : 2);

function wordMatches(query: string, word: string): boolean {
  if (word.includes(query)) return true;
  const allowed = tolerance(query.length);
  if (allowed === 0) return false;
  // Whole word, or the start of a longer word while the user is still typing.
  return (
    distance(query, word) <= allowed ||
    (word.length > query.length && distance(query, word.slice(0, query.length)) <= allowed)
  );
}

/** True when every word of `query` matches some word of `name` (substring or a near miss). */
export function matchesName(name: string, query: string): boolean {
  const terms = normalizeName(query).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  const words = normalizeName(name).split(' ').filter(Boolean);
  return terms.every((term) => words.some((word) => wordMatches(term, word)));
}
