'use client';

import { Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { usePartySocket } from '@/lib/realtime/PartySocketProvider';

export const ConnectionPill = () => {
  const { state } = usePartySocket();
  if (state === 'connected') {
    return (
      <Badge tone="success">
        <Wifi className="h-3 w-3" aria-hidden /> Live
      </Badge>
    );
  }
  if (state === 'connecting') {
    return (
      <Badge tone="warning">
        <Wifi className="h-3 w-3 animate-pulse" aria-hidden /> Connecting…
      </Badge>
    );
  }
  if (state === 'error') {
    return (
      <Badge tone="danger">
        <WifiOff className="h-3 w-3" aria-hidden /> Offline
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <WifiOff className="h-3 w-3" aria-hidden /> Not connected
    </Badge>
  );
};
