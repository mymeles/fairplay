# FairPlay test UI (deployed-backend edition)

Two static pages — a host view and a guest view — that talk to the **deployed Railway API + Socket.IO**. Nothing local except Node serving the HTML.

## Run

```bash
node local-test-ui/serve.js
```

You'll see:

```
FairPlay test UI ready:
  Host  → http://localhost:3001/host
  Guest → http://localhost:3001/guest
```

The port matters — `3001` is registered with Spotify's OAuth flow (the Supabase Edge Function's `WEB_AUTH_COMPLETE_URL` secret). Don't change it unless you also update that secret.

## Test flow

### 1 — Host (in one browser window)
1. Open **<http://localhost:3001/host>**.
2. **Open Spotify on a device first** (phone, desktop app, web player — whatever) and start playing any track. The runner needs an active device to push to.
3. Click **Login with Spotify** → authorize → you'll be redirected back, host pill turns green.
4. Pick your device from the dropdown → **Use this device**.
5. **Create new session.** The 6-character join code appears in the big black box.
6. Copy the **guest link** (or just remember the code) — it's a shortcut to the guest view with the code prefilled.

### 2 — Guest (different window, ideally a different browser profile / incognito so the two don't share localStorage)
1. Open **<http://localhost:3001/guest>**, or use the link the host page generates.
2. Enter the join code, type a name, click **Join**.
3. Search for a song → click **Add to queue**.
4. Vote ▲ / ▼ to drive the M09 score. Click the same vote button again to clear it. Flip to the other to switch.
5. If an entry is **LOCKED**, you can spend one challenge token via the **Challenge** button to unlock it.

### 3 — Back on the host
- The queue list shows up live (WebSocket).
- **Pin** an entry → its score jumps to ~1000 + base, sending it to the top.
- **Veto** → it's marked VETOED and disappears.
- **Skip / Pause / Resume** drive your Spotify directly.
- **Start runner / Stop runner** toggles whether new entries get auto-pushed to Spotify.

### Watching the realtime stream
Both pages have an **Event log** expandable at the bottom. It shows every WebSocket message and every action's result.

## What's connected to what

```
your browser  ──HTTP/WSS──▶  api-production-7ee5.up.railway.app  (Railway)
                                  │
                                  ├── M12 runner   ─▶ Spotify /me/player/queue   (every 5s)
                                  └── M13 poller  ─▶ Spotify /me/player          (every 6s)
```

Both pollers are enabled in production. They tick continuously across every active session.

## Tear down

```bash
rm -rf local-test-ui   # nothing else local was changed
```

Optional Postgres cleanup (delete the host user + session you created):

```sql
delete from public.party_sessions where host_user_id = '<your-user-id>';
delete from public.spotify_tokens where user_id = '<your-user-id>';
delete from public.users where id = '<your-user-id>';
```
