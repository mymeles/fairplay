'use client';

import { Music, Plus } from 'lucide-react';
import type { TrackDto } from '@fairplay/shared-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/utils';

interface TrackResultCardProps {
  track: TrackDto;
  onAdd: () => void;
  busy?: boolean;
}

export const TrackResultCard = ({ track, onAdd, busy }: TrackResultCardProps) => (
  <li className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5">
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gradient-party-soft">
      {track.artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-ink-subtle">
          <Music className="h-5 w-5" aria-hidden />
        </div>
      )}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-semibold">{track.title}</span>
        {track.explicit ? (
          <Badge tone="warning" className="uppercase">
            E
          </Badge>
        ) : null}
      </div>
      <div className="truncate text-xs text-ink-muted">
        {track.artist}
        {track.album ? ` · ${track.album}` : ''} · {formatDuration(track.durationMs)}
      </div>
    </div>
    <Button size="icon" variant="primary" onClick={onAdd} disabled={busy} aria-label="Add to queue">
      <Plus className="h-5 w-5" />
    </Button>
  </li>
);
