'use client';

import { Activity, AlertTriangle, CircleSlash, Loader2, PauseCircle } from 'lucide-react';
import type {
  RunnerStatusChangedPayload,
  RunnerStatusState,
} from '@fairplay/shared-types';
import { Badge } from '@/components/ui/badge';

interface RunnerStatusBadgeProps {
  status: RunnerStatusChangedPayload | null;
}

const stateMap: Record<
  RunnerStatusState,
  { tone: 'success' | 'neutral' | 'warning' | 'danger'; label: string; icon: typeof Activity }
> = {
  ACTIVE: { tone: 'success', label: 'Runner active', icon: Activity },
  IDLE: { tone: 'neutral', label: 'Runner idle', icon: PauseCircle },
  BACKING_OFF: { tone: 'warning', label: 'Runner backing off', icon: Loader2 },
  DISABLED: { tone: 'danger', label: 'Runner disabled', icon: AlertTriangle },
};

const reasonHints: Record<string, string> = {
  rate_limited: 'Spotify is rate-limiting us — backing off.',
  circuit_open: 'Too many failures — circuit open.',
  premium_required: 'Host account is not Premium.',
  no_active_device: 'Select an active Spotify device.',
  auth_failed: 'Spotify auth needs reconnection.',
  host_disabled: 'Stopped by host.',
  session_ended: 'Session has ended.',
};

export const RunnerStatusBadge = ({ status }: RunnerStatusBadgeProps) => {
  if (!status) {
    return (
      <Badge tone="neutral">
        <CircleSlash className="h-3 w-3" aria-hidden /> Runner: unknown
      </Badge>
    );
  }
  const info = stateMap[status.state] ?? stateMap.IDLE;
  const Icon = info.icon;
  const hint = reasonHints[status.reason];
  return (
    <div className="flex flex-col gap-1">
      <Badge tone={info.tone}>
        <Icon className="h-3 w-3" aria-hidden /> {info.label}
      </Badge>
      {hint ? <span className="text-xs text-ink-subtle">{hint}</span> : null}
    </div>
  );
};
