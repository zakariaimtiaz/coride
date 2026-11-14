/**
 * Remember the last email used to log in on THIS browser (localStorage).
 *
 * Only the email is ever stored — never the password. The login form
 * pre-fills it so returning users type just their password; the ✕ button
 * (or simply editing the field) forgets it for the next person.
 */

const KEY = "coride.lastEmail";

// Permissive shape check — any local-part@host, including .local/.ngo
// domains used by this app. Trims + lowercases first.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

function normalize(email) {
  const value = String(email ?? "").trim().toLowerCase();
  return EMAIL_SHAPE.test(value) ? value : "";
}

/** The remembered email, or "" if none / invalid / storage unavailable. */
export function getLastEmail() {
  try {
    return normalize(localStorage.getItem(KEY));
  } catch {
    return ""; // storage blocked (private mode, disabled site data, …)
  }
}

/** Remember an email after a successful login. Non-email values clear it. */
export function setLastEmail(email) {
  const value = normalize(email);
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    /* best-effort — never block login on storage quirks */
  }
}

/** Forget the remembered email (✕ on the login form). */
export function clearLastEmail() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
