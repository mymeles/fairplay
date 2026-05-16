'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Music, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHostAuth } from '@/lib/auth/hooks';
import { spotifyLoginJson } from '@/lib/api/endpoints';
import { toast } from '@/components/ui/toaster';

export default function HostLoginPage() {
  const { token, ready } = useHostAuth();
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (token && typeof window !== 'undefined') {
      window.location.replace('/host/sessions/new');
    }
  }, [ready, token]);

  const beginLogin = async () => {
    setLoading(true);
    try {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : '';
      const result = await spotifyLoginJson(`${origin}/host/auth/complete`);
      setAuthorizeUrl(result.authorizeUrl);
      window.location.assign(result.authorizeUrl);
    } catch (err) {
      console.error(err);
      toast({
        title: 'Could not start Spotify login',
        description: err instanceof Error ? err.message : 'Try again in a moment.',
        tone: 'danger',
      });
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <Link href="/" className="text-xs uppercase tracking-[0.3em] text-ink-muted hover:text-ink">
        ← FairPlay
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Connect your Spotify</CardTitle>
          <CardDescription>
            Hosts power the queue with their own Spotify Premium. Guests can&apos;t
            change playback unless you let them.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button onClick={beginLogin} disabled={loading} size="lg">
            <Music className="h-5 w-5" />
            {loading ? 'Redirecting…' : 'Connect Spotify'}
          </Button>
          {authorizeUrl ? (
            <a
              href={authorizeUrl}
              className="inline-flex items-center gap-1 text-xs text-accent-pink underline-offset-4 hover:underline"
            >
              Not redirecting? Open Spotify <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          <div className="grid gap-2 text-sm text-ink-muted">
            <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-raised/60 p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-success" aria-hidden />
              <div>
                <div className="font-semibold text-ink">Premium required</div>
                <div>
                  We use Spotify&apos;s Add-to-Queue API, which only works for
                  Premium accounts.
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
