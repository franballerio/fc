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
  };
}

export const invitation = {
  host: {
    fullName: '[NOMBRE COMPLETO DEL CUMPLEAÑERO]',
    nickname: '[APODO]',
    age: 0,
  },
  event: {
    dateISO: '2000-01-01T00:00:00-03:00',
    timeLabel: '[HORA, EJ: 21:00]',
    tzLabel: '[ZONA HORARIA, EJ: UTC-03:00]',
    durationLabel: '[DURACIÓN, EJ: 4 HORAS]',
  },
  venue: {
    name: '[NOMBRE DEL LUGAR]',
    address: '[CALLE Y NÚMERO]',
    city: '[BARRIO, CIUDAD]',
    mapUrl: 'https://example.invalid/mapa',
    notes: '[NOTAS DE ACCESO, EJ: TIMBRE 3B]',
  },
  rsvp: {
    deadlineISO: '2000-01-01T00:00:00-03:00',
    deadlineLabel: '[FECHA LÍMITE DE CONFIRMACIÓN]',
    contactName: '[NOMBRE DEL CONTACTO]',
    contactPhone: '[TELÉFONO]',
    contactEmail: '[EMAIL]',
    whatsappUrl: 'https://example.invalid/whatsapp',
  },
  dressCode: {
    code: '[CÓDIGO DE VESTIMENTA]',
    description: '[DESCRIPCIÓN DE LA VESTIMENTA]',
  },
  copy: {
    codename: 'OPERACIÓN [NOMBRE CLAVE]',
    operationTitle: '[TÍTULO DE LA OPERACIÓN]',
    heroSubtitle: '[BAJADA DEL HERO: UNA LÍNEA SOBRE LA MISIÓN]',
    selectedMessage: 'FUISTE SELECCIONADO',
    selectedMessageTail: '[FRASE QUE SIGUE A LA SELECCIÓN]',
    briefingTitle: '[TÍTULO DEL BRIEFING]',
    audioToggleOn: '[ETIQUETA CON EL AUDIO ACTIVADO]',
    audioToggleOff: '[ETIQUETA CON EL AUDIO APAGADO]',
  },
  features: {
    matrixRain: true,
    // Audio is synthesized at runtime, so there is no asset to ship.
    audio: true,
    countdown: true,
    rsvp: true,
  },
} satisfies Invitation;
