import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppProviders } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FairPlay DJ — vote the vibe',
  description: 'Host-controlled, guest-influenced Spotify party queue.',
  openGraph: {
    title: 'FairPlay DJ',
    description: 'Drop tracks. Vote vibes. Keep it fair.',
  },
};

export const viewport: Viewport = {
  themeColor: '#09090B',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} dark`}>
      <body className="min-h-screen">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
