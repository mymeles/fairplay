'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { createSession } from '@/lib/api/endpoints';
import { useHostAuth } from '@/lib/auth/hooks';
import { toast } from '@/components/ui/toaster';
import type { SessionSummary } from '@fairplay/shared-types';

interface FormValues {
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
  lockSize: 2,
  lockDurationSeconds: 90,
  spotifyQueueDepthTarget: 1,
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

  useEffect(() => {
    if (ready && !token && typeof window !== 'undefined') {
      window.location.replace('/host/login');
    }
  }, [ready, token]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults });

  const allowExplicit = watch('allowExplicitTracks');
  const proximityRequired = watch('proximityRequired');

  const onSubmit = handleSubmit(async (values) => {
    try {
      const session: SessionSummary = await createSession({
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
      });
      toast({
        title: 'Party created',
        description: `Join code ${session.joinCode}`,
        tone: 'success',
      });
      router.push(`/host/sessions/${session.id}/qr`);
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
          You can change these later from the session settings.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
                min={0}
                max={5}
                {...register('spotifyQueueDepthTarget')}
              />
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
