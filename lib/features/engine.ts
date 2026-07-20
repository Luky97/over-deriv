import { calculateRankings, countDigits } from '@/lib/digit-stats';
import type {
  FeatureSnapshot,
  MarketTick,
  RegimeLabel,
  TransitionTable,
  WindowFeatures,
  WindowSize,
} from '@/lib/types';
import { WINDOW_SIZES } from '@/lib/types';
import {
  autocorrelation,
  chiSquareUniform,
  clamp,
  currentRun,
  jensenShannonDivergence,
  maximumRun,
  mean,
  shannonEntropy,
  standardDeviation,
  transitionProbabilities,
} from './statistics';

function toWindow(digits: readonly number[]): WindowFeatures {
  const counts = countDigits(digits);
  const size = digits.length;
  const percentages = counts.map((count) => (size === 0 ? 0 : (count / size) * 100));
  const expected = size * 0.1;
  const deviation = Math.sqrt(Math.max(0.0001, size * 0.1 * 0.9));
  const zScores = counts.map((count) => (count - expected) / deviation);
  const even = counts[0] + counts[2] + counts[4] + counts[6] + counts[8];
  const over3 = counts.slice(4).reduce((sum, count) => sum + count, 0);
  const under7 = counts.slice(0, 7).reduce((sum, count) => sum + count, 0);
  return {
    size,
    counts,
    percentages,
    zScores,
    rankings: calculateRankings(counts, size),
    evenPercentage: size === 0 ? 0 : (even / size) * 100,
    oddPercentage: size === 0 ? 0 : ((size - even) / size) * 100,
    over3Percentage: size === 0 ? 0 : (over3 / size) * 100,
    under7Percentage: size === 0 ? 0 : (under7 / size) * 100,
    entropy: shannonEntropy(counts),
    chiSquare: chiSquareUniform(counts),
  };
}

function binaryTransition(values: readonly boolean[], labels: [string, string]): TransitionTable {
  const numeric = values.map((value) => (value ? 1 : 0));
  const counts = [Array<number>(2).fill(0), Array<number>(2).fill(0)];
  for (let index = 1; index < numeric.length; index += 1) counts[numeric[index - 1]][numeric[index]] += 1;
  const probabilities = counts.map((row) => {
    const total = row[0] + row[1];
    return row.map((count) => (count + 0.5) / (total + 1));
  });
  return { labels, counts, probabilities };
}

function secondOrderBinary(values: readonly boolean[]): Record<string, [number, number]> {
  const counts: Record<string, [number, number]> = {};
  for (let index = 2; index < values.length; index += 1) {
    const key = `${Number(values[index - 2])}${Number(values[index - 1])}`;
    const pair = counts[key] ?? [0, 0];
    pair[Number(values[index])] += 1;
    counts[key] = pair;
  }
  return Object.fromEntries(Object.entries(counts).map(([key, pair]) => {
    const total = pair[0] + pair[1];
    return [key, [(pair[0] + 0.5) / (total + 1), (pair[1] + 0.5) / (total + 1)]];
  }));
}

function secondOrderDigits(digits: readonly number[]): Record<string, number[]> {
  const counts: Record<string, number[]> = {};
  for (let index = 2; index < digits.length; index += 1) {
    const key = `${digits[index - 2]},${digits[index - 1]}`;
    const row = counts[key] ?? Array<number>(10).fill(0);
    row[digits[index]] += 1;
    counts[key] = row;
  }
  return Object.fromEntries(Object.entries(counts).map(([key, row]) => {
    const total = row.reduce((sum, count) => sum + count, 0);
    return [key, row.map((count) => (count + 0.25) / (total + 2.5))];
  }));
}

function repeats(digits: readonly number[], length: 2 | 3): number {
  if (digits.length < length * 2) return 0;
  let matches = 0;
  let comparisons = 0;
  for (let index = length; index < digits.length; index += 1) {
    comparisons += 1;
    let same = true;
    for (let offset = 0; offset < length; offset += 1) {
      if (digits[index - offset] !== digits[index - length - offset]) same = false;
    }
    if (same) matches += 1;
  }
  return comparisons === 0 ? 0 : matches / comparisons;
}

function ngramOccurrences(digits: readonly number[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const size of [2, 3, 4]) {
    if (digits.length < size) continue;
    const needle = digits.slice(-size).join('');
    let count = 0;
    for (let index = 0; index <= digits.length - size; index += 1) {
      if (digits.slice(index, index + size).join('') === needle) count += 1;
    }
    result[`${size}:${needle}`] = count;
  }
  return result;
}

function detectRegime(
  windows: Record<WindowSize, WindowFeatures>,
  entropy: number,
  divergence: number,
  stability: number,
): RegimeLabel {
  const long = windows[1000];
  const recent = windows[50];
  if (long.size < 250) return 'UNSTABLE';
  if (divergence >= 0.09 || stability < 0.55
    || Math.abs(recent.evenPercentage - long.evenPercentage) >= 12) return 'TRANSITION';
  const candidates: Array<[RegimeLabel, number]> = [
    ['EVEN_DOMINANT', (long.evenPercentage - 50) / 5],
    ['ODD_DOMINANT', (long.oddPercentage - 50) / 5],
    ['OVER3_DOMINANT', (long.over3Percentage - 60) / 5],
    ['UNDER7_DOMINANT', (long.under7Percentage - 70) / 5],
  ];
  const strongest = candidates.sort((a, b) => b[1] - a[1])[0];
  if (strongest[1] >= 1) return strongest[0];
  if (entropy >= 3.27) return 'HIGH_ENTROPY';
  if (entropy <= 3.05) return 'LOW_ENTROPY';
  return 'MIXED';
}

function quoteFeatures(ticks: readonly MarketTick[]) {
  const quotes = ticks.map((tick) => tick.quote);
  const recent = quotes.slice(-20);
  const long = quotes.slice(-100);
  const current = quotes[quotes.length - 1] ?? 0;
  const previous = quotes[quotes.length - 2] ?? current;
  const difference = current - previous;
  const deltas = recent.slice(1).map((quote, index) => quote - recent[index]);
  const longDeltas = long.slice(1).map((quote, index) => quote - long[index]);
  const direction = difference > 0 ? 'UP' : difference < 0 ? 'DOWN' : 'FLAT';
  let directionStreak = 0;
  for (let index = quotes.length - 1; index > 0; index -= 1) {
    const delta = quotes[index] - quotes[index - 1];
    const candidate = delta > 0 ? 'UP' : delta < 0 ? 'DOWN' : 'FLAT';
    if (candidate !== direction) break;
    directionStreak += 1;
  }
  const recentMean = mean(recent);
  const recentVolatility = standardDeviation(deltas);
  const longVolatility = standardDeviation(longDeltas);
  const pipSize = ticks[ticks.length - 1]?.pipSize ?? 0;
  const pip = 10 ** -pipSize;
  return {
    current,
    difference,
    absoluteDifference: Math.abs(difference),
    direction,
    directionStreak,
    normalizedReturn: previous === 0 ? 0 : difference / Math.abs(previous),
    rollingMean: recentMean,
    rollingStandardDeviation: standardDeviation(recent),
    shortVolatility: recentVolatility,
    longVolatility,
    movementSpeed: mean(deltas.slice(-5).map(Math.abs)),
    movementAcceleration: mean(deltas.slice(-5)) - mean(deltas.slice(-10, -5)),
    distanceFromMean: recentVolatility === 0 ? 0 : (current - recentMean) / recentVolatility,
    volatilityChange: longVolatility === 0 ? 0 : (recentVolatility - longVolatility) / longVolatility,
    pipNormalizedChange: pip === 0 ? 0 : difference / pip,
  } as const;
}

function addVectorFeature(names: string[], vector: number[], name: string, value: number, scale = 1): void {
  names.push(name);
  vector.push(clamp(value / scale, -5, 5));
}

export function buildFeatureSnapshot(market: string, ticks: readonly MarketTick[]): FeatureSnapshot {
  if (ticks.length === 0) throw new Error('Cannot build a feature snapshot without ticks.');
  const sample = ticks.slice(-1000);
  const digits = sample.map((tick) => tick.digit);
  const windows = {} as Record<WindowSize, WindowFeatures>;
  for (const size of WINDOW_SIZES) windows[size] = toWindow(digits.slice(-size));

  const frequencySlope = Array.from({ length: 10 }, (_, digit) =>
    (windows[20].percentages[digit] - windows[50].percentages[digit]) / 100);
  const frequencyAcceleration = Array.from({ length: 10 }, (_, digit) =>
    ((windows[20].percentages[digit] - windows[50].percentages[digit])
      - (windows[50].percentages[digit] - windows[100].percentages[digit])) / 100);
  const recentLongDifference = Array.from({ length: 10 }, (_, digit) =>
    (windows[20].percentages[digit] - windows[1000].percentages[digit]) / 100);
  const rankMomentum = Array.from({ length: 10 }, (_, digit) =>
    (windows[1000].rankings.rankByDigit[digit] - windows[20].rankings.rankByDigit[digit]) / 10);

  const parity = digits.map((digit) => digit % 2 === 0);
  const over3 = digits.map((digit) => digit > 3);
  const under7 = digits.map((digit) => digit < 7);
  const firstOrderDigit = transitionProbabilities(digits.slice(-500), 10);
  const secondOrderDigit = secondOrderDigits(digits.slice(-500));
  const parityTable = binaryTransition(parity.slice(-500), ['ODD', 'EVEN']);
  const parityEntropy = shannonEntropy([
    parity.filter(Boolean).length,
    parity.filter((value) => !value).length,
  ]);
  const transitionCounts = parityTable.counts.flat();
  const transitionEntropy = shannonEntropy(transitionCounts);
  const js20 = jensenShannonDivergence(windows[20].counts, windows[1000].counts);
  const js50 = jensenShannonDivergence(windows[50].counts, windows[1000].counts);
  const patternPersistence = clamp((repeats(digits.slice(-250), 2) + repeats(digits.slice(-250), 3)) / 2);
  const stability = clamp(1 - (js20 * 3 + js50 * 2 + Math.min(1, windows[20].chiSquare / 50)) / 3);
  const driftScore = clamp(js20 * 2.5 + js50 * 1.5 + Math.abs(windows[20].evenPercentage - windows[1000].evenPercentage) / 50);
  const longEntropy = windows[1000].entropy;
  const regime = detectRegime(windows, longEntropy, Math.max(js20, js50), stability);
  const quote = quoteFeatures(sample);
  const epoch = sample[sample.length - 1].epoch;
  const date = new Date(epoch * 1000);
  const second = date.getUTCSeconds();
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();

  const featureNames: string[] = [];
  const vector: number[] = [];
  for (const size of WINDOW_SIZES) {
    const window = windows[size];
    for (let digit = 0; digit <= 9; digit += 1) {
      addVectorFeature(featureNames, vector, `w${size}.digit${digit}.percentage`, window.percentages[digit], 100);
      addVectorFeature(featureNames, vector, `w${size}.digit${digit}.z`, window.zScores[digit], 3);
      addVectorFeature(featureNames, vector, `w${size}.digit${digit}.rank`, window.rankings.rankByDigit[digit], 10);
      addVectorFeature(featureNames, vector, `w${size}.digit${digit}.most`, window.rankings.most.digits.includes(digit) ? 1 : 0);
      addVectorFeature(featureNames, vector, `w${size}.digit${digit}.secondMost`, window.rankings.secondMost.digits.includes(digit) ? 1 : 0);
      addVectorFeature(featureNames, vector, `w${size}.digit${digit}.least`, window.rankings.least.digits.includes(digit) ? 1 : 0);
      addVectorFeature(featureNames, vector, `w${size}.digit${digit}.secondLeast`, window.rankings.secondLeast.digits.includes(digit) ? 1 : 0);
    }
    addVectorFeature(featureNames, vector, `w${size}.even`, window.evenPercentage, 100);
    addVectorFeature(featureNames, vector, `w${size}.over3`, window.over3Percentage, 100);
    addVectorFeature(featureNames, vector, `w${size}.under7`, window.under7Percentage, 100);
    addVectorFeature(featureNames, vector, `w${size}.entropy`, window.entropy, Math.log2(10));
    addVectorFeature(featureNames, vector, `w${size}.rankConcentration`, window.rankings.concentration);
    addVectorFeature(featureNames, vector, `w${size}.rankSpread`, window.rankings.spreadPercentagePoints, 100);
  }
  for (let digit = 0; digit <= 9; digit += 1) {
    addVectorFeature(featureNames, vector, `digit${digit}.slope`, frequencySlope[digit]);
    addVectorFeature(featureNames, vector, `digit${digit}.acceleration`, frequencyAcceleration[digit]);
    addVectorFeature(featureNames, vector, `digit${digit}.recentLong`, recentLongDifference[digit]);
    addVectorFeature(featureNames, vector, `digit${digit}.rankMomentum`, rankMomentum[digit]);
  }
  const recentDigits = digits.slice(-20);
  recentDigits.forEach((digit, index) => addVectorFeature(featureNames, vector, `lag${index + 1}`, digit, 9));
  const lastDigit = digits[digits.length - 1];
  firstOrderDigit[lastDigit].forEach((probability, digit) =>
    addVectorFeature(featureNames, vector, `transition.${lastDigit}.${digit}`, probability));
  const pairKey = digits.slice(-2).join(',');
  (secondOrderDigit[pairKey] ?? Array<number>(10).fill(0.1)).forEach((probability, digit) =>
    addVectorFeature(featureNames, vector, `transition2.${pairKey}.${digit}`, probability));
  addVectorFeature(featureNames, vector, 'parity.imbalance', (windows[20].evenPercentage - windows[20].oddPercentage) / 100);
  addVectorFeature(featureNames, vector, 'parity.momentum', (windows[20].evenPercentage - windows[100].evenPercentage) / 100);
  addVectorFeature(featureNames, vector, 'parity.streak', currentRun(parity), 20);
  addVectorFeature(featureNames, vector, 'parity.maxStreak', maximumRun(parity.slice(-100)), 30);
  addVectorFeature(featureNames, vector, 'sequence.repeatingPairs', repeats(digits.slice(-250), 2));
  addVectorFeature(featureNames, vector, 'sequence.repeatingTriplets', repeats(digits.slice(-250), 3));
  for (const lag of [1, 2, 3, 5, 10, 20]) addVectorFeature(featureNames, vector, `autocorrelation.${lag}`, autocorrelation(digits, lag));
  addVectorFeature(featureNames, vector, 'quote.normalizedReturn', quote.normalizedReturn, 0.001);
  addVectorFeature(featureNames, vector, 'quote.direction', quote.direction === 'UP' ? 1 : quote.direction === 'DOWN' ? -1 : 0);
  addVectorFeature(featureNames, vector, 'quote.directionStreak', quote.directionStreak, 20);
  addVectorFeature(featureNames, vector, 'quote.distanceFromMean', quote.distanceFromMean, 3);
  addVectorFeature(featureNames, vector, 'quote.volatilityChange', quote.volatilityChange, 2);
  addVectorFeature(featureNames, vector, 'quote.pipNormalizedChange', quote.pipNormalizedChange, 50);
  addVectorFeature(featureNames, vector, 'random.entropy', longEntropy, Math.log2(10));
  addVectorFeature(featureNames, vector, 'random.parityEntropy', parityEntropy);
  addVectorFeature(featureNames, vector, 'random.transitionEntropy', transitionEntropy, 2);
  addVectorFeature(featureNames, vector, 'random.js20', js20);
  addVectorFeature(featureNames, vector, 'random.js50', js50);
  addVectorFeature(featureNames, vector, 'random.stability', stability);
  addVectorFeature(featureNames, vector, 'random.drift', driftScore);
  addVectorFeature(featureNames, vector, 'time.secondSin', Math.sin((2 * Math.PI * second) / 60));
  addVectorFeature(featureNames, vector, 'time.secondCos', Math.cos((2 * Math.PI * second) / 60));
  addVectorFeature(featureNames, vector, 'time.minuteSin', Math.sin((2 * Math.PI * minute) / 60));
  addVectorFeature(featureNames, vector, 'time.minuteCos', Math.cos((2 * Math.PI * minute) / 60));
  addVectorFeature(featureNames, vector, 'time.hourSin', Math.sin((2 * Math.PI * hour) / 24));
  addVectorFeature(featureNames, vector, 'time.hourCos', Math.cos((2 * Math.PI * hour) / 24));

  const tail = digits.slice(-21);
  return {
    schemaVersion: 2,
    id: `${market}:${epoch}:${sample.length}`,
    market,
    createdAtEpoch: epoch,
    sourceLastEpoch: epoch,
    resultOffsetFromTrigger: 2,
    resultOffsetFromSnapshot: 1,
    sampleSize: sample.length,
    windows,
    frequencySlope,
    frequencyAcceleration,
    recentLongDifference,
    rankMomentum,
    parityImbalance: (windows[20].evenPercentage - windows[20].oddPercentage) / 100,
    parityMomentum: (windows[20].evenPercentage - windows[100].evenPercentage) / 100,
    parityStreak: currentRun(parity),
    maximumParityStreak: maximumRun(parity.slice(-100)),
    over3Streak: currentRun(over3),
    under7Streak: currentRun(under7),
    over3Momentum: (windows[20].over3Percentage - windows[100].over3Percentage) / 100,
    under7Momentum: (windows[20].under7Percentage - windows[100].under7Percentage) / 100,
    sequence: {
      previousDigits: {
        '1': digits.slice(-1), '2': digits.slice(-2), '3': digits.slice(-3),
        '5': digits.slice(-5), '10': digits.slice(-10), '20': digits.slice(-20),
      },
      firstOrderDigit,
      secondOrderDigit,
      parityFirstOrder: parityTable,
      paritySecondOrder: secondOrderBinary(parity.slice(-500)),
      over3Transition: binaryTransition(over3.slice(-500), ['NOT_OVER_3', 'OVER_3']),
      under7Transition: binaryTransition(under7.slice(-500), ['NOT_UNDER_7', 'UNDER_7']),
      repeatingPairs: repeats(digits.slice(-250), 2),
      repeatingTriplets: repeats(digits.slice(-250), 3),
      currentDigitRun: currentRun(digits.map((digit) => digit === lastDigit)),
      alternationRate: parity.length < 2 ? 0 : parity.slice(1).filter((value, index) => value !== parity[index]).length / (parity.length - 1),
      modularDifferences: tail.slice(1).map((digit, index) => (digit - tail[index] + 10) % 10),
      distanceMean: mean(tail.slice(1).map((digit, index) => Math.abs(digit - tail[index]))),
      ngramOccurrences: ngramOccurrences(digits.slice(-500)),
      autocorrelation: Object.fromEntries([1, 2, 3, 5, 10, 20].map((lag) => [String(lag), autocorrelation(digits, lag)])),
    },
    quote,
    randomness: {
      shannonEntropy: longEntropy,
      parityEntropy,
      transitionEntropy,
      jensenShannon20To1000: js20,
      jensenShannon50To1000: js50,
      chiSquareUniform: windows[1000].chiSquare,
      patternPersistence,
      regimeStability: stability,
      driftScore,
    },
    time: {
      serverSecond: second,
      serverMinute: minute,
      serverHour: hour,
      secondSin: Math.sin((2 * Math.PI * second) / 60),
      secondCos: Math.cos((2 * Math.PI * second) / 60),
      minuteSin: Math.sin((2 * Math.PI * minute) / 60),
      minuteCos: Math.cos((2 * Math.PI * minute) / 60),
      hourSin: Math.sin((2 * Math.PI * hour) / 24),
      hourCos: Math.cos((2 * Math.PI * hour) / 24),
      tickModulo: Object.fromEntries([2, 3, 5, 7, 10, 12, 20].map((period) => [String(period), sample.length % period])),
    },
    regime,
    featureNames,
    vector,
  };
}

export { getLastDigit as extractDigit } from '@/lib/digit-stats';
