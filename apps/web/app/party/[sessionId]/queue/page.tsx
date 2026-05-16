'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { Loader2, MusicIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueueCard } from '@/components/domain/queue-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  applyBoost,
  castVote,
  challengeLock,
  listQueue,
  removeOwnQueueEntry,
  removeVote,
} from '@/lib/api/endpoints';
import { qk } from '@/lib/query/keys';
import { useGuestAuth } from '@/lib/auth/hooks';
import { toast } from '@/components/ui/toaster';
import { usePartySocket } from '@/lib/realtime/PartySocketProvider';
import type { QueueEntryDto, VoteUpdatedPayload } from '@fairplay/shared-types';

export default function PartyQueuePage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const { meta } = useGuestAuth(sessionId);
  const qc = useQueryClient();
  const { subscribe } = usePartySocket();

  const queue = useQuery({
    queryKey: qk.queue(sessionId),
    queryFn: () => listQueue(sessionId),
  });

  const [myVotes, setMyVotes] = useState<Record<string, 1 | -1 | null>>({});
  useEffect(() => {
    if (!meta) return;
    return subscribe<VoteUpdatedPayload>('vote.updated', (event) => {
      const payload = event.payload;
      if (!payload || payload.guestId !== meta.guestId) return;
      setMyVotes((prev) => ({ ...prev, [payload.entryId]: payload.value }));
    });
  }, [subscribe, meta]);

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.queue(sessionId) });

  const [busyEntry, setBusyEntry] = useState<{
    entryId: string;
    kind: 'vote' | 'boost' | 'challenge' | 'remove';
  } | null>(null);

  const vote = useMutation({
    mutationFn: ({ entryId, value }: { entryId: string; value: 1 | -1 }) => {
      setBusyEntry({ entryId, kind: 'vote' });
      return castVote(sessionId, entryId, value);
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) =>
      toast({ title: 'Vote failed', description: err.message, tone: 'danger' }),
    onSettled: () => setBusyEntry(null),
  });

  const unvote = useMutation({
    mutationFn: (entryId: string) => {
      setBusyEntry({ entryId, kind: 'vote' });
      return removeVote(sessionId, entryId);
    },
    onSuccess: () => invalidate(),
    onSettled: () => setBusyEntry(null),
  });

  const boost = useMutation({
    mutationFn: (entryId: string) => {
      setBusyEntry({ entryId, kind: 'boost' });
      return applyBoost(sessionId, entryId);
    },
    onSuccess: () => {
      toast({ title: 'Boost applied', tone: 'success' });
      invalidate();
      qc.invalidateQueries({ queryKey: qk.wallet(sessionId) });
    },
    onError: (err: Error) =>
      toast({ title: 'Boost failed', description: err.message, tone: 'danger' }),
    onSettled: () => setBusyEntry(null),
  });

  const challenge = useMutation({
    mutationFn: (entryId: string) => {
      setBusyEntry({ entryId, kind: 'challenge' });
      return challengeLock(sessionId, entryId);
    },
    onSuccess: () => {
      toast({ title: 'Lock challenged', tone: 'warning' });
      invalidate();
      qc.invalidateQueries({ queryKey: qk.wallet(sessionId) });
    },
    onError: (err: Error) =>
      toast({ title: 'Challenge failed', description: err.message, tone: 'danger' }),
    onSettled: () => setBusyEntry(null),
  });

  const removeOwn = useMutation({
    mutationFn: (entryId: string) => {
      setBusyEntry({ entryId, kind: 'remove' });
      return removeOwnQueueEntry(sessionId, entryId);
    },
    onSuccess: () => {
      toast({ title: 'Removed', tone: 'neutral' });
      invalidate();
    },
    onError: (err: Error) =>
      toast({ title: 'Remove failed', description: err.message, tone: 'danger' }),
    onSettled: () => setBusyEntry(null),
  });

  const onVote = (entry: QueueEntryDto, value: 1 | -1) => {
    const existing = myVotes[entry.id];
    if (existing === value) {
      unvote.mutate(entry.id);
    } else {
      vote.mutate({ entryId: entry.id, value });
    }
  };

  const sorted = useMemo(() => {
    const data = queue.data ?? [];
    const active = data.filter(
      (e) =>
        e.status === 'PENDING' ||
        e.status === 'LOCKED' ||
        e.status === 'QUEUED_TO_SPOTIFY' ||
        e.status === 'PLAYING',
    );
    return active.sort((a, b) => b.score - a.score);
  }, [queue.data]);

  if (queue.isLoading) {
    return <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-ink-muted" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Queue</h1>
        <p className="text-sm text-ink-muted">
          Vote up the bangers, vote down the dud takes.
        </p>
      </header>

      {sorted.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <MusicIcon className="mr-1 inline h-5 w-5 text-accent-pink" /> Empty queue
            </CardTitle>
            <CardDescription>Be the first to drop a track.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/party/${sessionId}/search`}>Find a track</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ol className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {sorted.map((entry, idx) => (
              <QueueCard
                key={entry.id}
                rank={idx + 1}
                entry={entry}
                myGuestId={meta?.guestId}
                myVote={myVotes[entry.id] ?? null}
                role="guest"
                busy={busyEntry?.entryId === entry.id ? busyEntry.kind : null}
                onVote={(v) => onVote(entry, v)}
                onBoost={() => boost.mutate(entry.id)}
                onChallenge={() => challenge.mutate(entry.id)}
                onRemoveSelf={() => removeOwn.mutate(entry.id)}
              />
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}
