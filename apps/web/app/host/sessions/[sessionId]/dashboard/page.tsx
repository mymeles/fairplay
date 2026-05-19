'use client';

import { AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getSession,
  hostListQueue,
  hostPinEntry,
  hostUnpinEntry,
  hostVetoEntry,
} from '@/lib/api/endpoints';
import { qk } from '@/lib/query/keys';
import { NowPlayingCard } from '@/components/domain/now-playing-card';
import { QueueCard } from '@/components/domain/queue-card';
import { RunnerStatusBadge } from '@/components/domain/runner-status-badge';
import { usePartySocket } from '@/lib/realtime/PartySocketProvider';
import { toast } from '@/components/ui/toaster';

export default function HostDashboardPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const qc = useQueryClient();
  const { nowPlaying, runnerStatus } = usePartySocket();

  const session = useQuery({
    queryKey: qk.session(sessionId),
    queryFn: () => getSession(sessionId),
  });

  const queue = useQuery({
    queryKey: qk.queue(sessionId),
    queryFn: () => hostListQueue(sessionId),
    refetchInterval: 20_000,
  });

  const invalidateQueue = () => qc.invalidateQueries({ queryKey: qk.queue(sessionId) });

  const pin = useMutation({
    mutationFn: hostPinEntry,
    onSuccess: () => {
      invalidateQueue();
      toast({ title: 'Pinned', tone: 'success' });
    },
    onError: (err: Error) =>
      toast({ title: 'Pin failed', description: err.message, tone: 'danger' }),
  });
  const unpin = useMutation({ mutationFn: hostUnpinEntry, onSuccess: invalidateQueue });
  const veto = useMutation({
    mutationFn: hostVetoEntry,
    onSuccess: () => {
      invalidateQueue();
      toast({ title: 'Vetoed', tone: 'warning' });
    },
    onError: (err: Error) =>
      toast({ title: 'Veto failed', description: err.message, tone: 'danger' }),
  });

  const activeEntry = queue.data?.find((e) => e.id === nowPlaying?.entryId) ?? null;
  const activeQueue = (queue.data ?? [])
    .filter(
      (entry) =>
        entry.status === 'PENDING' ||
        entry.status === 'LOCKED' ||
        entry.status === 'QUEUED_TO_SPOTIFY' ||
        entry.status === 'PLAYING',
    )
    .sort((a, b) => {
      const statusDelta = statusRank(a.status) - statusRank(b.status);
      return statusDelta === 0 ? b.score - a.score : statusDelta;
    });
  const queueCounts = {
    pending: activeQueue.filter((entry) => entry.status === 'PENDING').length,
    locked: activeQueue.filter((entry) => entry.status === 'LOCKED').length,
    queued: activeQueue.filter((entry) => entry.status === 'QUEUED_TO_SPOTIFY').length,
    playing: activeQueue.filter((entry) => entry.status === 'PLAYING').length,
  };
  const queueDepthTarget = session.data?.settings.spotifyQueueDepthTarget ?? 3;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Dashboard</h1>
          <p className="text-sm text-ink-muted">
            Now playing, runner health, and the queue at a glance.
          </p>
        </div>
        <RunnerStatusBadge status={runnerStatus} />
      </header>

      <NowPlayingCard nowPlaying={nowPlaying} currentEntry={activeEntry} />

      <div className="grid gap-2 sm:grid-cols-5" aria-label="Queue pipeline">
        <QueueMetric label="Voting" value={queueCounts.pending} />
        <QueueMetric label="Challenge" value={queueCounts.locked} />
        <QueueMetric label="Spotify" value={`${queueCounts.queued}/${queueDepthTarget}`} />
        <QueueMetric label="Playing" value={queueCounts.playing} />
        <QueueMetric label="Depth" value={queueDepthTarget} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Queue</CardTitle>
            <CardDescription>
              Spotify shows songs after they leave the challenge window. Depth is the number kept ahead.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {queue.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
          ) : queue.isError ? (
            <p className="text-sm text-danger">
              Queue read failed: {queue.error instanceof Error ? queue.error.message : 'unknown error'}.
            </p>
          ) : activeQueue.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No active queue items yet. Guest-added tracks will appear here in
              real time.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {activeQueue.map((entry, idx) => (
                  <QueueCard
                    key={entry.id}
                    rank={idx + 1}
                    entry={entry}
                    role="host"
                    busy={
                      pin.isPending || unpin.isPending
                        ? 'pin'
                        : veto.isPending
                          ? 'veto'
                          : null
                    }
                    onPin={() => pin.mutate(entry.id)}
                    onUnpin={() => unpin.mutate(entry.id)}
                    onVeto={() => veto.mutate(entry.id)}
                  />
                ))}
              </AnimatePresence>
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const statusOrder: Record<string, number> = {
  PLAYING: 0,
  QUEUED_TO_SPOTIFY: 1,
  LOCKED: 2,
  PENDING: 3,
};

const statusRank = (status: string): number => statusOrder[status] ?? 99;

const QueueMetric = ({ label, value }: { label: string; value: number | string }) => (
  <div className="rounded-xl border border-border bg-surface px-3 py-2">
    <div className="text-xs uppercase tracking-wide text-ink-subtle">{label}</div>
    <div className="text-lg font-black text-ink">{value}</div>
  </div>
);
