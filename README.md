# Birthday Invitation Landing

A single-page birthday invitation with a Matrix-meets-military aesthetic: phosphor
green CRT treatment, a scrolling code-rain background, a scroll-driven decrypt that
reveals **"FUISTE SELECCIONADO"**, an event countdown, a briefing dossier and a
simulated RSVP form.

Static output, no backend, no external requests, no tracking. Everything runs in the
guest's browser.

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
  rsvp: true,       // simulated RSVP form
  audio: true,      // optional synthesized audio toggle
}
```

A disabled feature removes its section from the built page entirely.

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
npx vercel deploy --prod dist            # Vercel
# GitHub Pages: publish dist/ from your CI workflow
```

Any static server works too: `dist/` has no server-side requirement.

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
```

## How the page degrades

The page is written to stay readable without JavaScript:

- The reveal message ships finished in the markup. The script only scrambles a
  decorative glyph layer while you scroll, and it arms itself only when it can
  actually animate.
- Every animation is disabled under `prefers-reduced-motion: reduce`; decorative
  layers are `aria-hidden` and the code-rain canvas renders one static frame.
- The RSVP form validates in the browser with real labels, `aria-invalid` and an
  error summary. Nothing is sent anywhere — the acknowledgement is rendered locally.
- Audio is muted by default and only starts inside the guest's click.

## Notes

- The RSVP form is a simulation: it stores nothing and notifies nobody. Contacts in
  the acknowledgement are how guests actually confirm.
- `odd/tasks/cumple-matrix-landing.md` tracks the build decisions and evidence.
