import type { Metadata } from 'next';
import '@/app/globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Adaptive Digit Research Lab',
  description: 'Public Deriv tick research and virtual-contract forward testing. No real trading.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
