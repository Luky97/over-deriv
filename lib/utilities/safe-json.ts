export function detectCircular(obj: unknown): string | null {
  const visited = new WeakSet<object>();
  function walk(value: unknown, path: string): string | null {
    if (typeof value === 'object' && value !== null) {
      if (visited.has(value as object)) return path;
      visited.add(value as object);
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const result = walk(value[i], `${path}[${i}]`);
          if (result) return result;
        }
      } else {
        for (const key of Object.keys(value as Record<string, unknown>)) {
          const result = walk((value as Record<string, unknown>)[key], `${path}.${key}`);
          if (result) return result;
        }
      }
    }
    return null;
  }
  return walk(obj, 'root');
}

export function safeJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'undefined') return undefined;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    return value;
  }
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return Array.from(value);
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as number[]);
  if (value instanceof Error) return { name: value.name, message: value.message };
  return value;
}

export function safeJsonStringify(obj: unknown, space?: number): string {
  const circular = detectCircular(obj);
  if (circular) throw new Error(`Circular reference at ${circular}`);
  return JSON.stringify(obj, safeJsonReplacer, space);
}

export function measureJsonBytes(obj: unknown): number {
  return new TextEncoder().encode(safeJsonStringify(obj)).length;
}
