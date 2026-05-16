import Link from 'next/link';
import { ArrowRight, QrCode, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-between p-6 sm:p-10">
      <header className="flex items-center justify-between">
        <span className="font-mono text-sm uppercase tracking-[0.3em] text-ink-muted">
          FairPlay
        </span>
        <span className="text-xs text-ink-subtle">v0.17 · MVP</span>
      </header>

      <section className="flex flex-1 flex-col items-start justify-center gap-6 py-12">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-ink-muted">
          <Sparkles className="h-3 w-3 text-accent-pink" aria-hidden />
          The aux cord, but fair.
        </span>
        <h1 className="text-balance text-5xl font-black leading-[1.05] tracking-tight sm:text-7xl">
          Vote the vibe.
          <br />
          <span className="text-gradient">Keep it fair.</span>
        </h1>
        <p className="max-w-xl text-pretty text-base text-ink-muted sm:text-lg">
          Hosts plug into Spotify. Guests drop tracks, vote, and boost. The queue
          stays democratic, the playlist stays alive.
        </p>
        <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/host/login">
              Host a party
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
            <Link href="/join">
              <QrCode className="h-4 w-4" aria-hidden />
              Join a party
            </Link>
          </Button>
        </div>
      </section>

      <footer className="mt-10 grid grid-cols-1 gap-3 text-sm text-ink-muted sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface/60 p-4">
          <div className="text-xs uppercase tracking-wide text-ink-subtle">No phone-stealing</div>
          <div className="mt-1 text-ink">Everyone queues from their seat.</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface/60 p-4">
          <div className="text-xs uppercase tracking-wide text-ink-subtle">Locked windows</div>
          <div className="mt-1 text-ink">Top tracks lock in. Challenge to unlock.</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface/60 p-4">
          <div className="text-xs uppercase tracking-wide text-ink-subtle">Host in control</div>
          <div className="mt-1 text-ink">Pin, veto, ban — the vibe is yours.</div>
        </div>
      </footer>
    </main>
  );
}
