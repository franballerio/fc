# Birthday Invitation Landing

A single-page birthday invitation with a Matrix-meets-military aesthetic: phosphor
green CRT treatment, a scrolling code-rain background, a scroll-driven decrypt that
reveals **"FUISTE SELECCIONADO"**, an event countdown, a briefing dossier and an
RSVP form.

Static output. The RSVP form can deliver confirmations to the host's Telegram through
a small same-origin server function; every other effect runs in the guest's browser.
No tracking.

## Requirements

- Node.js 20 or newer (developed on 22)
- npm

## Quick start

```bash
npm install
npm run dev        # local dev server with hot reload
npm run build      # static output into dist/
npm run preview    # serve the built output locally
npm run check      # astro check: types and template diagnostics
```

## Edit your invitation

**All guest-facing data lives in one file: [`src/config/invitation.ts`](src/config/invitation.ts).**

Every value between square brackets is a placeholder. Replace them:

| Field group | What it controls |
| --- | --- |
| `host` | Name, nickname and age of the birthday person |
| `event.dateISO` | Countdown target. Full ISO 8601 **with the numeric offset**, e.g. `2026-03-14T21:00:00-03:00` |
| `event.timeLabel` / `tzLabel` / `durationLabel` | Human-readable time shown in the hero and briefing |
| `venue` | Name, address, city, map link and access notes |
| `rsvp` | Confirmation deadline, contact name, phone, email and WhatsApp link |
| `dressCode` | Dress code label and description |
| `logistics` | What the host provides and what guests must bring (rendered in the briefing) |
| `copy` | Codename, operation title, subtitles and the reveal message |
| `features` | Per-section on/off switches |

`copy.selectedMessage` is the exact reveal line `FUISTE SELECCIONADO`. Change it if you
want, but it is the sentence the whole scroll effect is built around.

### Turn sections off

`features` in the config controls what the page renders:

```ts
features: {
  matrixRain: true, // code-rain canvas background
  countdown: true,  // countdown to event.dateISO
  rsvp: true,       // RSVP form
  audio: true,      // optional synthesized audio toggle
  telegram: true,   // deliver confirmations to Telegram (needs env vars, see below)
}
```

A disabled feature removes its section from the built page entirely. With
`telegram: false` the RSVP form stays local: it renders the acknowledgement in the
browser and never calls the endpoint.

## Deploy

The build is plain static files, so any static host works.

1. Set the real URL in `astro.config.mjs` (`site: 'https://example.invalid'`) so the
   canonical and Open Graph tags are correct. Also replace `public/og-placeholder.svg`
   with a real image (PNG or JPG, 1200×630) and point `og:image` at it — most social
   platforms do not render SVG previews.
2. Run `npm run build`.
3. Publish the `dist/` directory:

```bash
npx netlify deploy --prod --dir dist     # Netlify
npx vercel deploy --prod                 # Vercel (whole project, so /api ships too)
# GitHub Pages: publish dist/ from your CI workflow
```

Any static server works too: without the function the page loads normally and the
RSVP form falls back to the contact channels instead of delivering.

**Vercel notes.** Deploy the project root, not just `dist/`, so the `api/` Function
is included. Vercel selects the package manager by lockfile priority and prefers
`pnpm-lock.yaml` over `package-lock.json` when both exist, so remove the extra
lockfile or adopt pnpm deliberately. Set the Telegram variables described below for
Production, Preview and Development.

## Telegram notifications

With `features.telegram` enabled, the RSVP form posts the confirmation to the
same-origin `api/rsvp.ts` Function, which forwards it to a Telegram chat through the
Bot API. Secrets stay server-side; the page never sees the token.

### 1. Create the bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts; BotFather replies with the bot token.
   Treat it as a password.

### 2. Start the chat

A bot cannot start a conversation. The host account that should receive
confirmations must message the bot first (send it any text, for example `/start`);
otherwise `sendMessage` fails with "chat not found".

### 3. Read the chat id

- Message the bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and
  read `result[].message.chat.id`.
- Group chats use a **negative** id (for example `-1001234567890`); personal chats
  use a positive one. Copy the exact number.

### 4. Set the environment variables (Vercel)

In the Vercel project, go to **Settings → Environment Variables** and add the values
for **Production**, **Preview** and **Development**:

| Name | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | the token from BotFather |
| `TELEGRAM_CHAT_ID` | the numeric chat id |
| `TELEGRAM_API_BASE` | optional, defaults to `https://api.telegram.org` |

Never commit the token, paste it into an issue, or put it in `.env.example`. The
repository ignores `.env` and `.env.*`; the host environment is the only place the
real values should live.

### 5. Test locally against a fake

`TELEGRAM_API_BASE` exists so the endpoint can be exercised without touching a real
chat. Point it at a local fake that accepts `POST /bot<token>/sendMessage` and returns
`{"ok":true}`:

```bash
TELEGRAM_BOT_TOKEN=test TELEGRAM_CHAT_ID=1 TELEGRAM_API_BASE=http://localhost:8787 npx vercel dev
```

### 6. Anti-spam limits

The endpoint filters obvious bot traffic silently and bounds every field:

- honeypot field: any non-empty value is treated as spam;
- minimum fill time: `elapsedMs` below 1500 ms is treated as spam;
- field caps: name ≤ 80, contact ≤ 120, message ≤ 400, guests an integer 0–10;
- request body capped at 8 KB, `application/json` and `POST` only.

Both spam checks answer with the same success response as a real delivery, so a bot
cannot learn it was filtered. If spam still gets through, the next step is
[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/).

## Project structure

```
src/
  config/invitation.ts     single source of truth for content
  layouts/BaseLayout.astro document head, meta tags, skip link
  pages/index.astro        page assembly and scroll-reveal observer
  components/              Hero, SelectedReveal, Countdown, Briefing, Rsvp,
                           AudioToggle, MatrixRain, SiteFooter
  scripts/                 progressive-enhancement scripts (matrix rain, decrypt,
                           countdown, audio)
  styles/                  design tokens and global utilities
public/                    favicon and Open Graph placeholder
api/                       Vercel Functions (RSVP → Telegram delivery)
```

## How the page degrades

The page is written to stay readable without JavaScript:

- The reveal message ships finished in the markup. The script only scrambles a
  decorative glyph layer while you scroll, and it arms itself only when it can
  actually animate.
- Every animation is disabled under `prefers-reduced-motion: reduce`; decorative
  layers are `aria-hidden` and the code-rain canvas renders one static frame.
- The RSVP form validates in the browser with real labels, `aria-invalid` and an
  error summary. With `features.telegram` enabled, only a valid submit posts to the
  same-origin `/api/rsvp`; if that request fails, the page falls back to the contact
  channels. With the flag off, the acknowledgement is rendered locally and nothing
  leaves the browser.
- Audio is muted by default and only starts inside the guest's click.

## Notes

- The RSVP form stores nothing. With `features.telegram` off (or a host without the
  function) it only renders the acknowledgement locally; when on, it forwards the
  confirmation to the configured Telegram chat. Contacts in the acknowledgement are
  always available as a manual fallback.
- `odd/tasks/cumple-matrix-landing.md` tracks the build decisions and evidence.
