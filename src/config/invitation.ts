/**
 * Single source of truth for every guest-facing value on the invitation.
 *
 * This is the ONLY file that needs to be edited to change names, dates, venue,
 * dress code or copy. Everything written between square brackets is a
 * placeholder that must be replaced before publishing.
 */

export interface Invitation {
  host: {
    /** Full legal name of the person the party is for. */
    fullName: string;
    /** Short name used for military-style callouts. */
    nickname: string;
    age: number;
  };
  event: {
    /** Full ISO 8601 timestamp WITH numeric offset, so the countdown parses deterministically. */
    dateISO: string;
    timeLabel: string;
    tzLabel: string;
    durationLabel: string;
  };
  venue: {
    name: string;
    address: string;
    city: string;
    mapUrl: string;
    notes: string;
  };
  rsvp: {
    /** Full ISO 8601 timestamp WITH numeric offset. */
    deadlineISO: string;
    deadlineLabel: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    whatsappUrl: string;
  };
  dressCode: {
    code: string;
    description: string;
  };
  /** What the host provides and what guests must bring. */
  logistics: {
    food: string;
    drinks: string;
  };
  copy: {
    codename: string;
    operationTitle: string;
    heroSubtitle: string;
    /** Fixed reveal line; do not rename. */
    selectedMessage: string;
    selectedMessageTail: string;
    briefingTitle: string;
    audioToggleOn: string;
    audioToggleOff: string;
  };
  /** Runtime switches: turn whole sections of the page on or off. */
  features: {
    matrixRain: boolean;
    audio: boolean;
    countdown: boolean;
    rsvp: boolean;
    /** Send confirmations to the host's Telegram instead of keeping them local. */
    telegram: boolean;
  };
}

export const invitation = {
  host: {
    fullName: 'Francisco Ballerio',
    nickname: 'fb',
    age: 23,
  },
  event: {
    dateISO: '2026-10-03T21:00:00-03:00',
    timeLabel: '21:00',
    tzLabel: 'UTC-03:00',
    durationLabel: 'hasta lo que pinte',
  },
  venue: {
    name: 'GEBA — Sede San Martín',
    address: 'Quinchos de afuera',
    city: 'Palermo, CABA',
    mapUrl: 'https://maps.google.com/?q=GEBA+Sede+San+Martin+Palermo+CABA',
    notes: 'Al fondo de las canchas de hockey',
  },
  rsvp: {
    // Both are still pending, so the briefing shows the bracket markers on purpose.
    deadlineISO: '',
    deadlineLabel: 'Viernes 15:00 Hs',
    contactName: 'A mi, a quien sino',
    contactPhone: '1130605247',
    contactEmail: 'fran.ballerio@gmail.com',
    whatsappUrl: 'https://web.whatsapp.com/',
  },
  dressCode: {
    code: 'Fachita bien piola',
    description: 'Como irias a tomar un cafe por palermo con tu galgo',
  },
  logistics: {
    food: 'Pernil y sandwichitos a la noche, en el club.',
    drinks: 'Traé lo que vayas a tomar. Algunas bebidas las pone el anfitrión.',
  },
  copy: {
    codename: 'OPERACIÓN CUMPLE DE FRAN',
    operationTitle: 'FRANCISCO BALLERIO CUMPLE 23',
    heroSubtitle:
      'Sábado 3 de octubre desde las 21, en los quinchos de afuera de GEBA San Martín. Traé lo que vayas a tomar.',
    selectedMessage: 'FUISTE SELECCIONADO',
    selectedMessageTail: 'Vení, no seas gorra.',
    briefingTitle: 'BRIEFING DE LA MISIÓN',
    audioToggleOn: 'SONIDO ACTIVADO',
    audioToggleOff: 'SONIDO SILENCIADO',
  },
  features: {
    matrixRain: true,
    // Audio is synthesized at runtime, so there is no asset to ship.
    audio: true,
    countdown: true,
    rsvp: true,
    // The RSVP endpoint needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in the
    // hosting environment; false keeps confirmations local to the browser.
    telegram: true,
  },
} satisfies Invitation;
