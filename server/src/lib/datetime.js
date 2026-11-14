/**
 * Date helpers.
 *
 * Ride/settlement timestamps are stored as *local naive* strings
 * ("YYYY-MM-DDTHH:mm") because the app models a single office in a single
 * timezone. Machine timestamps (created_at) stay in ISO-8601 UTC.
 */

const pad = (n) => String(n).padStart(2, '0');

/** Format a Date (or parse a string) into the local naive format used by the DB. */
export function toLocalNaive(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Current local timestamp in the stored format. */
export function nowLocalNaive() {
  return toLocalNaive(new Date());
}

/** Current local month key, e.g. "2026-11" — matches substr(ride_at, 1, 7). */
export function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** "2026-11" → "November 2026" */
export function monthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return monthKey;
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
