# Gen-Z Centered Web App Layout

## Design Goal

The app should feel like a live party control surface, not a boring admin dashboard.

Visual vibe:

- Dark mode first.
- Neon gradients.
- Large album art.
- Real-time motion.
- Tap-friendly.
- Fast feedback.
- Social proof.
- Playful microcopy.
- Mobile-first.

## Brand Direction

Working brand: FairPlay DJ

Possible taglines:

- "The aux cord, but fair."
- "Vote the vibe."
- "No phone stealing. Just fair music."
- "Your party. Everyone's queue."
- "Drop tracks. Vote vibes. Keep it fair."

## Visual Style

### Colors

Use a dark base:

```text
Background: #09090B / zinc-950
Cards: #18181B / zinc-900
Borders: #27272A / zinc-800
Primary gradient: purple -> pink -> cyan
Success: emerald
Warning: amber
Danger: rose
```

### Typography

- Big bold headings.
- Short copy.
- Avoid corporate language.
- Use clear labels.

### UI Components

Use:

- bottom nav on guest mobile
- floating now-playing mini player
- animated queue cards
- pill badges
- progress rings
- swipe actions
- haptic-like motion animations
- QR full-screen host view

## Guest App Screens

### 1. Join Screen

Elements:

- Full-screen gradient background.
- "Join the party"
- Session code input.
- QR flow.
- Display name input.
- Location permission explanation.

Copy:

```text
Step into the queue.
Scan the QR or enter the party code.
```

### 2. Party Home

Sections:

- Now Playing card.
- Your token balance.
- Search bar.
- Top locked tracks.
- Queue list.

### 3. Search

Elements:

- Search input.
- Recent searches.
- Track result cards.
- Add button.
- Explicit badge if relevant.

### 4. Queue

Track card should show:

- album art
- title
- artist
- rank
- score/vote count
- lock status
- boost/challenge buttons
- who added it

### 5. Tokens

Since MVP has no money, call them:

- Party Tokens
- Boost Tokens
- Challenge Tokens

Copy:

```text
You got tokens for joining. Use them wisely.
```

## Host App Screens

### 1. Spotify Connect

- Spotify auth button.
- Premium requirement explanation.
- Connected account status.

### 2. Create Session

- Session name.
- Lock duration.
- Initial token grants.
- Explicit content toggle.
- Proximity requirement toggle.
- Duplicate cooldown.

### 3. QR Display

- Large QR code.
- Join code.
- "Guests scan this to join"
- Live guest count.

### 4. Device Control

- Available Spotify devices.
- Active device.
- Transfer button.
- Runner status.

### 5. Host Dashboard

Panels:

- Now playing.
- Next locked tracks.
- Pending queue.
- Guest activity.
- Moderation alerts.
- Runner health.

Host actions:

- Pin.
- Veto.
- Remove.
- Start/stop runner.
- Skip.
- Pause/resume.

## Motion Guidelines

Use Framer Motion for:

- queue reordering
- lock/unlock animation
- token spend animation
- vote feedback
- now-playing pulse
- toast notifications

Avoid excessive motion during heavy queue updates.

## Accessibility

- Contrast must pass WCAG AA.
- Buttons must be large enough for mobile.
- Do not use color alone for status.
- Support reduced motion.
- All icons need accessible labels.
