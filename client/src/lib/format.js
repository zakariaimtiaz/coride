/** Formatting helpers. Amounts arrive from the API as integer paisa (1 BDT = 100 paisa). */

/** Fallback list — the live lists come from GET /api/meta (admin-managed). */
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
];

export function paymentMethodLabel(value, methods = PAYMENT_METHODS) {
  if (!value) return 'Cash';
  return (
    methods.find((m) => m.value === value)?.label ??
    value.charAt(0).toUpperCase() + value.slice(1)
  );
}

export function bdt(paisa, { signed = false } = {}) {
  const value = Math.round((paisa ?? 0)) / 100;
  const abs = Math.abs(value);
  const text = abs.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(abs) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  const sign = signed ? (paisa > 0 ? '+' : paisa < 0 ? '−' : '') : paisa < 0 ? '−' : '';
  return `${sign}${text} BDT`;
}

/** BDT string → integer paisa (what the API expects). */
export function toPaisa(value) {
  const n = Number(String(value ?? '').replace(/[^\d.+-]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/**
 * "Paid by" label for a ride: one name for a single payer,
 * "Imtiaz 200 BDT, Rafed 200 BDT" when several members split the bill.
 */
export function paidByLabel(ride) {
  const payers = ride?.payers?.length ? ride.payers : ride?.paidBy ? [ride.paidBy] : [];
  return payers
    .map((p) =>
      payers.length > 1
        ? `${p.name.split(' ')[0]} ${bdt(p.amountPaisa ?? 0)}`
        : p.name.split(' ')[0],
    )
    .join(', ');
}

export function toDate(input) {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(input, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = toDate(input);
  return d ? d.toLocaleDateString('en-GB', opts) : '—';
}

export function formatDateTime(input) {
  const d = toDate(input);
  if (!d) return '—';
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(
    'en-GB',
    { hour: '2-digit', minute: '2-digit' },
  )}`;
}

export function formatRelative(input) {
  const d = toDate(input);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(d, { day: 'numeric', month: 'short' });
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/** Local "YYYY-MM-DDTHH:mm" for datetime-local inputs. */
export function localInputValue(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Deterministic, muted avatar colour per member. */
const AVATAR_TONES = [
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-sky-100 text-sky-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
];

export function avatarTone(seed = '') {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}
