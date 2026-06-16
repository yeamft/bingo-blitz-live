const FREE = 0;

export const BINGO_LINES = (() => {
  const lines: number[][] = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
})();

export function hasCompletedLine(card: number[], marked: number[]): boolean {
  if (!card?.length) return false;
  const m = new Set(marked);
  return BINGO_LINES.some((line) =>
    line.every((pos) => {
      const n = card[pos];
      return n === FREE || m.has(n);
    }),
  );
}

export function hasAnyCompletedLine(cards: number[][], marked: number[]): boolean {
  return cards.some((card) => hasCompletedLine(card, marked));
}

export function numbersToBingo(card: number[], marked: number[]): number {
  if (!card?.length) return 24;
  const m = new Set(marked);
  let minNeeded = 24;
  for (const line of BINGO_LINES) {
    const needed = line.filter((pos) => {
      const n = card[pos];
      return n !== FREE && !m.has(n);
    }).length;
    minNeeded = Math.min(minNeeded, needed);
  }
  return minNeeded;
}

export function countMarkedOnCard(card: number[], marked: number[]): number {
  if (!card?.length) return 0;
  const m = new Set(marked);
  return card.filter((n, idx) => idx !== 12 && m.has(n)).length;
}
