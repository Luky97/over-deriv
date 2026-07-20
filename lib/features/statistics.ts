export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
}

export function standardDeviation(values: readonly number[]): number {
  return Math.sqrt(variance(values));
}

export function shannonEntropy(counts: readonly number[]): number {
  const total = counts.reduce((sum, count) => sum + Math.max(0, count), 0);
  if (total === 0) return 0;
  return counts.reduce((entropy, count) => {
    if (count <= 0) return entropy;
    const probability = count / total;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

export function chiSquareUniform(counts: readonly number[]): number {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0 || counts.length === 0) return 0;
  const expected = total / counts.length;
  return counts.reduce((sum, count) => sum + ((count - expected) ** 2) / expected, 0);
}

function normalizeDistribution(values: readonly number[]): number[] {
  const safe = values.map((value) => Math.max(0, value));
  const total = safe.reduce((sum, value) => sum + value, 0);
  if (total === 0) return safe.map(() => 0);
  return safe.map((value) => value / total);
}

function klDivergence(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, probability, index) => {
    const comparison = right[index] ?? 0;
    if (probability <= 0 || comparison <= 0) return sum;
    return sum + probability * Math.log2(probability / comparison);
  }, 0);
}

export function jensenShannonDivergence(left: readonly number[], right: readonly number[]): number {
  const p = normalizeDistribution(left);
  const q = normalizeDistribution(right);
  const length = Math.max(p.length, q.length);
  const paddedP = Array.from({ length }, (_, index) => p[index] ?? 0);
  const paddedQ = Array.from({ length }, (_, index) => q[index] ?? 0);
  const middle = paddedP.map((value, index) => (value + paddedQ[index]) / 2);
  return clamp((klDivergence(paddedP, middle) + klDivergence(paddedQ, middle)) / 2);
}

export function currentRun(values: readonly boolean[]): number {
  if (values.length === 0) return 0;
  const current = values[values.length - 1];
  let length = 0;
  for (let index = values.length - 1; index >= 0 && values[index] === current; index -= 1) length += 1;
  return length;
}

export function maximumRun(values: readonly boolean[]): number {
  let maximum = 0;
  let length = 0;
  let previous: boolean | undefined;
  for (const value of values) {
    length = value === previous ? length + 1 : 1;
    maximum = Math.max(maximum, length);
    previous = value;
  }
  return maximum;
}

export function autocorrelation(values: readonly number[], lag: number): number {
  if (lag <= 0 || values.length <= lag + 2) return 0;
  const left = values.slice(lag);
  const right = values.slice(0, -lag);
  const leftMean = mean(left);
  const rightMean = mean(right);
  let numerator = 0;
  let leftPower = 0;
  let rightPower = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] - leftMean;
    const b = right[index] - rightMean;
    numerator += a * b;
    leftPower += a * a;
    rightPower += b * b;
  }
  const denominator = Math.sqrt(leftPower * rightPower);
  return denominator === 0 ? 0 : clamp(numerator / denominator, -1, 1);
}

export function transitionProbabilities(values: readonly number[], states: number): number[][] {
  const counts = Array.from({ length: states }, () => Array<number>(states).fill(0));
  for (let index = 1; index < values.length; index += 1) {
    const from = values[index - 1];
    const to = values[index];
    if (from >= 0 && from < states && to >= 0 && to < states) counts[from][to] += 1;
  }
  return counts.map((row) => {
    const total = row.reduce((sum, count) => sum + count, 0);
    return row.map((count) => (count + 0.5) / (total + states * 0.5));
  });
}

export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * sorted.length)))];
}
