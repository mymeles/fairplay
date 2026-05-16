'use client';

import { motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  Lock,
  Pin,
  Rocket,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { QueueEntryDto, QueueEntryStatus } from '@fairplay/shared-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatDuration } from '@/lib/utils';

interface QueueCardProps {
  rank: number;
  entry: QueueEntryDto;
  myGuestId?: string | null;
  myVote?: 1 | -1 | null;
  role: 'host' | 'guest';
  busy?: 'vote' | 'boost' | 'challenge' | 'remove' | 'pin' | 'veto' | null;
  onVote?: (value: 1 | -1) => void;
  onBoost?: () => void;
  onChallenge?: () => void;
  onRemoveSelf?: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
  onVeto?: () => void;
}

const statusLabel: Record<QueueEntryStatus, string> = {
  PENDING: 'Pending',
  LOCKED: 'Locked',
  QUEUED_TO_SPOTIFY: 'Up next on Spotify',
  PLAYING: 'Now playing',
  PLAYED: 'Played',
  REMOVED: 'Removed',
  VETOED: 'Vetoed',
};

const statusTone: Record<QueueEntryStatus, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'neutral',
  LOCKED: 'accent',
  QUEUED_TO_SPOTIFY: 'success',
  PLAYING: 'success',
  PLAYED: 'neutral',
  REMOVED: 'danger',
  VETOED: 'danger',
};

export const QueueCard = ({
  rank,
  entry,
  myGuestId,
  myVote,
  role,
  busy,
  onVote,
  onBoost,
  onChallenge,
  onRemoveSelf,
  onPin,
  onUnpin,
  onVeto,
}: QueueCardProps) => {
  const isLocked = entry.status === 'LOCKED' || entry.status === 'QUEUED_TO_SPOTIFY';
  const canVote = role === 'guest' && entry.status === 'PENDING';
  const canBoost = role === 'guest' && entry.status === 'PENDING';
  const canChallenge = role === 'guest' && entry.status === 'LOCKED';
  const canRemoveSelf = role === 'guest' && entry.addedByGuestId === myGuestId && entry.status === 'PENDING';
  const canHostAct = role === 'host' && (entry.status === 'PENDING' || entry.status === 'LOCKED');

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className={cn(
        'group relative flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-lg shadow-black/30 sm:flex-row sm:items-center',
        isLocked && 'ring-1 ring-accent-purple/50 animate-lock-pulse',
        entry.hostPinned && 'border-warning/60',
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-8 shrink-0 flex-col items-center justify-center rounded-md bg-surface-muted text-sm font-bold text-ink-muted">
          #{rank}
        </div>
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gradient-party-soft">
          {entry.track.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.track.artworkUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-base font-semibold text-ink">{entry.track.title}</span>
          {entry.track.explicit ? (
            <Badge tone="warning" className="uppercase tracking-wide">
              E
            </Badge>
          ) : null}
          {entry.hostPinned ? (
            <Badge tone="warning">
              <Pin className="h-3 w-3" aria-hidden /> Pinned
            </Badge>
          ) : null}
          <Badge tone={statusTone[entry.status]}>
            {isLocked ? <Lock className="h-3 w-3" aria-hidden /> : null}
            {statusLabel[entry.status]}
          </Badge>
        </div>
        <div className="mt-0.5 truncate text-sm text-ink-muted">
          {entry.track.artist} · {formatDuration(entry.track.durationMs)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-subtle">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-accent-pink" aria-hidden />
            Score {entry.score.toFixed(1)}
          </span>
          <span>👍 {entry.upvotes}</span>
          <span>👎 {entry.downvotes}</span>
          {entry.boostCredits > 0 ? <span>🚀 {entry.boostCredits}</span> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
        {canVote ? (
          <>
            <Button
              size="icon"
              variant={myVote === 1 ? 'primary' : 'secondary'}
              disabled={busy === 'vote'}
              onClick={() => onVote?.(1)}
              aria-label="Upvote"
            >
              <ChevronUp className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              variant={myVote === -1 ? 'danger' : 'secondary'}
              disabled={busy === 'vote'}
              onClick={() => onVote?.(-1)}
              aria-label="Downvote"
            >
              <ChevronDown className="h-5 w-5" />
            </Button>
          </>
        ) : null}
        {canBoost ? (
          <Button
            size="sm"
            variant="primary"
            disabled={busy === 'boost'}
            onClick={onBoost}
          >
            <Rocket className="h-4 w-4" /> Boost
          </Button>
        ) : null}
        {canChallenge ? (
          <Button
            size="sm"
            variant="danger"
            disabled={busy === 'challenge'}
            onClick={onChallenge}
          >
            Challenge lock
          </Button>
        ) : null}
        {canRemoveSelf ? (
          <Button
            size="icon"
            variant="ghost"
            disabled={busy === 'remove'}
            onClick={onRemoveSelf}
            aria-label="Remove my entry"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
        {canHostAct ? (
          <>
            <Button
              size="sm"
              variant={entry.hostPinned ? 'secondary' : 'outline'}
              disabled={busy === 'pin'}
              onClick={entry.hostPinned ? onUnpin : onPin}
            >
              <Pin className="h-4 w-4" />
              {entry.hostPinned ? 'Unpin' : 'Pin'}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy === 'veto'}
              onClick={onVeto}
            >
              <X className="h-4 w-4" /> Veto
            </Button>
          </>
        ) : null}
      </div>
    </motion.li>
  );
};
