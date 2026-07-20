import type { Metadata } from 'next';
import { buildFaviconUri } from '@/lib/build-favicon-uri';
import { getLogoSrc } from '@/lib/get-logo-src';
import { inter, FONT_CLASS_MAP } from '@/lib/fonts';
import { TemplateLayout } from '@/components/custom/template-layout';
import { LogoSrcProvider } from '@/components/custom/logo-src-provider';
import '@/app/globals.css';
import './globals.css';
import './custom.css';

export function generateMetadata(): Metadata {
  const faviconUri = buildFaviconUri();
  return {
    title: process.env.NEXT_PUBLIC_DERIV_APP_NAME || 'Deriv Multi-Symbol Digit Analyzer',
    description: 'Public multi-market live-tick digit movement analysis for Deriv markets',
    ...(faviconUri ? { icons: { icon: faviconUri } } : {}),
  };
}

const fontClass =
  FONT_CLASS_MAP[process.env.NEXT_PUBLIC_FONT_FAMILY ?? 'Inter'] ??
  inter.className;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const logoSrc = getLogoSrc();
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontClass} min-h-dvh overflow-x-hidden bg-background text-foreground`}
      >
        <TemplateLayout>
          <LogoSrcProvider logoSrc={logoSrc}>{children}</LogoSrcProvider>
        </TemplateLayout>
      </body>
    </html>
  );
}
