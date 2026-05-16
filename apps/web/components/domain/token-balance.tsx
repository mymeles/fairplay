'use client';

import { motion } from 'framer-motion';
import { Rocket, Sparkles } from 'lucide-react';
import type { GuestWalletSummary } from '@fairplay/shared-types';
import { cn } from '@/lib/utils';

interface TokenBalanceProps {
  wallet: GuestWalletSummary | null | undefined;
  className?: string;
  compact?: boolean;
}

export const TokenBalance = ({ wallet, className, compact }: TokenBalanceProps) => (
  <div
    className={cn(
      'flex items-center gap-3 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-sm font-semibold',
      compact && 'px-2 py-1 text-xs',
      className,
    )}
  >
    <motion.span
      key={wallet?.boostTokens}
      initial={{ scale: 0.85 }}
      animate={{ scale: 1 }}
      className="inline-flex items-center gap-1 text-accent-pink"
    >
      <Rocket className={compact ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden /> {wallet?.boostTokens ?? '—'}
    </motion.span>
    <span className="text-ink-subtle">|</span>
    <motion.span
      key={wallet?.challengeTokens}
      initial={{ scale: 0.85 }}
      animate={{ scale: 1 }}
      className="inline-flex items-center gap-1 text-accent-cyan"
    >
      <Sparkles className={compact ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden /> {wallet?.challengeTokens ?? '—'}
    </motion.span>
  </div>
);
