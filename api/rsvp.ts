/**
 * RSVP delivery endpoint (Vercel Function, Node.js runtime).
 *
 * The site is static `output: 'static'`; this file is deployed by Vercel as a
 * standalone Function using the Web Standard `fetch` export shape, so no
 * adapter and no build change is required. It is same-origin with the page, so
 * no CORS headers are added on purpose.
 */
/*
 * Telegram delivery is defined at the bottom of this same file on purpose:
 * Vercel transpiles each file inside `api/` on its own rather than bundling it,
 * so a relative import of a TypeScript sibling survives compilation and fails at
 * runtime with ERR_MODULE_NOT_FOUND. A second file under `api/` would also be
 * published as its own public route. One self-contained file avoids both.
 */

const MAX_BODY_BYTES = 8192;

export const MIN_ELAPSED_MS = 1500;
export const MAX_ELAPSED_MS = 21_600_000; // 6 hours

const NAME_MAX = 80;
const DRINKS_MAX = 80;
const CONTACT_MAX = 120;
const MESSAGE_MAX = 400;

export interface RsvpPayload {
  name: string;
  drinks: string;
  contact: string;
  message: string;
  elapsedMs: number;
}

export type ValidationResult =
  | { ok: true; value: RsvpPayload }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Control characters in a single-line field would let it forge a new labelled
// line in the composed Telegram text, so every run is collapsed to one space.
function normalizeSingleLine(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  return value.replace(/[\r\n\t\u0000-\u001F\u007F]+/g, ' ').trim();
}

// The optional message keeps intentional line breaks but loses control noise
// and repeated blank lines that could also be used to fake structure.
function normalizeMessage(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]+/g, '')
    .trim();
}

/**
 * Pure validation, exported so it can be unit-tested from Node without the
 * network. Unknown extra properties are ignored and never returned.
 */
export function validatePayload(input: unknown): ValidationResult {
  if (!isRecord(input)) {
    return { ok: false, error: 'payload' };
  }

  const name = normalizeSingleLine(input.name);
  if (name === null || name.length < 1 || name.length > NAME_MAX) {
    return { ok: false, error: 'name' };
  }

  const drinks = normalizeSingleLine(input.drinks);
  if (drinks === null || drinks.length < 1 || drinks.length > DRINKS_MAX) {
    return { ok: false, error: 'drinks' };
  }

  const contact = normalizeSingleLine(input.contact);
  if (contact === null || contact.length < 1 || contact.length > CONTACT_MAX) {
    return { ok: false, error: 'contact' };
  }

  let message = '';
  if (input.message !== undefined && input.message !== null) {
    const parsedMessage = normalizeMessage(input.message);
    if (parsedMessage === null || parsedMessage.length > MESSAGE_MAX) {
      return { ok: false, error: 'message' };
    }
    message = parsedMessage;
  }

  const elapsedMs = input.elapsedMs;
  if (
    typeof elapsedMs !== 'number' ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < MIN_ELAPSED_MS ||
    elapsedMs > MAX_ELAPSED_MS
  ) {
    return { ok: false, error: 'elapsedMs' };
  }

  return { ok: true, value: { name, drinks, contact, message, elapsedMs } };
}

/**
 * Silent spam guard. A bot that fills the honeypot or answers faster than the
 * minimum human delay is answered like a success and sent nothing, so it cannot
 * learn why it was dropped.
 */
export function isSilentDrop(input: unknown): boolean {
  if (!isRecord(input)) {
    return false;
  }

  const honeypot = input.honeypot;
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return true;
  }

  const elapsedMs = input.elapsedMs;
  return (
    typeof elapsedMs === 'number' &&
    Number.isFinite(elapsedMs) &&
    elapsedMs >= 0 &&
    elapsedMs < MIN_ELAPSED_MS
  );
}

function composeMessage(payload: RsvpPayload): string {
  const lines = [
    'Nueva confirmación de asistencia',
    `Nombre: ${payload.name}`,
    `Trae para tomar: ${payload.drinks}`,
    `Contacto: ${payload.contact}`,
  ];

  if (payload.message !== '') {
    lines.push(`Mensaje: ${payload.message}`);
  }

  return lines.join('\n');
}

const JSON_HEADERS: Record<string, string> = { 'Content-Type': 'application/json' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * Cheap same-origin guard. A browser form POST always carries either an
 * `Origin` matching the request host or `Sec-Fetch-Site: same-origin`; a
 * scripted client that sends neither is rejected before any body work.
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== '') {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return false;
    }

    const requestHost = request.headers.get('host') ?? new URL(request.url).host;
    return originHost.toLowerCase() === requestHost.toLowerCase();
  }

  return request.headers.get('sec-fetch-site') === 'same-origin';
}

async function handle(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'method' });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().trimStart().startsWith('application/json')) {
    return jsonResponse(415, { ok: false, error: 'content-type' });
  }

  if (!isSameOrigin(request)) {
    return jsonResponse(403, { ok: false, error: 'forbidden' });
  }

  // Reject an oversized body from its declared length before buffering it; the
  // post-read check below still covers chunked requests without the header.
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const declared = Number(declaredLength);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return jsonResponse(413, { ok: false, error: 'payload' });
    }
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return jsonResponse(400, { ok: false, error: 'invalid' });
  }

  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return jsonResponse(413, { ok: false, error: 'payload' });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { ok: false, error: 'invalid' });
  }

  // Spam guard: answer 200 and stop before any validation or delivery work. The
  // `delivered: false` flag lets the page avoid a false confirmation without
  // telling a bot which guard fired.
  if (isSilentDrop(parsed)) {
    return jsonResponse(200, { ok: true, delivered: false });
  }

  const result = validatePayload(parsed);
  if (!result.ok) {
    // Field names are machine-readable and never echo submitted values.
    const body =
      result.error === 'payload'
        ? { ok: false, error: 'invalid' }
        : { ok: false, error: 'invalid', fields: [result.error] };
    return jsonResponse(400, body);
  }

  const config = readTelegramConfig();
  if (config === null) {
    console.error('rsvp:missing_config');
    return jsonResponse(500, { ok: false, error: 'unavailable' });
  }

  const delivered = await sendTelegramMessage(config, composeMessage(result.value));
  if (!delivered) {
    return jsonResponse(502, { ok: false, error: 'upstream' });
  }

  return jsonResponse(200, { ok: true });
}

/*
 * `process.env` exists on the Node.js runtime. The project ships no Node type
 * definitions, so the narrow slice used here is declared locally instead of
 * pulling in @types/node for two environment reads.
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

export default {
  async fetch(request: Request): Promise<Response> {
    return handle(request);
  },
};
