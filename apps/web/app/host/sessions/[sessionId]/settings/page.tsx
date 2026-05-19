'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Search, Trash2 } from 'lucide-react';
import type { TrackDto } from '@fairplay/shared-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ApiError } from '@/lib/api/client';
import {
  addFallbackTrack,
  getSession,
  hostSearchTracks,
  listFallbackTracks,
  patchSessionSettings,
  removeFallbackTrack,
} from '@/lib/api/endpoints';
import { qk } from '@/lib/query/keys';
import { toast } from '@/components/ui/toaster';
import { TrackResultCard } from '@/components/domain/track-result-card';
import { formatDuration } from '@/lib/utils';

interface FormValues {
  lockSize: number;
  lockDurationSeconds: number;
  spotifyQueueDepthTarget: number;
  duplicateCooldownSeconds: number;
  maxSuggestionsPerGuest: number;
  allowExplicitTracks: boolean;
  proximityRequired: boolean;
}

export default function HostSettingsPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const qc = useQueryClient();
  const [fallbackQuery, setFallbackQuery] = useState('');
  const debouncedFallbackQuery = useDebounced(fallbackQuery, 800).trim();

  const session = useQuery({
    queryKey: qk.session(sessionId),
    queryFn: () => getSession(sessionId),
  });

  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>();
  const queueDepth = watch('spotifyQueueDepthTarget');
  const allowExplicit = watch('allowExplicitTracks');
  const proximityRequired = watch('proximityRequired');

  const fallbackTracks = useQuery({
    queryKey: qk.fallbackTracks(sessionId),
    queryFn: () => listFallbackTracks(sessionId),
    enabled: !!session.data,
  });

  const fallbackSearch = useQuery({
    queryKey: qk.hostSearch(sessionId, debouncedFallbackQuery),
    queryFn: ({ signal }) => hostSearchTracks(sessionId, debouncedFallbackQuery, signal),
    enabled: debouncedFallbackQuery.length >= 3,
    retry: false,
  });

  useEffect(() => {
    if (session.data) {
      reset({
        lockSize: session.data.settings.lockSize,
        lockDurationSeconds: session.data.settings.lockDurationSeconds,
        spotifyQueueDepthTarget: session.data.settings.spotifyQueueDepthTarget,
        duplicateCooldownSeconds: session.data.settings.duplicateCooldownSeconds,
        maxSuggestionsPerGuest: session.data.settings.maxSuggestionsPerGuest,
        allowExplicitTracks: session.data.settings.allowExplicitTracks,
        proximityRequired: session.data.settings.proximityRequired,
      });
    }
  }, [session.data, reset]);

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      patchSessionSettings(sessionId, {
        lockSize: Number(values.lockSize),
        lockDurationSeconds: Number(values.lockDurationSeconds),
        spotifyQueueDepthTarget: Number(values.spotifyQueueDepthTarget),
        duplicateCooldownSeconds: Number(values.duplicateCooldownSeconds),
        maxSuggestionsPerGuest: Number(values.maxSuggestionsPerGuest),
        allowExplicitTracks: values.allowExplicitTracks,
        proximityRequired: values.proximityRequired,
      }),
    onSuccess: () => {
      toast({ title: 'Settings saved', tone: 'success' });
      qc.invalidateQueries({ queryKey: qk.session(sessionId) });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not save', description: err.message, tone: 'danger' }),
  });

  const addFallback = useMutation({
    mutationFn: (track: TrackDto) => addFallbackTrack(sessionId, track),
    onSuccess: () => {
      toast({ title: 'Fallback track added', tone: 'success' });
      qc.invalidateQueries({ queryKey: qk.fallbackTracks(sessionId) });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not add fallback track', description: err.message, tone: 'danger' }),
  });

  const removeFallback = useMutation({
    mutationFn: (fallbackTrackId: string) => removeFallbackTrack(sessionId, fallbackTrackId),
    onSuccess: () => {
      toast({ title: 'Fallback track removed', tone: 'success' });
      qc.invalidateQueries({ queryKey: qk.fallbackTracks(sessionId) });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not remove fallback track', description: err.message, tone: 'danger' }),
  });

  if (session.isLoading) {
    return (
      <p className="text-ink-muted">
        <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading settings…
      </p>
    );
  }
  if (session.isError || !session.data) {
    const err = session.error;
    const code = err instanceof ApiError ? err.code : 'UNKNOWN';
    const message = err instanceof Error ? err.message : 'Could not load session.';
    return (
      <Card>
        <CardHeader>
          <CardTitle>Could not load settings</CardTitle>
          <CardDescription>
            {code} — {message}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => session.refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>
        <p className="text-sm text-ink-muted">
          Tune the queue rules. Changes apply immediately.
        </p>
      </header>

      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Queue</CardTitle>
            <CardDescription>How tracks are locked and dispatched.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Lock size">
              <Input type="number" min={1} max={10} {...register('lockSize')} />
            </Field>
            <Field label="Lock duration (s)">
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
                Upcoming songs FairPlay keeps ready in Spotify. 3 is recommended for parties.
              </span>
              {Number(queueDepth) === 1 ? (
                <span className="text-xs text-warning">
                  Depth 1 is tight: FairPlay keeps one song ahead, but gaps can happen if the queue
                  runs empty.
                </span>
              ) : null}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anti-spam</CardTitle>
            <CardDescription>Limit dupes and per-guest spam.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Duplicate cooldown (s)">
              <Input
                type="number"
                min={0}
                max={86400}
                {...register('duplicateCooldownSeconds')}
              />
            </Field>
            <Field label="Max suggestions / guest">
              <Input
                type="number"
                min={1}
                max={200}
                {...register('maxSuggestionsPerGuest')}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Content & access</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ToggleRow
              label="Allow explicit tracks"
              hint="Off filters results and blocks new explicit adds."
              checked={!!allowExplicit}
              onChange={(v) => setValue('allowExplicitTracks', v, { shouldDirty: true })}
            />
            <ToggleRow
              label="Require proximity"
              hint="Guests must pass the GPS / Wi-Fi proximity gate to join."
              checked={!!proximityRequired}
              onChange={(v) => setValue('proximityRequired', v, { shouldDirty: true })}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending || !formState.isDirty}>
            <Save className="h-4 w-4" /> Save changes
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Fallback playlist</CardTitle>
          <CardDescription>
            FairPlay uses these tracks only when the guest queue is empty.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden
            />
            <Input
              value={fallbackQuery}
              onChange={(event) => setFallbackQuery(event.target.value)}
              placeholder="Search Spotify tracks for fallback..."
              className="pl-9"
            />
          </div>

          {fallbackTracks.data?.length ? (
            <ul className="flex flex-col gap-2">
              {fallbackTracks.data.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface-raised px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{item.track.title}</div>
                    <div className="truncate text-xs text-ink-muted">
                      {item.track.artist} · {formatDuration(item.track.durationMs)}
                      {item.lastQueuedAt ? ` · last used ${formatRelative(item.lastQueuedAt)}` : ''}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remove fallback track"
                    disabled={removeFallback.isPending}
                    onClick={() => removeFallback.mutate(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">
              No fallback tracks yet. Add a few songs so Spotify keeps playing when guests pause.
            </p>
          )}

          {debouncedFallbackQuery.length >= 3 ? (
            fallbackSearch.isLoading ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-ink-muted" />
            ) : fallbackSearch.isError ? (
              <p className="text-sm text-danger">
                {fallbackSearch.error instanceof Error
                  ? fallbackSearch.error.message
                  : 'Search failed.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {(fallbackSearch.data ?? []).map((track) => (
                  <TrackResultCard
                    key={track.spotifyTrackId}
                    track={track}
                    addLabel="Add to fallback playlist"
                    busy={
                      addFallback.isPending &&
                      addFallback.variables?.spotifyTrackId === track.spotifyTrackId
                    }
                    onAdd={() => addFallback.mutate(track)}
                  />
                ))}
              </ul>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <Label>{label}</Label>
    {children}
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

const useDebounced = <T,>(value: T, delay = 350): T => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
};

const formatRelative = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'recently';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
};
