import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Icon,
  Input,
  PageHeader,
} from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { roleLabel } from '../lib/roles.js';

function RoleBadge({ role }) {
  if (role === 'system_admin') return <Badge tone="violet">System Admin</Badge>;
  if (role === 'admin') return <Badge tone="blue">Admin</Badge>;
  return <Badge tone="slate">Member</Badge>;
}

export default function Settings() {
  const { user } = useAuth();
  const { push } = useToast();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (!current) return setError('Enter your current password.');
    if (next.length < 6) return setError('New password must be at least 6 characters.');
    if (next !== confirm) return setError('New passwords do not match.');
    if (next === current) return setError('Choose a password different from your current one.');

    setSaving(true);
    try {
      const result = await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      push(result.message || 'Password updated.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Your account and password"
        action={
          <Badge tone="slate" className="sm:hidden">
            {roleLabel(user.role)}
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Account summary */}
        <Card className="lg:col-span-2">
          <CardHeader title="Account" icon="users" />
          <div className="flex items-center gap-3.5 px-4 py-4 sm:px-5">
            <Avatar name={user.name} className="h-12 w-12 text-sm" />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-bold text-slate-800">
                <span className="truncate">{user.name}</span>
                <RoleBadge role={user.role} />
              </p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                {roleLabel(user.role)} · joined {formatDate(user.createdAt)}
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 px-4 py-3 text-[11px] leading-relaxed text-slate-400 sm:px-5">
            {user.role === 'system_admin'
              ? 'Built-in System Admin: this account cannot be rejected, demoted or deleted, and resets other people’s passwords.'
              : user.role === 'admin'
                ? 'Admins approve signups, manage roles and the shared lists.'
                : 'Members log rides, split expenses and record payments.'}
          </div>
        </Card>

        {/* Change password */}
        <Card className="lg:col-span-3">
          <CardHeader
            title="Change password"
            subtitle="Requires your current password"
            icon="lock"
          />
          <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4 sm:px-5">
            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                {error}
              </div>
            ) : null}

            <Field label="Current password" htmlFor="currentPassword">
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="New password" htmlFor="newPassword" hint="At least 6 characters.">
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              </Field>

              <Field label="Confirm new password" htmlFor="confirmPassword">
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </Field>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" icon="check" loading={saving}>
                Update password
              </Button>
              <p className="hidden text-xs text-slate-400 sm:block">
                Forgot it? The System Admin can reset it for you.
              </p>
            </div>
            <p className="text-xs text-slate-400 sm:hidden">
              Forgot it? The System Admin can reset it for you.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
