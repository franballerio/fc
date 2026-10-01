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
- pnpm 12 (the version is pinned in `package.json` under `packageManager`, so
  Corepack and Vercel both use it). `package-lock.json` is intentionally absent:
  pnpm is the only package manager for this repository.

## Quick start

```bash
pnpm install
pnpm dev        # local dev server with hot reload
pnpm build      # static output into dist/
pnpm preview    # serve the built output locally
pnpm check      # astro check: types and template diagnostics
```

CI and Vercel run `pnpm install --frozen-lockfile`. Run the same command locally
before pushing a dependency change: it fails if `pnpm-lock.yaml` and
`package.json` disagree, instead of silently resolving a different tree.

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

1. `astro.config.mjs` already points `site` at the production domain, which is what
   builds the absolute canonical, `og:url` and `og:image` URLs. Change it if the
   invitation moves to another domain. `public/og-image.png` is the 1200×630 social
   preview card: regenerate it (headless screenshot of a 1200×630 page, then
   `magick … -strip -colors 256`) when the headline or the date changes, and keep it
   under roughly 300 KB so messaging apps render it.
2. Run `pnpm build`.
3. Publish the `dist/` directory:

```bash
npx netlify deploy --prod --dir dist     # Netlify
npx vercel deploy --prod                 # Vercel (whole project, so /api ships too)
# GitHub Pages: publish dist/ from your CI workflow
```

Any static server works too: without the function the page loads normally and the
RSVP form falls back to the contact channels instead of delivering.

**Vercel notes.** Deploy the project root, not just `dist/`, so the `api/` Function
is included. Vercel reads `pnpm-lock.yaml` and runs `pnpm install --frozen-lockfile`
using the version pinned in `packageManager`; do not leave a `package-lock.json`
behind, or Vercel switches back to npm. `pnpm-workspace.yaml` holds the pnpm
settings (it is not only for monorepos) and sets `allowBuilds: esbuild: false`:
esbuild's platform binary ships as an optional dependency, so skipping its
postinstall script is safe and keeps third-party install scripts from running.
Set the Telegram variables described below for Production, Preview and Development.

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
repository ignores `.env`, `.env.*` (except `.env.example`), `.envrc*`, `.vercel/`
and common editor backups (`*~`, `#*#`, `.#*`); the host environment is the only
place the real values should live.

### 5. Test locally against a fake

`TELEGRAM_API_BASE` exists so the endpoint can be exercised without touching a real
chat. Point it at a local fake that accepts `POST /bot<token>/sendMessage` and returns
`{"ok":true}`. The override is accepted only over `https://` or against loopback
(`http://127.0.0.1`, `http://localhost`, `http://[::1]`, any port); anything else is
treated as missing configuration and answers `500 unavailable` without an upstream
call:

```bash
TELEGRAM_BOT_TOKEN=123456:test-token TELEGRAM_CHAT_ID=1 TELEGRAM_API_BASE=http://localhost:8787 npx vercel dev
```

### 6. Anti-spam limits

The endpoint filters obvious bot traffic silently and bounds every field:

- same-origin guard: a request whose `Origin` does not match the request host, and
  that sends no `Sec-Fetch-Site: same-origin`, is answered `403 forbidden`;
- honeypot field: any non-empty value is treated as spam;
- minimum fill time: `elapsedMs` below 1500 ms is treated as spam;
- field caps: name ≤ 80, drinks ≤ 80, contact ≤ 120, message ≤ 400;
- single-line fields are normalized so a newline cannot forge an extra labelled line
  in the Telegram message; the optional message keeps intentional line breaks but
  loses control characters and repeated blank lines;
- the bot token and chat id are shape-checked (`<digits>:<secret>` and an optional
  minus sign plus digits) and a malformed value answers `500 unavailable`;
- request body capped at 8 KB (`413` from the declared length before buffering, or
  after reading when a chunked request omits it), `application/json` and `POST` only.

Both spam checks answer `200` and send nothing. Their body is
`{"ok":true,"delivered":false}`, which the page reads to avoid showing a false
confirmation, without revealing which guard fired. A genuine delivery answers
`{"ok":true}`.

The same-origin guard raises the cost only for casual scripted abuse. `elapsedMs`
is supplied by the client and is therefore cosmetic, and an `Origin` header is
trivial to forge outside a browser. The effective next steps are a per-IP rate
limit at the edge or
[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) in front of the
form.

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
  same-origin `/api/rsvp`; if that request fails or the server reports it delivered
  nothing, the page falls back to the contact channels. With the flag off, the
  acknowledgement is rendered locally and nothing leaves the browser.
- Audio is on by default. Because browsers refuse to start sound outside a user
  gesture, the control ships already pressed and the drone starts at the guest's
  first tap, click or key press anywhere on the page. If the browser still
  refuses, the control drops to the silenced state and says so. The control
  itself steps aside when JavaScript is off, since it could never work.

## Notes

- The RSVP form stores nothing. With `features.telegram` off (or a host without the
  function) it only renders the acknowledgement locally; when on, it forwards the
  confirmation to the configured Telegram chat. Contacts in the acknowledgement are
  always available as a manual fallback.
- `odd/tasks/cumple-matrix-landing.md` tracks the build decisions and evidence.
