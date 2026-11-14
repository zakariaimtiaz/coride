/** Role helpers — the three roles: System Admin (built in) → Admin → Member. */

export function isAdminRole(role) {
  return role === 'admin' || role === 'system_admin';
}

export function isSystemAdmin(role) {
  return role === 'system_admin';
}

export function roleLabel(role) {
  if (role === 'system_admin') return 'System Admin';
  if (role === 'admin') return 'Admin';
  return 'Member';
}
