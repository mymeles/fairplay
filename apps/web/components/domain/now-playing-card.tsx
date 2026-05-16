'use client';

import { motion } from 'framer-motion';
import { Pause, Play, Radio } from 'lucide-react';
import type {
  NowPlayingState,
  NowPlayingUpdatedPayload,
  QueueEntryDto,
} from '@fairplay/shared-types';
import { Badge } from '@/components/ui/badge';
import { cn, formatDuration } from '@/lib/utils';

interface NowPlayingCardProps {
  nowPlaying: NowPlayingUpdatedPayload | null;
  currentEntry?: QueueEntryDto | null;
  className?: string;
  compact?: boolean;
}

const stateLabel: Record<NowPlayingState, string> = {
  playing: 'Now playing',
  paused: 'Paused',
  idle: 'Idle',
  no_active_device: 'No active device',
};

const stateTone: Record<NowPlayingState, 'success' | 'warning' | 'neutral' | 'danger'> = {
  playing: 'success',
  paused: 'warning',
  idle: 'neutral',
  no_active_device: 'danger',
};

export const NowPlayingCard = ({
  nowPlaying,
  currentEntry,
  className,
  compact,
}: NowPlayingCardProps) => {
  const track = currentEntry?.track;
  const state: NowPlayingState = nowPlaying?.state ?? 'idle';
  const isPlaying = state === 'playing';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'ring-gradient relative overflow-hidden rounded-2xl bg-surface px-4 py-3 shadow-xl shadow-black/30',
        compact ? 'flex items-center gap-3' : 'flex flex-col gap-3 p-5',
        className,
      )}
    >
      <div className={cn('flex items-center gap-3', compact ? '' : 'mb-1')}>
        <Badge tone={stateTone[state]}>
          {isPlaying ? (
            <Radio className="h-3 w-3 animate-pulse" aria-hidden />
          ) : state === 'paused' ? (
            <Pause className="h-3 w-3" aria-hidden />
          ) : (
            <Play className="h-3 w-3" aria-hidden />
          )}
          {stateLabel[state]}
        </Badge>
        {nowPlaying?.isInternal === false ? (
          <Badge tone="neutral">External track</Badge>
        ) : null}
      </div>

      <div className={cn('flex items-center gap-3', compact ? 'min-w-0 flex-1' : '')}>
        <div
          className={cn(
            'relative shrink-0 overflow-hidden rounded-xl bg-gradient-party-soft',
            compact ? 'h-12 w-12' : 'h-20 w-20 sm:h-24 sm:w-24',
          )}
        >
          {track?.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={track.artworkUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink-subtle">
              <Radio className={compact ? 'h-5 w-5' : 'h-8 w-8'} aria-hidden />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'truncate font-semibold text-ink',
              compact ? 'text-sm' : 'text-base sm:text-lg',
            )}
          >
            {track?.title ?? 'Waiting for the next track…'}
          </div>
          <div className="truncate text-sm text-ink-muted">
            {track?.artist ?? 'Add a song from search to get the party started'}
          </div>
          {!compact && track ? (
            <div className="mt-1 flex items-center gap-2 text-xs text-ink-subtle">
              <span>{track.album ?? '—'}</span>
              <span aria-hidden>·</span>
              <span>{formatDuration(track.durationMs)}</span>
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
};
