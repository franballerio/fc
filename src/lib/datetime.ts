/**
 * Calendar-date formatting shared by every component that renders an ISO date.
 *
 * The date parts are read from the literal ISO text and formatted in UTC, so a
 * string that carries its own numeric offset never shifts a day depending on
 * the timezone of the machine that builds the site.
 */

const DEFAULT_LOCALE = 'es-AR';

/**
 * Formats the calendar date of an ISO 8601 string as a long local-style label.
 *
 * Returns the original string unchanged when the leading `YYYY-MM-DD` text
 * cannot be read as a date, so an owner typo degrades to raw text instead of
 * throwing during the build.
 */
export function formatCalendarDate(iso: string, locale: string = DEFAULT_LOCALE): string {
  const [datePart = ''] = iso.split('T');
  const [yearText = '', monthText = '', dayText = ''] = datePart.split('-');

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const parseable =
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31;

  if (!parseable) {
    return iso;
  }

  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(year, month - 1, day));
}
