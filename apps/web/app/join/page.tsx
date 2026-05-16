'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Loader2, MapPin, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { joinSession, lookupSessionByCode } from '@/lib/api/endpoints';
import { guestTokenStore } from '@/lib/auth/token-store';
import { toast } from '@/components/ui/toaster';

const JoinInner = () => {
  const params = useSearchParams();
  const router = useRouter();

  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [qrToken, setQrToken] = useState(params.get('qrToken') ?? '');
  const [displayName, setDisplayName] = useState('');
  const [shareLocation, setShareLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const c = params.get('code');
    const q = params.get('qrToken');
    if (c) setCode(c.toUpperCase());
    if (q) setQrToken(q);
  }, [params]);

  const requestLocation = (): Promise<
    { lat: number; lng: number; accuracyMeters: number } | undefined
  > =>
    new Promise((resolve) => {
      if (!shareLocation || typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(undefined);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyMeters: Math.min(pos.coords.accuracy ?? 100, 5_000),
          }),
        () => resolve(undefined),
        { enableHighAccuracy: false, timeout: 5_000, maximumAge: 30_000 },
      );
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast({ title: 'Pick a display name first', tone: 'warning' });
      return;
    }
    if (!code.trim() && !qrToken.trim()) {
      toast({ title: 'Enter a code or scan the QR', tone: 'warning' });
      return;
    }
    setSubmitting(true);
    try {
      const session = await lookupSessionByCode(code.trim().toUpperCase());
      const location = await requestLocation();
      const join = await joinSession(session.id, {
        displayName: displayName.trim(),
        joinCode: code.trim().toUpperCase() || undefined,
        qrToken: qrToken.trim() || undefined,
        deviceHash: getOrCreateDeviceHash(),
        ...(location ? { location } : {}),
      });
      guestTokenStore.write(join.sessionId, join.token, {
        guestId: join.guest.id,
        sessionId: join.sessionId,
        displayName: join.guest.displayName,
      });
      router.push(`/party/${join.sessionId}`);
    } catch (err) {
      toast({
        title: 'Could not join the party',
        description: err instanceof Error ? err.message : 'Try again.',
        tone: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Join the party</CardTitle>
        <CardDescription>Scan the QR or enter the code on the screen.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Party code</Label>
            <div className="flex items-center gap-2">
              <Input
                id="code"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD12"
                className="font-mono uppercase tracking-[0.4em]"
                maxLength={16}
              />
              <Button asChild type="button" size="icon" variant="secondary" aria-label="Scan QR">
                <Link href="/join#qr">
                  <QrCode className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName">Your name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="What guests will see"
              maxLength={40}
              autoComplete="given-name"
            />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-raised px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <MapPin className="h-4 w-4 text-accent-cyan" />
                Share location
              </div>
              <p className="text-xs text-ink-muted">
                Only used if the host requires proximity. Nothing is stored.
              </p>
            </div>
            <Switch
              checked={shareLocation}
              onCheckedChange={setShareLocation}
              aria-label="Share location"
            />
          </label>

          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Step into the queue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

const DEVICE_HASH_KEY = 'fairplay.deviceHash';

const getOrCreateDeviceHash = (): string => {
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(DEVICE_HASH_KEY);
  if (existing) return existing;
  const random = window.crypto.getRandomValues(new Uint8Array(32));
  const hash = Array.from(random)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  window.localStorage.setItem(DEVICE_HASH_KEY, hash);
  return hash;
};

export default function JoinPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense
        fallback={
          <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
        }
      >
        <JoinInner />
      </Suspense>
    </main>
  );
}
