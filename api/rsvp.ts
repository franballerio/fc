/**
 * RSVP delivery endpoint (Vercel Function, Node.js runtime).
 *
 * The site is static `output: 'static'`; this file is deployed by Vercel as a
 * standalone Function using the Web Standard `fetch` export shape, so no
 * adapter and no build change is required. It is same-origin with the page, so
 * no CORS headers are added on purpose.
 */
import { readTelegramConfig, sendTelegramMessage } from './telegram.ts';

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

export default {
  async fetch(request: Request): Promise<Response> {
    return handle(request);
  },
};
