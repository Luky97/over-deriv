import type { DigitRankings, RankGroup } from './types';

export const DIGIT_WINDOW_SIZE = 1_000;

/** Convert either a pip value (0.001) or a precision value (3) to decimals. */
export function pipSizeFromPip(pip: number | undefined): number {
  if (!Number.isFinite(pip)) return 0;
  const value = pip as number;
  if (Number.isInteger(value) && value >= 1 && value <= 20) return value;
  if (value > 0 && value < 1) return Math.max(0, Math.round(-Math.log10(value)));
  return 0;
}

/** Extract the final displayed digit without losing trailing zeroes. */
export function getLastDigit(quote: number, pipSize: number): number {
  if (!Number.isFinite(quote)) throw new Error('Quote must be finite.');
  const precision = Number.isInteger(pipSize) ? Math.min(20, Math.max(0, pipSize)) : 0;
  const display = quote.toFixed(precision);
  const digit = Number.parseInt(display.at(-1) ?? '', 10);
  if (!Number.isInteger(digit)) throw new Error('Unable to extract the displayed digit.');
  return digit;
}

export function countDigits(digits: readonly number[]): number[] {
  const counts = Array<number>(10).fill(0);
  for (const digit of digits) {
    if (Number.isInteger(digit) && digit >= 0 && digit <= 9) counts[digit] += 1;
  }
  return counts;
}

function group(digits: number[], count: number, total: number): RankGroup {
  return {
    digits: digits.sort((a, b) => a - b),
    count,
    percentage: total === 0 ? 0 : (count / total) * 100,
  };
}

/** Rank by distinct frequency bands. Every tied digit remains in its band. */
export function calculateRankings(counts: readonly number[], total: number): DigitRankings {
  const bands = new Map<number, number[]>();
  for (let digit = 0; digit <= 9; digit += 1) {
    const count = counts[digit] ?? 0;
    bands.set(count, [...(bands.get(count) ?? []), digit]);
  }
  const descending = [...bands.keys()].sort((a, b) => b - a);
  const ascending = [...descending].reverse();
  const mostCount = descending[0] ?? 0;
  const secondMostCount = descending[1];
  const leastCount = ascending[0] ?? 0;
  const secondLeastCount = ascending[1];
  const rankByDigit = Array<number>(10).fill(0);
  descending.forEach((count, rank) => {
    for (const digit of bands.get(count) ?? []) rankByDigit[digit] = rank + 1;
  });
  const maxPercentage = total === 0 ? 0 : (mostCount / total) * 100;
  const minPercentage = total === 0 ? 0 : (leastCount / total) * 100;
  return {
    most: group([...(bands.get(mostCount) ?? [])], mostCount, total),
    secondMost: secondMostCount === undefined
      ? group([], 0, total)
      : group([...(bands.get(secondMostCount) ?? [])], secondMostCount, total),
    least: group([...(bands.get(leastCount) ?? [])], leastCount, total),
    secondLeast: secondLeastCount === undefined
      ? group([], 0, total)
      : group([...(bands.get(secondLeastCount) ?? [])], secondLeastCount, total),
    rankByDigit,
    concentration: maxPercentage / 100,
    spreadPercentagePoints: maxPercentage - minPercentage,
  };
}

/** Compatibility helper retained for focused consumers and tests. */
export function updateDigitStats(values: readonly number[], next: number, limit = DIGIT_WINDOW_SIZE): number[] {
  return [...values, next].slice(-limit);
}
