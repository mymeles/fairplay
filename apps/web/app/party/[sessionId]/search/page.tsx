'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TrackResultCard } from '@/components/domain/track-result-card';
import { addQueueEntry, searchTracks } from '@/lib/api/endpoints';
import { qk } from '@/lib/query/keys';
import { toast } from '@/components/ui/toaster';

const useDebounced = <T,>(value: T, delay = 350): T => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
};

export default function PartySearchPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 300);

  const search = useQuery({
    queryKey: qk.search(sessionId, debounced),
    queryFn: ({ signal }) => searchTracks(sessionId, debounced, signal),
    enabled: debounced.trim().length >= 2,
  });

  const add = useMutation({
    mutationFn: (spotifyTrackId: string) => addQueueEntry(sessionId, { spotifyTrackId }),
    onSuccess: () => {
      toast({ title: 'Added to queue', tone: 'success' });
      qc.invalidateQueries({ queryKey: qk.queue(sessionId) });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not add', description: err.message, tone: 'danger' }),
  });

  const results = useMemo(() => search.data ?? [], [search.data]);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-sm text-ink-muted">Find a song and drop it in the queue.</p>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Spotify tracks…"
          className="pl-9"
        />
      </div>

      {debounced.trim().length < 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Start typing</CardTitle>
            <CardDescription>
              We search Spotify in real time. Two characters is enough to start.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : search.isLoading ? (
        <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-ink-muted" />
      ) : search.isError ? (
        <p className="text-sm text-danger">
          {search.error instanceof Error ? search.error.message : 'Search failed.'}
        </p>
      ) : results.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing matches that yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {results.map((track) => (
            <TrackResultCard
              key={track.spotifyTrackId}
              track={track}
              busy={add.isPending && add.variables === track.spotifyTrackId}
              onAdd={() => add.mutate(track.spotifyTrackId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
