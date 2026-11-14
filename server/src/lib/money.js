/**
 * Money helpers.
 *
 * The API works exclusively in *paisa* (integer minor units) so that no float
 * arithmetic ever touches a stored balance: 1 BDT = 100 paisa.
 * The frontend converts BDT ⇄ paisa at the edges; the server only validates.
 */

/** Validate/coerce an incoming amount that is already expressed in paisa. Returns null when invalid. */
export function toPaisa(value) {
  if (value === null || value === undefined || value === '') return null;
  const n =
    typeof value === 'number' ? value : Number(String(value).replace(/[^\d.+-]/g, ''));
  if (!Number.isFinite(n)) return null;
  const paisa = Math.round(n);
  return paisa > 0 ? paisa : null;
}

/** Format paisa as a human readable amount, e.g. 45000 → "450 BDT", 45050 → "450.50 BDT". */
export function formatBdt(paisa) {
  const value = (paisa ?? 0) / 100;
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} BDT`;
}
