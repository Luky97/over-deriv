import {
  HIGH_DIGITS,
  LOW_DIGITS,
  TRACKED_DIGITS,
} from './types';
import type {
  ConsensusResult,
  DigitMovement,
  DigitSnapshot,
  DigitStats,
  GroupMovement,
  GroupSnapshot,
  MovementStatus,
  RankGroup,
  TrackedDigit,
} from './types';

export const DIGIT_WINDOW_SIZE = 1_000;

/** Convert a market pip value such as 0.01 into its fixed decimal precision. */
export function pipSizeFromPip(pip: number): number {
  if (!Number.isFinite(pip) || pip <= 0 || pip >= 1) return 0;
  return Math.max(0, Math.round(-Math.log10(pip)));
}

/**
 * Extract a quote's final displayed digit using fixed market precision.
 * Formatting first is essential because JavaScript drops trailing zeroes.
 */
export function getLastDigit(price: number, pipSize: number): number {
  if (!Number.isFinite(price)) return 0;
  const safePipSize = Number.isInteger(pipSize)
    ? Math.min(Math.max(pipSize, 0), 20)
    : 0;
  const formattedPrice = price.toFixed(safePipSize);
  const finalCharacter = formattedPrice[formattedPrice.length - 1];
  const digit = finalCharacter ? Number.parseInt(finalCharacter, 10) : 0;
  return Number.isInteger(digit) ? digit : 0;
}

/** Count all digits 0-9. Tracked cards are filtered separately. */
export function computeDigitStats(prices: readonly number[], pipSize: number): DigitStats {
  const counts = Array<number>(10).fill(0);

  for (const price of prices) {
    if (!Number.isFinite(price)) continue;
    counts[getLastDigit(price, pipSize)] += 1;
  }

  const totalTicks = prices.length;
  const percentages = counts.map((count) =>
    totalTicks === 0 ? 0 : (count / totalTicks) * 100
  );

  return { counts, percentages, totalTicks };
}

/** Return a new rolling array capped to the latest windowSize values. */
export function updateDigitStats(
  prices: readonly number[],
  newPrice: number,
  windowSize: number
): number[] {
  return [...prices, newPrice].slice(-windowSize);
}

/** Build the four all-digit rankings with mathematically correct ties. */
export function computeRankings(
  counts: readonly number[],
  totalTicks: number
): RankGroup[] {
  const digitsByCount = new Map<number, TrackedDigit[]>();

  for (const digit of TRACKED_DIGITS) {
    const count = counts[digit] ?? 0;
    const tiedDigits = digitsByCount.get(count) ?? [];
    tiedDigits.push(digit);
    digitsByCount.set(count, tiedDigits);
  }

  const distinctCounts = [...digitsByCount.keys()].sort((a, b) => b - a);
  const percentage = (count: number) =>
    totalTicks === 0 ? 0 : (count / totalTicks) * 100;

  const makeRank = (label: string, count?: number): RankGroup => {
    if (count === undefined) {
      return { label, digits: [], count: 0, percentage: 0 };
    }

    return {
      label,
      digits: [...(digitsByCount.get(count) ?? [])].sort((a, b) => a - b),
      count,
      percentage: percentage(count),
    };
  };

  const lowestIndex = distinctCounts.length - 1;
  return [
    makeRank('Most', distinctCounts[0]),
    makeRank('2nd Most', distinctCounts[1]),
    makeRank('Least', distinctCounts[lowestIndex]),
    makeRank(
      '2nd Least',
      distinctCounts.length > 1 ? distinctCounts[lowestIndex - 1] : undefined
    ),
  ];
}

export function computeGroupSnapshot(
  counts: readonly number[],
  groupDigits: readonly TrackedDigit[],
  totalTicks: number
): GroupSnapshot {
  const groupCount = groupDigits.reduce<number>(
    (sum, digit) => sum + (counts[digit] ?? 0),
    0
  );

  return {
    groupCount,
    groupPercentage: totalTicks === 0 ? 0 : (groupCount / totalTicks) * 100,
  };
}

export function getMovementStatus(deltaCount: number): MovementStatus {
  if (deltaCount > 0) return 'increase';
  if (deltaCount < 0) return 'decrease';
  return 'no-change';
}

export function createSnapshot(
  counts: readonly number[],
  totalTicks: number,
  timestamp = Date.now()
): DigitSnapshot {
  const percentages = counts.map((count) =>
    totalTicks === 0 ? 0 : (count / totalTicks) * 100
  );

  return {
    counts: [...counts],
    percentages,
    totalTicks,
    lowGroup: computeGroupSnapshot(counts, LOW_DIGITS, totalTicks),
    highGroup: computeGroupSnapshot(counts, HIGH_DIGITS, totalTicks),
    timestamp,
  };
}

export function computeDigitMovements(
  currentSnapshot: DigitSnapshot,
  previousSnapshot: DigitSnapshot
): DigitMovement[] {
  return TRACKED_DIGITS.map((digit) => {
    const currentCount = currentSnapshot.counts[digit] ?? 0;
    const currentPercentage = currentSnapshot.percentages[digit] ?? 0;
    const deltaCount = currentCount - (previousSnapshot.counts[digit] ?? 0);
    const deltaPercentagePoints =
      currentPercentage - (previousSnapshot.percentages[digit] ?? 0);

    return {
      digit,
      currentCount,
      currentPercentage,
      deltaCount,
      deltaPercentagePoints,
      status: getMovementStatus(deltaCount),
    };
  });
}

export function computeGroupConsensus(
  movements: readonly DigitMovement[],
  groupDigits: readonly TrackedDigit[],
  groupName: 'low' | 'high'
): ConsensusResult {
  const groupMovements = movements.filter((movement) =>
    groupDigits.includes(movement.digit)
  );
  const increasing = groupMovements
    .filter((movement) => movement.status === 'increase')
    .map((movement) => movement.digit);
  const decreasing = groupMovements
    .filter((movement) => movement.status === 'decrease')
    .map((movement) => movement.digit);
  const noChange = groupMovements
    .filter((movement) => movement.status === 'no-change')
    .map((movement) => movement.digit);

  let label = `Mixed ${groupName} movement`;
  if (increasing.length === groupDigits.length) {
    label = `All ${groupName} digits increased`;
  } else if (decreasing.length === groupDigits.length) {
    label = `All ${groupName} digits decreased`;
  }

  return { label, increasing, decreasing, noChange };
}

export function computeGroupMovement(
  currentSnapshot: DigitSnapshot,
  previousSnapshot: DigitSnapshot,
  groupDigits: readonly TrackedDigit[],
  groupName: 'low' | 'high',
  movements: readonly DigitMovement[]
): GroupMovement {
  const current = groupName === 'low'
    ? currentSnapshot.lowGroup
    : currentSnapshot.highGroup;
  const previous = groupName === 'low'
    ? previousSnapshot.lowGroup
    : previousSnapshot.highGroup;
  const deltaCount = current.groupCount - previous.groupCount;

  return {
    digits: groupDigits,
    currentCount: current.groupCount,
    currentPercentage: current.groupPercentage,
    deltaCount,
    deltaPercentagePoints:
      current.groupPercentage - previous.groupPercentage,
    status: getMovementStatus(deltaCount),
    consensus: computeGroupConsensus(movements, groupDigits, groupName),
  };
}
