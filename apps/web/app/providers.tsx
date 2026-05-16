'use client';

import type { ReactNode } from 'react';
import { QueryProvider } from '@/lib/query/QueryProvider';
import { Toaster } from '@/components/ui/toaster';

export const AppProviders = ({ children }: { children: ReactNode }) => (
  <QueryProvider>
    {children}
    <Toaster />
  </QueryProvider>
);
