'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Ban, Shield, ShieldOff, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  banGuest,
  blacklistArtist,
  blacklistTrack,
  muteGuest,
  unmuteGuest,
} from '@/lib/api/endpoints';
import { toast } from '@/components/ui/toaster';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function HostModerationPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [trackId, setTrackId] = useState('');
  const [trackTitle, setTrackTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [guestId, setGuestId] = useState('');

  const trackMut = useMutation({
    mutationFn: () =>
      blacklistTrack(sessionId, {
        spotifyTrackId: trackId.trim(),
        title: trackTitle.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Track blocked', tone: 'success' });
      setTrackId('');
      setTrackTitle('');
    },
    onError: (err: Error) =>
      toast({ title: 'Could not block track', description: err.message, tone: 'danger' }),
  });

  const artistMut = useMutation({
    mutationFn: () => blacklistArtist(sessionId, { artistName: artistName.trim() }),
    onSuccess: () => {
      toast({ title: 'Artist blocked', tone: 'success' });
      setArtistName('');
    },
    onError: (err: Error) =>
      toast({ title: 'Could not block artist', description: err.message, tone: 'danger' }),
  });

  const muteMut = useMutation({
    mutationFn: () => muteGuest(sessionId, guestId.trim()),
    onSuccess: () => toast({ title: 'Guest muted', tone: 'warning' }),
    onError: (err: Error) => toast({ title: 'Mute failed', description: err.message, tone: 'danger' }),
  });
  const banMut = useMutation({
    mutationFn: () => banGuest(sessionId, guestId.trim()),
    onSuccess: () => toast({ title: 'Guest banned', tone: 'danger' }),
    onError: (err: Error) => toast({ title: 'Ban failed', description: err.message, tone: 'danger' }),
  });
  const unmuteMut = useMutation({
    mutationFn: () => unmuteGuest(sessionId, guestId.trim()),
    onSuccess: () => toast({ title: 'Guest unmuted', tone: 'success' }),
    onError: (err: Error) =>
      toast({ title: 'Unmute failed', description: err.message, tone: 'danger' }),
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">Moderation</h1>
        <p className="text-sm text-ink-muted">
          Block tracks/artists and discipline guests. Actions take effect immediately.
        </p>
      </header>

      <Tabs defaultValue="blacklist">
        <TabsList>
          <TabsTrigger value="blacklist">Blacklist</TabsTrigger>
          <TabsTrigger value="guests">Guest discipline</TabsTrigger>
        </TabsList>

        <TabsContent value="blacklist">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Block a track</CardTitle>
                <CardDescription>
                  Paste a Spotify track ID (the part after <code>track/</code>).
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Field label="Spotify track ID">
                  <Input
                    placeholder="e.g. 7tFiyTwD0nx5a1eklYtX2J"
                    value={trackId}
                    onChange={(e) => setTrackId(e.target.value)}
                  />
                </Field>
                <Field label="Optional label">
                  <Input
                    placeholder="What guests will see in the audit log"
                    value={trackTitle}
                    onChange={(e) => setTrackTitle(e.target.value)}
                  />
                </Field>
                <Button
                  variant="danger"
                  disabled={!trackId.trim() || trackMut.isPending}
                  onClick={() => trackMut.mutate()}
                >
                  <Shield className="h-4 w-4" /> Block track
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Block an artist</CardTitle>
                <CardDescription>
                  Normalized matching — punctuation and casing don&apos;t matter.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Field label="Artist name">
                  <Input
                    placeholder="e.g. Nickelback"
                    value={artistName}
                    onChange={(e) => setArtistName(e.target.value)}
                  />
                </Field>
                <Button
                  variant="danger"
                  disabled={!artistName.trim() || artistMut.isPending}
                  onClick={() => artistMut.mutate()}
                >
                  <ShieldOff className="h-4 w-4" /> Block artist
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="guests">
          <Card>
            <CardHeader>
              <CardTitle>Discipline a guest</CardTitle>
              <CardDescription>
                Mute removes their queue power. Ban also blocks rejoin from the
                same device.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Field label="Guest ID">
                <Input
                  placeholder="UUID of the guest (copy from queue card)"
                  value={guestId}
                  onChange={(e) => setGuestId(e.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={!guestId.trim() || muteMut.isPending}
                  onClick={() => muteMut.mutate()}
                >
                  <VolumeX className="h-4 w-4" /> Mute
                </Button>
                <Button
                  variant="success"
                  disabled={!guestId.trim() || unmuteMut.isPending}
                  onClick={() => unmuteMut.mutate()}
                >
                  Unmute
                </Button>
                <Button
                  variant="danger"
                  disabled={!guestId.trim() || banMut.isPending}
                  onClick={() => banMut.mutate()}
                >
                  <Ban className="h-4 w-4" /> Ban
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <Label>{label}</Label>
    {children}
  </div>
);
