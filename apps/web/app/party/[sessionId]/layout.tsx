'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Home, Loader2, ListMusic, LogOut, Search, Sparkles, WalletCards } from 'lucide-react';
import { useGuestAuth } from '@/lib/auth/hooks';
import { PartySocketProvider } from '@/lib/realtime/PartySocketProvider';
import { getGuestWallet } from '@/lib/api/endpoints';
import { qk } from '@/lib/query/keys';
import { Button } from '@/components/ui/button';
import { TokenBalance } from '@/components/domain/token-balance';
import { ConnectionPill } from '@/components/domain/connection-pill';
import { cn } from '@/lib/utils';

interface PartyLayoutProps {
  children: React.ReactNode;
  params: { sessionId: string };
}

const bottomNav = [
  { href: '', icon: Home, label: 'Home' },
  { href: 'search', icon: Search, label: 'Search' },
  { href: 'queue', icon: ListMusic, label: 'Queue' },
  { href: 'wallet', icon: WalletCards, label: 'Tokens' },
];

export default function PartyLayout({ children, params }: PartyLayoutProps) {
  const sessionId = params.sessionId;
  const { token, meta, ready, clear } = useGuestAuth(sessionId);
  const router = useRouter();
  const pathname = usePathname() ?? '';

  useEffect(() => {
    if (ready && !token && typeof window !== 'undefined') {
      window.location.replace(`/join?code=`);
    }
  }, [ready, token]);

  const wallet = useQuery({
    queryKey: qk.wallet(sessionId),
    queryFn: () => getGuestWallet(sessionId),
    enabled: ready && !!token,
    refetchInterval: 60_000,
  });

  if (!ready || !token) {
    return (
      <main className="flex min-h-screen items-center justify-center text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }

  const leave = () => {
    clear();
    router.replace('/');
  };

  return (
    <PartySocketProvider token={token} sessionId={sessionId} role="guest">
      <div className="flex min-h-[100dvh] flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-xs uppercase tracking-[0.3em] text-ink-muted">
                <Sparkles className="mr-1 inline h-3 w-3 text-accent-pink" /> FairPlay
              </span>
              <span className="truncate text-sm text-ink">{meta?.displayName ?? 'Guest'}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <TokenBalance wallet={wallet.data ?? null} compact />
              <ConnectionPill />
              <Button size="icon" variant="ghost" aria-label="Leave party" onClick={leave}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4 sm:pb-10">{children}</main>

        <nav
          className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-3xl items-stretch border-t border-border bg-background/95 backdrop-blur sm:hidden"
          aria-label="Primary"
        >
          {bottomNav.map((item) => {
            const href = item.href
              ? `/party/${sessionId}/${item.href}`
              : `/party/${sessionId}`;
            const active = item.href
              ? pathname.endsWith(`/${item.href}`)
              : pathname === `/party/${sessionId}`;
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={href}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium',
                  active ? 'text-ink' : 'text-ink-subtle',
                )}
              >
                <span
                  className={cn(
                    'rounded-full p-2',
                    active && 'bg-gradient-party text-white',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </PartySocketProvider>
  );
}
