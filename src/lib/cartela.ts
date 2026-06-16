export function normalizeCartelaIds(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return [
      ...new Set(
        raw
          .map((v) => Math.trunc(Number(v)))
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 200),
      ),
    ].slice(0, 3);
  }
  if (typeof raw === "string") {
    const inner = raw.replace(/^\{|\}$|^\[|\]$/g, "").trim();
    if (!inner) return [];
    return normalizeCartelaIds(inner.split(",").map((s) => s.trim()));
  }
  return [];
}

const FREE = 0;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(values: number[], seed: number): number[] {
  const rng = mulberry32(seed);
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deterministically maps a cartela number (1..200) to a standard 75-ball 5x5 card.
 */
export function generateCardFromCartela(cartelaNumber: number): number[] {
  const normalized = Math.max(1, Math.min(200, Math.trunc(cartelaNumber) || 1));
  const ranges: Array<[number, number]> = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];

  const cols = ranges.map(([lo, hi], colIndex) => {
    const pool = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    return seededShuffle(pool, normalized * 100 + colIndex + 1).slice(0, 5);
  });

  const flat = new Array<number>(25).fill(0);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      flat[row * 5 + col] = cols[col][row];
    }
  }
  flat[12] = FREE;
  return flat;
}

export function splitCards(combined: number[]): number[][] {
  if (!combined?.length) return [];
  const cards: number[][] = [];
  for (let i = 0; i < combined.length; i += 25) {
    const chunk = combined.slice(i, i + 25);
    if (chunk.length === 25) cards.push(chunk);
  }
  return cards;
}

/**
 * Resolve all player cartelas from DB card array, selected_cartelas ids, and session fallback.
 * Uses whichever source yields the most cards (fixes stale selected_cartelas with only [1]).
 */
export function resolvePlayerCards(
  card: number[] | null | undefined,
  selectedCartelas: unknown,
  sessionCartelas?: number[] | null,
): number[][] {
  const fromCard = splitCards(card ?? []);
  const ids = [
    ...new Set([
      ...normalizeCartelaIds(selectedCartelas),
      ...normalizeCartelaIds(sessionCartelas),
    ]),
  ].slice(0, 3);
  const fromIds = ids.map((c) => generateCardFromCartela(c));

  if (fromCard.length >= fromIds.length && fromCard.length > 0) return fromCard;
  if (fromIds.length > 0) return fromIds;
  return fromCard;
}

/** Read cartelas persisted when joining/creating from the lobby. */
export function readSessionCartelas(roomCode: string): number[] | null {
  try {
    const stored = sessionStorage.getItem(`room-cartelas:${roomCode}`);
    if (!stored) return null;
    const parsed = normalizeCartelaIds(JSON.parse(stored));
    return parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSessionCartelas(roomCode: string, cartelas: number[]): void {
  sessionStorage.setItem(`room-cartelas:${roomCode}`, JSON.stringify(normalizeCartelaIds(cartelas)));
}
