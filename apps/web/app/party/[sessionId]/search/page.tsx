'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import type { TrackDto } from '@fairplay/shared-types';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TrackResultCard } from '@/components/domain/track-result-card';
import { ApiError } from '@/lib/api/client';
import { addQueueEntry, searchTracks, type AddQueueEntryBody } from '@/lib/api/endpoints';
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
  const pendingAddsRef = useRef(new Set<string>());
  const [pendingAdds, setPendingAdds] = useState<Set<string>>(() => new Set());
  const debounced = useDebounced(q, 800);
  const normalizedQuery = debounced.trim();

  const search = useQuery({
    queryKey: qk.search(sessionId, normalizedQuery),
    queryFn: ({ signal }) => searchTracks(sessionId, normalizedQuery, signal),
    enabled: normalizedQuery.length >= 3,
    retry: false,
  });

  const add = useMutation({
    mutationFn: (track: TrackDto) => addQueueEntry(sessionId, toAddQueueEntryBody(track)),
    onSuccess: () => {
      toast({ title: 'Added to queue', tone: 'success' });
      qc.invalidateQueries({ queryKey: qk.queue(sessionId) });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not add', description: err.message, tone: 'danger' }),
  });

  const addTrack = (track: TrackDto) => {
    if (pendingAddsRef.current.has(track.spotifyTrackId)) return;
    pendingAddsRef.current.add(track.spotifyTrackId);
    setPendingAdds(new Set(pendingAddsRef.current));
    add.mutate(track, {
      onSettled: () => {
        pendingAddsRef.current.delete(track.spotifyTrackId);
        setPendingAdds(new Set(pendingAddsRef.current));
      },
    });
  };

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

      {normalizedQuery.length < 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Start typing</CardTitle>
            <CardDescription>
              Type at least three characters to search Spotify.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : search.isLoading ? (
        <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-ink-muted" />
      ) : search.isError ? (
        <SearchError error={search.error} />
      ) : results.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing matches that yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {results.map((track) => (
            <TrackResultCard
              key={track.spotifyTrackId}
              track={track}
              busy={pendingAdds.has(track.spotifyTrackId)}
              onAdd={() => addTrack(track)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const SearchError = ({ error }: { error: Error | null }) => {
  const code = error instanceof ApiError ? error.code : 'UNKNOWN';
  const retryAfterSec =
    error instanceof ApiError && typeof error.details?.retryAfterSec === 'number'
      ? error.details.retryAfterSec
      : null;
  return (
    <p className="text-sm text-danger">
      {code} — {error?.message ?? 'Search failed.'}
      {retryAfterSec ? ` Try again in ${formatRetryAfter(retryAfterSec)}.` : ''}
    </p>
  );
};

const toAddQueueEntryBody = (track: TrackDto): AddQueueEntryBody => ({
  id: track.spotifyTrackId,
  uri: track.spotifyUri,
  name: track.title,
  artists: [{ name: track.artist }],
  ...(track.album || track.artworkUrl
    ? {
        album: {
          ...(track.album ? { name: track.album } : {}),
          ...(track.artworkUrl ? { images: [{ url: track.artworkUrl }] } : {}),
        },
      }
    : {}),
  duration_ms: track.durationMs,
  explicit: track.explicit,
  is_local: false,
});

const formatRetryAfter = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};
