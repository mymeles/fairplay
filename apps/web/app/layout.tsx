import type { ReactNode } from 'react';

export const metadata = {
  title: 'FairPlay Party DJ',
  description: 'Host-controlled, guest-influenced party music queue.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
          background: '#0d0d12',
          color: '#f5f5f7',
          minHeight: '100vh',
        }}
      >
        {children}
      </body>
    </html>
  );
}
