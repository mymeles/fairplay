'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  AudioLines,
  LayoutDashboard,
  Loader2,
  LogOut,
  QrCode,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useHostAuth } from '@/lib/auth/hooks';
import { ApiError } from '@/lib/api/client';
import { getSession, hostLogout } from '@/lib/api/endpoints';
import { qk } from '@/lib/query/keys';
import { PartySocketProvider } from '@/lib/realtime/PartySocketProvider';
import { ConnectionPill } from '@/components/domain/connection-pill';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { rememberHostSession } from '@/lib/session/recent-host-sessions';

interface HostSessionLayoutProps {
  children: React.ReactNode;
  params: { sessionId: string };
}

const navItems = [
  { href: 'qr', label: 'QR', icon: QrCode },
  { href: 'devices', label: 'Devices', icon: AudioLines },
  { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: 'settings', label: 'Settings', icon: Settings },
  { href: 'moderation', label: 'Moderation', icon: ShieldAlert },
];

export default function HostSessionLayout({ children, params }: HostSessionLayoutProps) {
  const { sessionId } = params;
  const { token, ready, clear } = useHostAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '';

  useEffect(() => {
    if (ready && !token && typeof window !== 'undefined') {
      window.location.replace('/host/login');
    }
  }, [ready, token]);

  const sessionQuery = useQuery({
    queryKey: qk.session(sessionId),
    queryFn: () => getSession(sessionId),
    enabled: ready && !!token,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (sessionQuery.data) {
      rememberHostSession(sessionQuery.data);
    }
  }, [sessionQuery.data]);

  if (!ready || !token) {
    return (
      <main className="flex min-h-screen items-center justify-center text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }

  const logout = async () => {
    try {
      await hostLogout();
    } catch {
      /* ignore — clear locally regardless */
    }
    clear();
    router.replace('/host/login');
  };

  const session = sessionQuery.data;
  const sessionError = sessionQuery.error;
  const recoveryMessage =
    sessionError instanceof ApiError && sessionError.code === 'UNAUTHORIZED'
      ? 'Your host login expired. Reconnect Spotify to resume parties saved in this browser.'
      : sessionError instanceof ApiError && sessionError.code === 'SESSION_EXPIRED'
        ? 'This party has expired. Create a new session to keep hosting.'
        : null;

  return (
    <PartySocketProvider token={token} sessionId={sessionId} role="host">
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
            <Link
              href="/"
              className="font-mono text-xs uppercase tracking-[0.3em] text-ink-muted hover:text-ink"
            >
              FairPlay
            </Link>
            {session ? (
              <span className="hidden text-xs text-ink-subtle sm:inline">
                · code <strong className="text-ink">{session.joinCode}</strong>
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <ConnectionPill />
              <Button size="sm" variant="ghost" onClick={logout}>
                <LogOut className="h-4 w-4" /> Logout
              </Button>
            </div>
          </div>
          <nav className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-2 pb-2 sm:px-4">
            {navItems.map((item) => {
              const href = `/host/sessions/${sessionId}/${item.href}`;
              const active = pathname.endsWith(`/${item.href}`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-gradient-party text-white shadow-md shadow-accent-purple/30'
                      : 'text-ink-muted hover:bg-surface-raised hover:text-ink',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
          {recoveryMessage ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-ink">
              <span>{recoveryMessage}</span>
              <Button asChild size="sm" variant="secondary">
                <Link href="/host/login">Reconnect</Link>
              </Button>
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </PartySocketProvider>
  );
}
