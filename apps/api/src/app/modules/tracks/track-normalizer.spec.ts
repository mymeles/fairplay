import { TrackNormalizer } from './track-normalizer';
import type { SpotifyTrackItemDto } from './spotify-search.adapter';

const spotifyTrack = (overrides: Partial<SpotifyTrackItemDto> = {}): SpotifyTrackItemDto => ({
  id: 'abc123',
  uri: 'spotify:track:abc123',
  name: 'Levitating',
  artists: [{ name: 'Dua Lipa' }, { name: 'DaBaby' }],
  album: {
    name: 'Future Nostalgia',
    images: [
      { url: 'https://i.scdn.co/image/large', width: 640, height: 640 },
      { url: 'https://i.scdn.co/image/small', width: 64, height: 64 },
    ],
  },
  duration_ms: 203807,
  explicit: true,
  is_local: false,
  ...overrides,
});

describe('TrackNormalizer.normalize', () => {
  const normalizer = new TrackNormalizer();

  it('maps Spotify track payloads into the internal TrackDto', () => {
    const result = normalizer.normalize(spotifyTrack());
    expect(result).toEqual({
      spotifyUri: 'spotify:track:abc123',
      spotifyTrackId: 'abc123',
      title: 'Levitating',
      artist: 'Dua Lipa, DaBaby',
      album: 'Future Nostalgia',
      durationMs: 203807,
      artworkUrl: 'https://i.scdn.co/image/large',
      explicit: true,
    });
  });

  it('omits optional album/artwork fields when Spotify does not provide them', () => {
    const result = normalizer.normalize(spotifyTrack({ album: null, explicit: false }));
    expect(result).toEqual({
      spotifyUri: 'spotify:track:abc123',
      spotifyTrackId: 'abc123',
      title: 'Levitating',
      artist: 'Dua Lipa, DaBaby',
      durationMs: 203807,
      explicit: false,
    });
  });

  it('drops local tracks because they cannot be queued by Spotify URI later', () => {
    expect(normalizer.normalize(spotifyTrack({ is_local: true }))).toBeNull();
  });

  it('drops malformed Spotify tracks', () => {
    expect(normalizer.normalize(spotifyTrack({ id: null }))).toBeNull();
    expect(normalizer.normalize(spotifyTrack({ uri: 'not-a-spotify-uri' }))).toBeNull();
    expect(normalizer.normalize(spotifyTrack({ name: '   ' }))).toBeNull();
    expect(normalizer.normalize(spotifyTrack({ artists: [] }))).toBeNull();
    expect(normalizer.normalize(spotifyTrack({ duration_ms: 0 }))).toBeNull();
  });

  it('normalizes many tracks and filters unnormalizable entries', () => {
    const result = normalizer.normalizeMany([
      spotifyTrack({ id: 'one', uri: 'spotify:track:one', explicit: false }),
      spotifyTrack({ id: null }),
      spotifyTrack({ id: 'two', uri: 'spotify:track:two', explicit: true }),
    ]);
    expect(result.map((track) => track.spotifyTrackId)).toEqual(['one', 'two']);
  });
});

