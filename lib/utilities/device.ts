const DEVICE_ID_KEY = 'adaptiv_research_device_id';

function generateDeviceId(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return 'dev_' + Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
    const id = generateDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return generateDeviceId();
  }
}
