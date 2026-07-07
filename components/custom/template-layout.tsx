import { Providers } from './providers';
import { Toaster } from '@/components/ui/sonner';

/** Theme and notification providers shared by static routes. */
export function TemplateLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      {children}
      <Toaster />
    </Providers>
  );
}
