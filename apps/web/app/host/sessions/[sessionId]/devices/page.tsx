'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  SkipForward,
  Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api/client';
import {
  hostPause,
  hostResume,
  hostSkip,
  hostStartRunner,
  hostStopRunner,
  listSpotifyDevices,
  selectSpotifyDevice,
  type SpotifyDeviceInfo,
} from '@/lib/api/endpoints';
import { qk } from '@/lib/query/keys';
import { toast } from '@/components/ui/toaster';
import { RunnerStatusBadge } from '@/components/domain/runner-status-badge';
import { usePartySocket } from '@/lib/realtime/PartySocketProvider';

export default function HostDevicesPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const qc = useQueryClient();
  const { runnerStatus } = usePartySocket();

  const devices = useQuery({
    queryKey: qk.devices,
    queryFn: listSpotifyDevices,
    refetchInterval: 15_000,
  });

  const select = useMutation({
    mutationFn: (deviceId: string) => selectSpotifyDevice(deviceId),
    onSuccess: () => {
      toast({ title: 'Playback device updated', tone: 'success' });
      qc.invalidateQueries({ queryKey: qk.devices });
    },
    onError: (err: Error) => toast({ title: 'Failed to set device', description: err.message, tone: 'danger' }),
  });

  const start = useMutation({
    mutationFn: () => hostStartRunner(sessionId),
    onSuccess: () => toast({ title: 'Runner started', tone: 'success' }),
    onError: (err: Error) => toast({ title: 'Failed to start runner', description: err.message, tone: 'danger' }),
  });

  const stop = useMutation({
    mutationFn: () => hostStopRunner(sessionId),
    onSuccess: () => toast({ title: 'Runner stopped', tone: 'warning' }),
    onError: (err: Error) => toast({ title: 'Failed to stop runner', description: err.message, tone: 'danger' }),
  });

  const skip = useMutation({ mutationFn: hostSkip });
  const pause = useMutation({ mutationFn: hostPause });
  const resume = useMutation({ mutationFn: hostResume });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Playback & runner</h1>
          <p className="text-sm text-ink-muted">Pick a Spotify device and control playback.</p>
        </div>
        <Button variant="secondary" onClick={() => devices.refetch()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Spotify devices</CardTitle>
            <CardDescription>
              The selected device is where FairPlay will queue tracks.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {devices.isLoading ? (
              <p className="text-ink-muted">
                <Loader2 className="inline h-4 w-4 animate-spin" /> Loading devices…
              </p>
            ) : null}
            {devices.isError ? (
              <DeviceError error={devices.error} onRetry={() => devices.refetch()} />
            ) : null}
            {devices.data?.devices?.length ? (
              devices.data.devices.map((d) => (
                <DeviceRow
                  key={d.id}
                  device={d}
                  selected={devices.data.selectedDeviceId === d.id}
                  onSelect={() => select.mutate(d.id)}
                  busy={select.isPending}
                />
              ))
            ) : !devices.isLoading && !devices.isError ? (
              <p className="text-sm text-ink-muted">
                No devices reported by Spotify. Open Spotify on a phone, speaker, or desktop
                app and refresh.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Runner</CardTitle>
            <CardDescription>FairPlay&apos;s queue worker.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <RunnerStatusBadge status={runnerStatus} />
            <div className="flex flex-col gap-2">
              <Button onClick={() => start.mutate()} disabled={start.isPending}>
                Start runner
              </Button>
              <Button variant="danger" onClick={() => stop.mutate()} disabled={stop.isPending}>
                Stop runner
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => pause.mutate()}
                disabled={pause.isPending}
              >
                <Pause className="h-4 w-4" /> Pause
              </Button>
              <Button
                variant="secondary"
                onClick={() => resume.mutate()}
                disabled={resume.isPending}
              >
                <Play className="h-4 w-4" /> Resume
              </Button>
              <Button
                variant="outline"
                onClick={() => skip.mutate()}
                disabled={skip.isPending}
              >
                <SkipForward className="h-4 w-4" /> Skip
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const DeviceRow = ({
  device,
  selected,
  onSelect,
  busy,
}: {
  device: SpotifyDeviceInfo;
  selected: boolean;
  onSelect: () => void;
  busy: boolean;
}) => (
  <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-3 py-2">
    <Smartphone className="h-5 w-5 text-accent-cyan" />
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 text-sm font-medium">
        {device.name}
        {device.isActive ? <span className="text-xs text-success">active on Spotify</span> : null}
        {device.isRestricted ? <span className="text-xs text-warning">restricted</span> : null}
      </div>
      <div className="text-xs text-ink-muted">{device.type}</div>
    </div>
    <Button
      size="sm"
      variant={selected ? 'success' : 'secondary'}
      onClick={onSelect}
      disabled={busy || selected}
    >
      {selected ? <CheckCircle2 className="h-4 w-4" /> : null}
      {selected ? 'Selected' : 'Select'}
    </Button>
  </div>
);

const DeviceError = ({ error, onRetry }: { error: Error | null; onRetry: () => void }) => {
  const code = error instanceof ApiError ? error.code : 'UNKNOWN';
  const retryAfterSec =
    error instanceof ApiError && typeof error.details?.retryAfterSec === 'number'
      ? error.details.retryAfterSec
      : null;
  const message = error?.message ?? 'Could not load Spotify devices.';
  const retryMessage =
    retryAfterSec !== null ? ` Try again in ${formatRetryAfter(retryAfterSec)}.` : '';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-danger/40 bg-danger/10 p-3">
      <div>
        <p className="text-sm font-semibold text-danger">Could not load Spotify devices</p>
        <p className="text-sm text-ink-muted">
          {code} — {message}
          {retryMessage}
        </p>
      </div>
      <div>
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RefreshCw className="h-3 w-3" /> Retry
        </Button>
      </div>
    </div>
  );
};

const formatRetryAfter = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};
