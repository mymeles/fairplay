'use client';

import { useQuery } from '@tanstack/react-query';
import { Rocket, Sparkles, Wallet2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getGuestWallet } from '@/lib/api/endpoints';
import { qk } from '@/lib/query/keys';
import { usePartySocket } from '@/lib/realtime/PartySocketProvider';

export default function WalletPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const { lastTokenUpdate } = usePartySocket();

  const wallet = useQuery({
    queryKey: qk.wallet(sessionId),
    queryFn: () => getGuestWallet(sessionId),
    refetchInterval: 60_000,
  });

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Tokens</h1>
        <p className="text-sm text-ink-muted">You got tokens for joining. Use them wisely.</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <TokenStat
          icon={Rocket}
          label="Boost tokens"
          value={wallet.data?.boostTokens ?? 0}
          accentClass="text-accent-pink"
        />
        <TokenStat
          icon={Sparkles}
          label="Challenge tokens"
          value={wallet.data?.challengeTokens ?? 0}
          accentClass="text-accent-cyan"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Wallet2 className="mr-1 inline h-5 w-5 text-accent-purple" /> What can I do with these?
          </CardTitle>
          <CardDescription>FairPlay tokens. Free, but limited per session.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-ink-muted">
          <p>
            <strong className="text-ink">Boost</strong> adds score to a pending track so it moves
            closer to the lock window.
          </p>
          <p>
            <strong className="text-ink">Challenge</strong> spends one token to unlock a locked
            track and return it to voting before FairPlay sends it to Spotify.
          </p>
          {lastTokenUpdate ? (
            <p className="rounded-xl border border-border bg-surface-raised p-3 text-xs">
              Last update: {lastTokenUpdate.tokenType.toLowerCase()} ·{' '}
              {lastTokenUpdate.reason.replaceAll('_', ' ')}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

const TokenStat = ({
  icon: Icon,
  label,
  value,
  accentClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  accentClass: string;
}) => (
  <div className="rounded-2xl border border-border bg-surface p-5">
    <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-ink-muted">
      <Icon className={`h-4 w-4 ${accentClass}`} />
      {label}
    </div>
    <div className="mt-2 text-4xl font-black text-gradient">{value}</div>
  </div>
);
