'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Loader2, Maximize2, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api/client';
import { getSession } from '@/lib/api/endpoints';
import { qk } from '@/lib/query/keys';
import { usePartySocket } from '@/lib/realtime/PartySocketProvider';
import { toast } from '@/components/ui/toaster';

export default function HostQrPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const { subscribe } = usePartySocket();
  const [guestCount, setGuestCount] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const sessionQuery = useQuery({
    queryKey: qk.session(sessionId),
    queryFn: () => getSession(sessionId),
  });

  useEffect(() => {
    return subscribe('guest.joined', () => {
      setGuestCount((c) => c + 1);
    });
  }, [subscribe]);

  const joinUrl = useMemo(() => {
    if (!sessionQuery.data || typeof window === 'undefined') return '';
    return `${window.location.origin}/join?code=${sessionQuery.data.joinCode}`;
  }, [sessionQuery.data]);

  const copy = async () => {
    if (!joinUrl) return;
    await navigator.clipboard.writeText(joinUrl);
    toast({ title: 'Copied join link', tone: 'success' });
  };

  if (sessionQuery.isLoading) {
    return (
      <p className="text-ink-muted">
        <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading session…
      </p>
    );
  }
  if (sessionQuery.isError || !sessionQuery.data) {
    const err = sessionQuery.error;
    const code = err instanceof ApiError ? err.code : 'UNKNOWN';
    const message = err instanceof Error ? err.message : 'Could not load session.';
    return (
      <Card>
        <CardHeader>
          <CardTitle>Could not load this session</CardTitle>
          <CardDescription>
            {code} — {message}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={() => sessionQuery.refetch()}>Retry</Button>
          <Button asChild variant="secondary">
            <Link href="/host/sessions/new">Create a new session</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const session = sessionQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Scan to join</h1>
          <p className="text-sm text-ink-muted">Project this on the big screen.</p>
        </div>
        <Button variant="secondary" onClick={() => setFullscreen((v) => !v)}>
          <Maximize2 className="h-4 w-4" /> {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </Button>
      </header>

      <Card
        className={
          fullscreen
            ? 'fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 rounded-none p-8'
            : ''
        }
      >
        <CardHeader className={fullscreen ? 'text-center' : ''}>
          <CardTitle className={fullscreen ? 'text-4xl' : 'text-xl'}>FairPlay party</CardTitle>
          <CardDescription className={fullscreen ? 'text-lg' : ''}>
            Scan the QR or type the code at <span className="font-mono">/join</span>
          </CardDescription>
        </CardHeader>
        <CardContent
          className={
            fullscreen
              ? 'flex flex-col items-center gap-6'
              : 'flex flex-col items-center gap-4'
          }
        >
          <div className={fullscreen ? 'rounded-3xl bg-white p-6' : 'rounded-2xl bg-white p-4'}>
            <QRCodeSVG
              value={joinUrl}
              size={fullscreen ? 480 : 240}
              bgColor="#FFFFFF"
              fgColor="#09090B"
              level="M"
            />
          </div>
          <div
            className={
              fullscreen
                ? 'flex flex-col items-center gap-2 text-center'
                : 'flex flex-col items-center gap-2 text-center'
            }
          >
            <div
              className={
                fullscreen
                  ? 'font-mono text-7xl font-black tracking-widest text-gradient'
                  : 'font-mono text-4xl font-black tracking-widest text-gradient'
              }
            >
              {session.joinCode}
            </div>
            <Button size="sm" variant="ghost" onClick={copy}>
              <Copy className="h-3 w-3" /> Copy link
            </Button>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1 text-sm text-ink-muted">
            <Users className="h-4 w-4 text-accent-pink" /> {guestCount} new joins this session
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
