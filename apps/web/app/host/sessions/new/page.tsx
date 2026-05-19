'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { CheckCircle2, Loader2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { createSession } from '@/lib/api/endpoints';
import { useHostAuth } from '@/lib/auth/hooks';
import { toast } from '@/components/ui/toaster';
import {
  readRecentHostSessions,
  rememberHostSession,
  type RecentHostSession,
} from '@/lib/session/recent-host-sessions';

interface FormValues {
  name: string;
  lockSize: number;
  lockDurationSeconds: number;
  spotifyQueueDepthTarget: number;
  initialBoostTokens: number;
  initialChallengeTokens: number;
  duplicateCooldownSeconds: number;
  maxSuggestionsPerGuest: number;
  allowExplicitTracks: boolean;
  proximityRequired: boolean;
}

const defaults: FormValues = {
  name: '',
  lockSize: 2,
  lockDurationSeconds: 90,
  spotifyQueueDepthTarget: 3,
  initialBoostTokens: 3,
  initialChallengeTokens: 1,
  duplicateCooldownSeconds: 900,
  maxSuggestionsPerGuest: 10,
  allowExplicitTracks: true,
  proximityRequired: false,
};

export default function NewSessionPage() {
  const router = useRouter();
  const { token, ready } = useHostAuth();
  const [recentSessions, setRecentSessions] = useState<RecentHostSession[]>([]);
  const [mode, setMode] = useState<'recommended' | 'custom'>('recommended');

  useEffect(() => {
    if (ready && !token && typeof window !== 'undefined') {
      window.location.replace('/host/login');
    }
  }, [ready, token]);

  useEffect(() => {
    setRecentSessions(readRecentHostSessions());
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults });

  const queueDepth = watch('spotifyQueueDepthTarget');
  const allowExplicit = watch('allowExplicitTracks');
  const proximityRequired = watch('proximityRequired');

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await createSession({
        name: values.name.trim() || undefined,
        ...(mode === 'custom'
          ? {
              settings: {
                lockSize: Number(values.lockSize),
                lockDurationSeconds: Number(values.lockDurationSeconds),
                spotifyQueueDepthTarget: Number(values.spotifyQueueDepthTarget),
                initialBoostTokens: Number(values.initialBoostTokens),
                initialChallengeTokens: Number(values.initialChallengeTokens),
                duplicateCooldownSeconds: Number(values.duplicateCooldownSeconds),
                maxSuggestionsPerGuest: Number(values.maxSuggestionsPerGuest),
                allowExplicitTracks: values.allowExplicitTracks,
                proximityRequired: values.proximityRequired,
              },
            }
          : {}),
      });
      toast({
        title: 'Party created',
        description: `Join code ${result.joinCode}`,
        tone: 'success',
      });
      rememberHostSession(result.session);
      router.push(`/host/sessions/${result.session.id}/qr`);
    } catch (err) {
      toast({
        title: 'Could not create session',
        description: err instanceof Error ? err.message : 'Try again',
        tone: 'danger',
      });
    }
  });

  if (!ready || !token) {
    return (
      <main className="flex min-h-screen items-center justify-center text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.3em] text-ink-muted">Step 1 of 3</span>
        <h1 className="text-3xl font-bold">Configure your party</h1>
        <p className="text-sm text-ink-muted">
          Sessions are saved for 24 hours. Use a recent session when you are resuming the same party.
        </p>
      </header>

      {recentSessions.length ? (
        <section className="grid gap-2" aria-label="Recent sessions">
          {recentSessions.map((session) => (
            <div
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3"
            >
              <div>
                <div className="text-sm font-semibold text-ink">
                  Continue {session.name ?? `code ${session.joinCode}`}
                </div>
                <div className="text-xs text-ink-muted">
                  {session.status.toLowerCase()} · expires {formatExpiry(session.expiresAt)}
                </div>
              </div>
              <Button asChild size="sm" variant="secondary">
                <Link href={`/host/sessions/${session.id}/dashboard`}>Resume</Link>
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Party name</CardTitle>
            <CardDescription>Shown to hosts and guests so sessions are easier to resume.</CardDescription>
          </CardHeader>
          <CardContent>
            <Field label="Name">
              <Input
                maxLength={80}
                placeholder="Friday house party"
                {...register('name')}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Start mode</CardTitle>
            <CardDescription>Use the party-safe default or tune every rule.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode('recommended')}
              className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                mode === 'recommended'
                  ? 'border-accent-cyan bg-accent-cyan/10 text-ink'
                  : 'border-border bg-surface-raised text-ink-muted hover:text-ink'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4" /> Recommended
              </span>
              <span className="mt-1 block text-xs">
                2 locked tracks, 90s lock window, Spotify queue depth 3, explicit tracks allowed.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode('custom')}
              className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                mode === 'custom'
                  ? 'border-accent-pink bg-accent-pink/10 text-ink'
                  : 'border-border bg-surface-raised text-ink-muted hover:text-ink'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <SlidersHorizontal className="h-4 w-4" /> Configure
              </span>
              <span className="mt-1 block text-xs">
                Change lock, token, explicit track, proximity, and anti-spam rules before launch.
              </span>
            </button>
          </CardContent>
        </Card>

        {mode === 'custom' ? (
          <>
        <Card>
          <CardHeader>
            <CardTitle>Queue & lock window</CardTitle>
            <CardDescription>How many tracks are locked in at once.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Lock size" hint="Max locked tracks">
              <Input type="number" min={1} max={10} {...register('lockSize')} />
            </Field>
            <Field label="Lock duration (s)" hint="How long a track stays locked">
              <Input type="number" min={15} max={600} {...register('lockDurationSeconds')} />
            </Field>
            <Field label="Spotify queue depth">
              <Input
                type="number"
                min={1}
                max={5}
                {...register('spotifyQueueDepthTarget')}
              />
              <span className="text-xs text-ink-subtle">
                Songs kept ahead in Spotify. 2-3 is smoother for real parties.
              </span>
              {Number(queueDepth) === 1 ? (
                <span className="text-xs text-warning">
                  Depth 1 keeps one upcoming song ready. Use 2-3 if guests are slow to add tracks.
                </span>
              ) : null}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tokens</CardTitle>
            <CardDescription>
              Guests start with this many boost & challenge tokens.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Initial boost tokens">
              <Input type="number" min={0} max={50} {...register('initialBoostTokens')} />
            </Field>
            <Field label="Initial challenge tokens">
              <Input type="number" min={0} max={50} {...register('initialChallengeTokens')} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rules</CardTitle>
            <CardDescription>Spam guards and content filters.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Duplicate cooldown (s)">
                <Input
                  type="number"
                  min={0}
                  max={86400}
                  {...register('duplicateCooldownSeconds')}
                />
              </Field>
              <Field label="Max suggestions per guest">
                <Input
                  type="number"
                  min={1}
                  max={200}
                  {...register('maxSuggestionsPerGuest')}
                />
              </Field>
            </div>
            <ToggleRow
              label="Allow explicit tracks"
              hint="Off = filter results and reject explicit adds."
              checked={allowExplicit}
              onChange={(v) => setValue('allowExplicitTracks', v)}
            />
            <ToggleRow
              label="Require proximity"
              hint="Guests must be near the venue (needs GPS or Wi-Fi setup)."
              checked={proximityRequired}
              onChange={(v) => setValue('proximityRequired', v)}
            />
          </CardContent>
        </Card>
          </>
        ) : null}

        <CardFooter className="rounded-2xl border border-border bg-surface px-5 py-4">
          <Button type="submit" disabled={isSubmitting} className="ml-auto">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create party
          </Button>
        </CardFooter>
      </form>
    </main>
  );
}

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label>{label}</Label>
    {children}
    {hint ? <span className="text-xs text-ink-subtle">{hint}</span> : null}
  </div>
);

const formatExpiry = (expiresAt: string): string => {
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires)) return 'soon';
  const minutes = Math.max(0, Math.round((expires - Date.now()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const ToggleRow = ({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-raised px-3 py-2">
    <div>
      <div className="text-sm font-medium text-ink">{label}</div>
      {hint ? <div className="text-xs text-ink-muted">{hint}</div> : null}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </label>
);
