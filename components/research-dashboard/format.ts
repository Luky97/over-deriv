export function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function displayTarget(target: string): string {
  return target.replace('_', ' ');
}

export function displayEnum(value: string): string {
  return value.replaceAll('_', ' ');
}

export function serverTime(epoch: number): string {
  return new Date(epoch * 1000).toISOString().slice(11, 19);
}

export function rate(wins: number, total: number): string {
  return total === 0 ? '—' : `${((wins / total) * 100).toFixed(1)}%`;
}
