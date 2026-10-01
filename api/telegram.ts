/**
 * Server-side Telegram delivery for the RSVP endpoint.
 *
 * Vercel runs this on the Node.js runtime, where `process.env` exists. The
 * project intentionally ships no Node type definitions (and the brief forbids
 * adding a dependency), so the narrow slice of `process` this module needs is
 * declared locally instead of pulling in @types/node for two environment reads.
 */
declare const process: { env: Record<string, string | undefined> };

const DEFAULT_API_BASE = 'https://api.telegram.org';
const UPSTREAM_TIMEOUT_MS = 8000;

// Bot tokens look like `<numeric id>:<secret>`; chat ids are numeric and may be
// negative for groups. Rejecting anything else keeps a malformed value out of
// the upstream URL entirely.
const TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]+$/;
const CHAT_ID_PATTERN = /^-?\d+$/;

export interface TelegramConfig {
  token: string;
  chatId: string;
  apiBase: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Accepts the API-base override only over https or against loopback, so a
 * misconfigured value can never redirect the bot token to an arbitrary host.
 * Returns null for anything else, which the caller treats as missing config.
 */
function resolveApiBase(value: string | undefined): string | null {
  if (value === undefined) {
    return DEFAULT_API_BASE;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return DEFAULT_API_BASE;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol === 'https:') {
    return trimmed;
  }

  const isLoopbackHost =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '[::1]';
  if (parsed.protocol === 'http:' && isLoopbackHost) {
    return trimmed;
  }

  return null;
}

/**
 * Reads the server-only configuration. Returns null when a required value is
 * absent or malformed so the caller decides the public error surface; values are
 * never logged, echoed or forwarded beyond the upstream URL and body.
 */
export function readTelegramConfig(): TelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (token === undefined || !TOKEN_PATTERN.test(token)) {
    return null;
  }

  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (chatId === undefined || !CHAT_ID_PATTERN.test(chatId)) {
    return null;
  }

  const apiBase = resolveApiBase(process.env.TELEGRAM_API_BASE);
  if (apiBase === null) {
    return null;
  }

  return { token, chatId, apiBase };
}

/**
 * Sends one plain-text message. Returns true only on a 2xx response whose body
 * reports `ok: true`; every other outcome (network error, timeout, non-2xx,
 * unexpected body) is a single boolean failure so callers cannot leak details.
 */
export async function sendTelegramMessage(config: TelegramConfig, text: string): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBase}/bot${encodeURIComponent(config.token)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        // Plain text only: no parse_mode, so guest content can never be markup.
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return false;
  }

  if (!response.ok) {
    return false;
  }

  try {
    const body: unknown = await response.json();
    return isRecord(body) && body.ok === true;
  } catch {
    return false;
  }
}
