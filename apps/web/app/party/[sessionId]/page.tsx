'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ListMusic, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { listQueue } from '@/lib/api/endpoints';
import { qk } from '@/lib/query/keys';
import { NowPlayingCard } from '@/components/domain/now-playing-card';
import { usePartySocket } from '@/lib/realtime/PartySocketProvider';
import { formatDuration } from '@/lib/utils';

export default function PartyHomePage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const { nowPlaying } = usePartySocket();

  const queue = useQuery({
    queryKey: qk.queue(sessionId),
    queryFn: () => listQueue(sessionId),
  });

  const currentEntry = queue.data?.find((e) => e.id === nowPlaying?.entryId) ?? null;
  const locked = queue.data?.filter((e) => e.status === 'LOCKED').slice(0, 3) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <NowPlayingCard nowPlaying={nowPlaying} currentEntry={currentEntry} />

      <div className="grid grid-cols-2 gap-3">
        <Button asChild size="lg" className="h-20 text-base">
          <Link href={`/party/${sessionId}/search`}>
            <Search className="h-5 w-5" /> Find a track
          </Link>
        </Button>
        <Button asChild size="lg" variant="secondary" className="h-20 text-base">
          <Link href={`/party/${sessionId}/queue`}>
            <ListMusic className="h-5 w-5" /> Vote on queue
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Locked in</CardTitle>
            <CardDescription>
              These are next. Out-vote them with a challenge.
            </CardDescription>
          </div>
          <Badge tone="accent">{locked.length} locked</Badge>
        </CardHeader>
        <CardContent>
          {locked.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Nothing&apos;s locked yet. Be the first to drop a track.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {locked.map((entry, idx) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-3 py-2"
                >
                  <span className="font-mono text-sm text-ink-muted">#{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {entry.track.title}
                    </div>
                    <div className="truncate text-xs text-ink-muted">
                      {entry.track.artist} · {formatDuration(entry.track.durationMs)}
                    </div>
                  </div>
                  <Badge tone="accent">{entry.score.toFixed(1)}</Badge>
                </li>
              ))}
            </ul>
          )}
          <Button asChild variant="ghost" className="mt-4 w-full">
            <Link href={`/party/${sessionId}/queue`}>
              See the full queue <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
