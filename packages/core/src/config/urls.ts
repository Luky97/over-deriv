type DerivEnv = 'production' | 'preview';

function getEnv(): DerivEnv {
  if (typeof globalThis !== 'undefined' && typeof process !== 'undefined') {
    const env = process.env.NEXT_PUBLIC_DERIV_ENV;
    if (env === 'preview') return 'preview';
  }
  return 'production';
}

const URLS = {
  production: {
    publicWs: 'wss://api.derivws.com/trading/v1/options/ws/public',
  },
  preview: {
    publicWs: 'wss://staging-api.derivws.com/trading/v1/options/ws/public',
  },
} as const;

export function getPublicWsUrl(): string {
  return URLS[getEnv()].publicWs;
}
