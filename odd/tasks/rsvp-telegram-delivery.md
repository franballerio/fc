# Feature: rsvp-telegram-delivery

Deliver RSVP confirmations to the host's Telegram instead of keeping them inside the
guest's browser.

- **Branch:** `feat/matrix-birthday-landing` (same branch, new work unit)
- **Status:** in progress
- **Owner:** el Gentleman (orchestrator)
- **Created:** 2026-10-01

## Decisions (from user)

| Question | Decision |
| --- | --- |
| Hosting | Vercel |
| Backend | Accepted — a server-side endpoint may exist |
| Bot token custody | The host (the user) creates the bot with @BotFather and stores the token as a Vercel environment variable. The token is never pasted in chat and never enters the repository. |

## Architecture

```
invitado -> POST /api/rsvp (misma origin, Vercel Function)
             -> api.telegram.org/bot<TOKEN>/sendMessage
```

- Endpoint: `api/rsvp.ts` at the repository root. Vercel deploys any file inside `/api`
  as a Function with the `fetch` Web Standard export
  (`export default { fetch(request: Request) }`), with no adapter and no change to
  `output: 'static'`. Verified against the Vercel docs for the Node.js runtime.
- Same-origin request, so no CORS headers are added on purpose.
- Secret: `TELEGRAM_BOT_TOKEN` environment variable, server-side only.
- Destination: `TELEGRAM_CHAT_ID` environment variable.
- `TELEGRAM_API_BASE` is overridable (defaults to `https://api.telegram.org`) so the
  endpoint can be tested end to end against a fake Telegram without touching real chats.

### Why not call the Bot API from the browser

Verified against the live API: `api.telegram.org` returns `access-control-allow-origin: *`,
so the browser *could* reach it directly (the `OPTIONS` preflight returns 501, so a
safelisted content type would be required). CORS is not the blocker. Secret custody is:
a token shipped in the client bundle lets anyone use the bot, read `getUpdates`, send
messages as it, or hijack its webhook.

## Acceptance criteria

1. `npm run build` and `npm run check` stay green; `output: 'static'` is unchanged.
2. `invitation.features.telegram === false` reproduces today's behaviour exactly: a local
   acknowledgement and zero network requests.
3. With the flag on and the environment configured, a valid submit produces exactly one
   `sendMessage` call to the configured chat carrying name, what the guest will bring to drink,
   contact and the optional message, and the page acknowledges delivery.
4. A filled honeypot produces no Telegram call.
5. A submit faster than the minimum human delay produces no Telegram call.
6. Missing or invalid environment produces a generic failure response: no token, no
   environment value and no stack trace in the body or in the logs.
7. A Telegram failure returns a failure status and the page falls back to the local
   acknowledgement with the contact channels, so the guest's confirmation is never lost.
8. No secret in the repository: `.env` variants are gitignored, no token literal anywhere.
9. Input is bounded and typed server-side: JSON only, length caps on every field, guest
   count as an integer inside the configured range.
10. The guest-facing copy no longer claims that nothing leaves the browser.

Non-goals: no database, no persistence, no analytics, no retry queue, no CAPTCHA
(Turnstile is documented as the next step if the honeypot proves insufficient), no email.

## Tasks

- [x] T1 — `api/rsvp.ts`: validation, spam guards, Telegram send, safe error surface
- [x] T2 — Wire the form: feature flag, timeout, sending/delivered/fallback states
- [x] T3 — Honest copy, feature flag in config, environment gitignore safety
- [x] T4 — README deploy section: environment, chat id, local test path
- [x] T5 — Local end-to-end verification and independent security review
- [x] T6 — Swap the guest-count field for "what are you going to bring to drink?"
- [ ] T7 — Host actions before sharing the link (see below; not code)

## Evidence log

| Task | Commit | Checks observed |
| --- | --- | --- |
| T1–T4 | `150a3ef` feat: deliver rsvp confirmations to telegram through a vercel function | `npm run build` green, `output: 'static'`; `npm run check` 0 errors; browser E2E against a loopback fake Telegram |
| T5 | same commit | Independent `gentle-ai-verify` security audit: no blocker; findings F1–F7 fixed in the same commit |
| T6 | same commit | Browser E2E re-run: upstream text carries `Trae para tomar:` and no `Acompañantes:`; empty submit exposes the new field error linked to `#rsvp-drinks` |

## End-to-end verification (orchestrator, real Chrome over CDP)

A throwaway driver serves `dist/` plus `api/rsvp.ts` through a same-origin adapter and points
`TELEGRAM_API_BASE` at a fake Telegram on loopback, then drives the real page.

| Scenario | Observed |
| --- | --- |
| Valid submit | `200 {ok:true}`; exactly one upstream `sendMessage` with the composed plain text; UI shows `TRANSMISIÓN ENTREGADA` |
| Honeypot filled | `200 {ok:true,delivered:false}`; zero upstream calls |
| Submit faster than the minimum fill time | `200 {ok:true,delivered:false}`; zero upstream calls |
| Telegram returns 500 | `502 {ok:false,error:"upstream"}`; the page shows the fallback with the contact channels |
| `TELEGRAM_BOT_TOKEN` missing | `500 {ok:false,error:"unavailable"}`; zero upstream calls; the page shows the fallback |
| Empty form submit | Error summary with four entries, the drinks entry linked to `#rsvp-drinks`; `aria-invalid` on name, drinks, contact and the confirmation checkbox |
| Console during the whole run | No errors, no exceptions |

The same-origin guard was the highest-risk change of the hardening pass: it is on the path of
every real guest submit. Verified in the browser that a normal submit is not answered `403`.

## Independent security review

No blocker. Report highlights: the token can only come from the server environment and reaches
neither `dist/`, nor a response body, nor a log line (the single log line is the value-free
`rsvp:missing_config`); no client injection sink exists (the guest name is written with
`textContent`); Telegram I/O is provably gated behind the drop and validation branches; the copy
in all four rendering modes matches the code.

Findings fixed: newline forgery inside the plain-text Telegram message (F1), the silent drop
claiming delivery to a real guest (F2), `.gitignore` blind to `.env~`, `#.env#`, `.envrc*` and
`.vercel/` (F3), an unvalidated token/chat id and an unencoded URL (F4), an unconstrained
`TELEGRAM_API_BASE` (F5), the body limit checked only after buffering (F6), and the missing
same-origin check (F7).

Accepted residual risk, documented in the README: `elapsedMs` is client-supplied, so the spam
guards are cosmetic against a script; the effective next step is a per-IP limit or Turnstile.

## T7 — Host actions before sharing the link

1. Create the bot with @BotFather, message it once (a bot cannot open the chat), then read the
   chat id from `getUpdates`.
2. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the Vercel project for Production,
   Preview and Development. Without them every submit answers `500` and the guest only sees the
   fallback with the contact channels.
3. `rsvp.deadlineISO` is currently an empty string, so the briefing shows the label alone. Fill
   it with a full ISO timestamp if the exact date should be printed.
4. `rsvp.whatsappUrl` is `https://web.whatsapp.com/`, which opens WhatsApp but not a chat with
   the host. A `https://wa.me/<phone in international format>` link is what the fallback copy
   expects.
5. Publish from the project root (`npx vercel deploy --prod`), not from `dist/`, or the function
   is left behind. Remove the untracked `pnpm-lock.yaml` or adopt pnpm deliberately: Vercel
   prefers it over `package-lock.json`.
