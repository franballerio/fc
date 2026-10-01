# Feature: cumple-matrix-landing

Birthday invitation landing page with a Matrix + military aesthetic, a scroll-driven
"YOU WERE SELECTED" reveal, and the invitation data.

- **Branch:** `feat/matrix-birthday-landing`
- **Status:** in progress
- **Owner:** el Gentleman (orchestrator)
- **Created:** 2026-10-01

## Decisions (from user)

| Question | Decision |
| --- | --- |
| Stack | Astro (static output, `src/pages/index.astro` + `src/components/*.astro`) |
| Aesthetic balance | 50/50 — Matrix visuals (phosphor green, CRT, code rain) + military copy (briefing, clearance, operation tags) |
| Invitation data | Not provided yet. All content lives in one single editable config module with obvious placeholders |
| Extras | Scroll reveal "FUISTE SELECCIONADO", event countdown, optional audio (boot + typing, muted by default), simulated RSVP form |

Non-goals:
- No real backend, database, email delivery, or RSVP persistence.
- No personal data capture sent anywhere.
- No deployment, push, or PR without an explicit user decision.

## Acceptance criteria

1. `pnpm build` produces a static `dist/` with no build errors and no TypeScript errors.
2. Editing exactly one module (`src/config/invitation.ts`) updates every invitation datum
   (host, age, date, time, place, address, RSVP deadline, contact) across the page.
3. Scrolling from the hero into the second section plays a decrypt/reveal sequence that ends
   with the literal Spanish message "FUISTE SELECCIONADO" fully legible.
4. The reveal is idempotent (scroll up/down does not duplicate nodes or leak timers) and is
   skipped in favor of an instant, fully legible final state under `prefers-reduced-motion: reduce`.
5. Countdown renders days/hours/minutes/seconds to the configured event date and degrades to a
   neutral message when the date is in the past or invalid.
6. The briefing section shows every invitation datum from the config.
7. The RSVP form validates required fields client-side and shows a terminal-style
   confirmation state; nothing leaves the browser.
8. Audio is muted by default and only starts after an explicit user toggle.
9. Lighthouse-observable basics: single `h1`, labeled form controls, visible focus states,
   decorative canvas marked `aria-hidden`.
10. The page is responsive from 360px to 1920px wide with no horizontal scroll.

## Tasks

- [x] T1 — Scaffold Astro project and tooling config
- [x] T2 — Single invitation config module with placeholders
- [x] T3 — Base layout and Matrix/military design system
- [x] T4 — Matrix code-rain background canvas
- [x] T5 — Scroll-driven "FUISTE SELECCIONADO" decrypt sequence
- [x] T6 — Event countdown
- [x] T7 — Military briefing section with invitation data
- [x] T8 — Simulated RSVP form
- [x] T9 — Optional audio (boot + typing) with toggle
- [x] T10 — Build verification, README and deploy notes

## Evidence log

| Task | Commit | Checks observed |
| --- | --- | --- |
| T1, T2 | `33bd516` chore: scaffold astro project with single-source invitation config | `npm run build` 1 page built; `npm run check` 0 errors / 0 warnings / 0 hints |
| T3, T4 | `f17dff8` feat: add matrix-military design system and code-rain background | `npm run build` green; no external host in `dist/` beyond the `example.invalid` placeholders |
| T5, T6 | `e96fa6d` feat: add scroll decrypt reveal and event countdown | `npm run build` green; `npm run check` 0 errors |
| T7, T8, T9 | `7088977` feat: add mission briefing, simulated rsvp and optional audio | `npm run build` green; `npm run check` 0 errors; `decrypt.ts`/`countdown.ts` inspected for double timezone shift |

Commit granularity note: this repository had no commits and no page before assembly, so
commits 1–3 are coherent file groups rather than independently buildable trees; the first
tree that can be built is `7088977`. Green-field single-page exception, recorded
intentionally instead of fabricating intermediate page versions.

Author identity note: the repository had no `user.name`/`user.email` and no `~/.gitconfig`.
Commits were authored with the repo-local synthetic identity `el Gentleman <gentleman@localhost>`
(`git config --local`) after two failed attempts to collect the real identity. Re-author with
`git rebase --root --exec 'git commit --amend --reset-author --no-edit'` once the real
name/email are available.

## Verification (T10)

Delegated to the read-only `gentle-ai-verify` agent (static audit: build, config-single-source,
inaccessibility, no-network, heading/label statics). Its report is still in flight; findings will be
reconciled into this section when it returns.

Independent runtime evidence gathered by the orchestrator with Google Chrome headless over CDP
(throwaway drivers in `/tmp`, repo untouched, `dist/` served read-only):

| Scenario | Observation | Verdict |
| --- | --- | --- |
| `npm run build` / `npm run check` | 1 page built; 0 errors / 0 warnings / 0 hints | PASS |
| Scroll decrypt, mid-way | `data-selected-state="armed"`, glyphs partly scrambled (`FUISTE SELECCトLセトシ3`), meter 60 %, tail still hidden | PASS |
| Scroll decrypt, end of wrapper | glyphs exactly `FUISTE SELECCIONADO`, meter 100 %, tail and `#briefing` CTA revealed | PASS |
| Accessible message | `#selected-title .sr-only` text is `FUISTE SELECCIONADO`, decorative glyph layer `aria-hidden` | PASS |
| `prefers-reduced-motion: reduce` | never armed; final message, tail and CTA visible at full opacity; no loop started | PASS |
| JavaScript disabled | never armed; final message, tail and CTA visible; countdown board hidden and the static date sentence promoted to visible text; RSVP form hidden and the `<noscript>` contact route visible | PASS |
| Countdown with the past placeholder date | board replaced by `El operativo ya está en marcha.`, no runaway interval | PASS |
| RSVP invalid submit | error summary visible with 4 items, 4 fields marked `aria-invalid`, focus moved to the summary | PASS |
| RSVP valid submit | form hidden, acknowledgement shows `OPERADOR REGISTRADO` with the typed name and the configured contacts, URL unchanged (nothing navigated, nothing sent) | PASS |
| Audio toggle | `aria-pressed` false by default; a real pointer click flips it true and back, hidden state label keeps the accessible name single; no console error or autoplay warning | PASS |
| Console during the whole run | no errors, no exceptions | PASS |

The only runtime checks not covered: true 360 px visual overlap of the katakana glyph cells, and
whether the sticky decrypt stage is broken by an ancestor `overflow`. Both need a human eyeball.

### Independent audit (read-only `gentle-ai-verify` agent)

Verdicts against the acceptance criteria, on the tree it re-baselined itself (HEAD `23015fd`):

| Criterion | Verdict | Note |
| --- | --- | --- |
| 1 build / typecheck | PASS | both commands exit 0 |
| 2 single source of content | PASS | all 27 config strings render; every remaining literal is UI chrome; no datum duplicated |
| 3 `FUISTE SELECCIONADO` integrity | PASS | literal appears exactly once in `dist`, inside the `sr-only` span of the `h2` |
| 4 no-JS and reduced-motion legibility | PASS | armed state provably unreachable in both; 19 glyph nodes before and after a second pass |
| 5 timezone / past date | PASS (past half) | `Date.parse` applies the offset once; future-date ticking UNVERIFIED |
| 6 briefing shows every datum | **FAIL** → fixed | event calendar date missing, `rsvp.deadlineISO` rendered nowhere |
| 7 no exfiltration | PASS | 6 same-origin GETs in the session; no `fetch`/`XHR`/`beacon` anywhere |
| 8 audio | PASS | `AudioContext` reachable only from the click handler |
| 9 accessibility statics | PASS | 1 `h1`, matching `label[for]`, focus ring on all 9 tab stops |
| 10 responsive 360→1920 | PASS | no element crosses the viewport edge at 6 widths |

The audit also reported that the source changed under it mid-run (the no-JS fix landed during
its first pass); it re-baselined and all verdicts above refer to `844be6e` sources.

### Defects found by the audit and their fixes

| ID | Defect | Fix |
| --- | --- | --- |
| D1 | Fixed audio control covered the hero date and the RSVP intro at 360 px | Document bottom reserve + icon-only collapse below 30 rem keeping the accessible name |
| D2 | Briefing omitted the calendar date; `rsvp.deadlineISO` was dead config | Both now render, through one shared `src/lib/datetime.ts` helper replacing three copies |
| D3 | `visibility: hidden` in the armed state removed the tail and CTA from the tab order and the a11y tree | `opacity: 0` plus a `:focus-within` escape hatch |
| D4 | The reduced-motion claim in a comment was not enforced in CSS | Armed rules wrapped in `@media not (prefers-reduced-motion: reduce)` |
| D5 | The page observer module was emitted after `</html>` | Moved to `src/scripts/reveal.ts` + `RevealObserver.astro`; script offset now before `</body>` |

All five are closed in `40c3625`. Re-run after the fixes: reveal, RSVP invalid/valid submit, audio
toggle, reduced-motion and no-JS paths all still PASS with zero console errors.

### Still unverified (needs a human or a future event date)

1. Countdown ticking with a **future** `event.dateISO` (the shipped placeholder short-circuits to
   the finished state, so the increment branch never runs).
2. Timer-leak freedom: idempotency was measured by node counts; leak freedom is code-read only.
3. Audio audibility with real output.
4. Screen-reader announcements with NVDA/JAWS/VoiceOver.
5. Non-Chromium engines (Safari/iOS, Firefox): `200svh` sticky stage, `1ch` glyph clipping,
   `@media not (…)` support.
6. A real Lighthouse/axe run (criterion 9 is phrased as Lighthouse-observable; only the
   underlying statics were checked).
7. Full-page visual composition at 1440/1920 px, and the 360 px glyph overlap.

## Open risks carried by the workers

- `public/og-placeholder.svg` is an SVG; most social platforms do not render SVG previews, so it
  should become a 1200×630 PNG/JPG before the link is shared.
- Katakana glyph cells are clipped at `1ch`, which can clip wide glyphs and wrap the message at 360 px.
- Fixed chrome can still overlay content mid-scroll; the reserve protects only the document tail.
- The RSVP form is a simulation by design: it stores nothing and notifies nobody. Delivering it to a
  real destination is a new decision with a privacy consequence, because the page currently
  promises guests that nothing leaves the browser.
- Without JavaScript the countdown board shows zeros; the real date stays visible in the meta line.
- Katakana glyph cells are clipped at `1ch`, which can clip wide glyphs and wrap the message at 360px.
