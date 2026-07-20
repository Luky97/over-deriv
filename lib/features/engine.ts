export interface MarketFeatures {
  windows: Record<number, WindowFeatures>;
  entropy: number;
  parityStreak: number;
  recentDirection: 'UP' | 'DOWN' | 'FLAT';
  directionStreak: number;
  regime: string;
}

export interface WindowFeatures {
  size: number;
  evenPercent: number;
  oddPercent: number;
  over3Percent: number;
  under7Percent: number;
  mostFrequent: number[];
  leastFrequent: number[];
  frequencies: Record<number, number>;
}

export function extractDigit(quote: number, pipSize: number): number {
  return parseInt(quote.toFixed(pipSize).slice(-1), 10);
}

export function calculateWindowFeatures(quotes: number[], pipSize: number): WindowFeatures {
  const digits = quotes.map(q => extractDigit(q, pipSize));
  const size = digits.length;
  if (size === 0) {
    return {
      size: 0, evenPercent: 0, oddPercent: 0, over3Percent: 0, under7Percent: 0,
      mostFrequent: [], leastFrequent: [], frequencies: {}
    };
  }

  const counts: Record<number, number> = {};
  let evenCount = 0;
  let over3Count = 0;
  let under7Count = 0;

  for (let i = 0; i <= 9; i++) counts[i] = 0;

  for (const d of digits) {
    counts[d]++;
    if (d % 2 === 0) evenCount++;
    if (d > 3) over3Count++;
    if (d < 7) under7Count++;
  }

  const freqs = Object.entries(counts).map(([digit, count]) => ({ digit: parseInt(digit, 10), count }));
  freqs.sort((a, b) => b.count - a.count);

  const maxCount = freqs[0].count;
  const minCount = freqs[9].count;

  const mostFrequent = freqs.filter(f => f.count === maxCount).map(f => f.digit);
  const leastFrequent = freqs.filter(f => f.count === minCount).map(f => f.digit);

  return {
    size,
    evenPercent: (evenCount / size) * 100,
    oddPercent: ((size - evenCount) / size) * 100,
    over3Percent: (over3Count / size) * 100,
    under7Percent: (under7Count / size) * 100,
    mostFrequent,
    leastFrequent,
    frequencies: counts
  };
}

export function buildFeatureSnapshot(quotes: number[], pipSize: number): MarketFeatures {
  const windows = [20, 50, 100, 250, 500, 1000];
  const windowFeatures: Record<number, WindowFeatures> = {};

  for (const w of windows) {
    const slice = quotes.slice(-w);
    windowFeatures[w] = calculateWindowFeatures(slice, pipSize);
  }

  // Calculate streaks
  const digits = quotes.map(q => extractDigit(q, pipSize));
  let parityStreak = 0;
  if (digits.length > 0) {
    const isEven = digits[digits.length - 1] % 2 === 0;
    for (let i = digits.length - 1; i >= 0; i--) {
      if ((digits[i] % 2 === 0) === isEven) parityStreak++;
      else break;
    }
  }

  let recentDirection: 'UP' | 'DOWN' | 'FLAT' = 'FLAT';
  let directionStreak = 0;
  if (quotes.length >= 2) {
    const last = quotes[quotes.length - 1];
    const prev = quotes[quotes.length - 2];
    recentDirection = last > prev ? 'UP' : last < prev ? 'DOWN' : 'FLAT';
    
    for (let i = quotes.length - 1; i >= 1; i--) {
      const currDir = quotes[i] > quotes[i - 1] ? 'UP' : quotes[i] < quotes[i - 1] ? 'DOWN' : 'FLAT';
      if (currDir === recentDirection) directionStreak++;
      else break;
    }
  }

  // Entropy estimation (Shannon)
  let entropy = 0;
  if (digits.length > 0) {
    const f1000 = windowFeatures[1000]?.frequencies || windowFeatures[digits.length]?.frequencies;
    if (f1000) {
      for (let i = 0; i <= 9; i++) {
        const p = f1000[i] / digits.length;
        if (p > 0) entropy -= p * Math.log2(p);
      }
    }
  }

  return {
    windows: windowFeatures,
    entropy,
    parityStreak,
    recentDirection,
    directionStreak,
    regime: 'UNKNOWN' // computed separately
  };
}
