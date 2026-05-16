'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHostAuth } from '@/lib/auth/hooks';

const CompleteInner = () => {
  const router = useRouter();
  const params = useSearchParams();
  const { setHost } = useHostAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get('token');
    const userId = params.get('user_id');
    const err = params.get('error');
    if (err) {
      setError(err);
      return;
    }
    if (!token || !userId) {
      setError('Missing token or user_id in callback URL.');
      return;
    }
    setHost(token, userId);
    router.replace('/host/sessions/new');
  }, [params, router, setHost]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{error ? 'Login failed' : 'Finishing Spotify login…'}</CardTitle>
        <CardDescription>
          {error
            ? error
            : 'Hold tight — confirming your Spotify connection.'}
        </CardDescription>
      </CardHeader>
      {error ? (
        <CardContent>
          <Button onClick={() => router.replace('/host/login')}>Try again</Button>
        </CardContent>
      ) : null}
    </Card>
  );
};

export default function HostAuthCompletePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
        <CompleteInner />
      </Suspense>
    </main>
  );
}
