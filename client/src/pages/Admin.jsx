import { useCallback, useEffect, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  Input,
  PageHeader,
  Skeleton,
} from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { isSystemAdmin } from '../lib/roles.js';

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const STATUS_TONES = { pending: 'amber', approved: 'green', rejected: 'red' };

function RoleBadge({ role }) {
  if (role === 'system_admin') return <Badge tone="violet">System Admin</Badge>;
  if (role === 'admin') return <Badge tone="blue">Admin</Badge>;
  return null;
}

/* ------------------------------------------------------------ lists tab --- */

function MetaRow({ displayValue, hint, onSave, onDelete, onRestore, active, busy }) {
  const [text, setText] = useState(displayValue);
  const dirty = text.trim() !== displayValue;

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
      <div className="min-w-0 flex-1">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={`Edit ${displayValue}`}
        />
        {hint ? (
          <p className="mt-1 truncate text-[11px] font-medium text-slate-400">{hint}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        {!active ? <Badge tone="slate">Archived</Badge> : null}
        {dirty ? (
          <Button
            size="sm"
            variant="success"
            icon="check"
            loading={busy}
            onClick={() => onSave(text.trim())}
          >
            Save
          </Button>
        ) : null}
        {active ? (
          <Button size="sm" variant="danger" icon="trash" loading={busy} onClick={onDelete}>
            Delete
          </Button>
        ) : (
          <Button size="sm" variant="secondary" icon="refresh" loading={busy} onClick={onRestore}>
            Restore
          </Button>
        )}
      </div>
    </li>
  );
}

function ListsPanel() {
  const { push } = useToast();
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [newMethod, setNewMethod] = useState('');
  const [newRoute, setNewRoute] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    return api('/meta/manage')
      .then(setMeta)
      .catch((err) => push(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(kind, value, clear) {
    const label = value.trim();
    if (label.length < 2) return push('Enter at least 2 characters.', 'error');
    const body = kind === 'payment-methods' ? { label } : { name: label };
    try {
      const result = await api(`/meta/${kind}`, { method: 'POST', body });
      push(result.message || 'Added.');
      clear('');
      await load();
    } catch (err) {
      push(err.message, 'error');
    }
  }

  async function save(kind, id, body) {
    setBusyId(id);
    try {
      const result = await api(`/meta/${kind}/${id}`, { method: 'PUT', body });
      push(result.message || 'Saved.');
      await load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(kind, id) {
    setBusyId(id);
    try {
      const result = await api(`/meta/${kind}/${id}`, { method: 'DELETE' });
      push(result.message || 'Deleted.');
      await load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !meta) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Payment methods */}
      <Card>
        <CardHeader
          title="Payment methods"
          subtitle="Offered on the Pay-due form — cash, bank, bKash, Nagad, anything"
          icon="wallet"
        />
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Rocket"
              value={newMethod}
              onChange={(e) => setNewMethod(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  create('payment-methods', newMethod, setNewMethod);
                }
              }}
              aria-label="New payment method"
            />
            <Button
              size="md"
              icon="plus"
              className="shrink-0"
              onClick={() => create('payment-methods', newMethod, setNewMethod)}
            >
              Add
            </Button>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {(meta?.paymentMethods ?? []).map((method) => (
            <MetaRow
              key={method.id}
              displayValue={method.label}
              hint={`stored as “${method.value}”`}
              active={method.active}
              busy={busyId === method.id}
              onSave={(label) => save('payment-methods', method.id, { label })}
              onDelete={() => remove('payment-methods', method.id)}
              onRestore={() => save('payment-methods', method.id, { active: true })}
            />
          ))}
        </ul>
        <p className="px-4 py-3 text-[11px] leading-relaxed text-slate-400 sm:px-5">
          Deleting a method that&apos;s used by past payments hides it from the form instead — the
          history keeps its label.
        </p>
      </Card>

      {/* Routes */}
      <Card>
        <CardHeader
          title="Routes"
          subtitle="Suggestions on the ride form — Office to Home, Home to Office, …"
          icon="car"
        />
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Office to Market"
              value={newRoute}
              onChange={(e) => setNewRoute(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  create('routes', newRoute, setNewRoute);
                }
              }}
              aria-label="New route"
            />
            <Button
              size="md"
              icon="plus"
              className="shrink-0"
              onClick={() => create('routes', newRoute, setNewRoute)}
            >
              Add
            </Button>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {(meta?.routes ?? []).map((route) => (
            <MetaRow
              key={route.id}
              displayValue={route.name}
              active={route.active}
              busy={busyId === route.id}
              onSave={(name) => save('routes', route.id, { name })}
              onDelete={() => remove('routes', route.id)}
              onRestore={() => save('routes', route.id, { active: true })}
            />
          ))}
        </ul>
        <p className="px-4 py-3 text-[11px] leading-relaxed text-slate-400 sm:px-5">
          Members can still type any route — these are the quick suggestions.
        </p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ users tab --- */

export default function Admin() {
  const { push } = useToast();
  const { user: me } = useAuth();
  const iAmSystemAdmin = isSystemAdmin(me.role);

  const [view, setView] = useState('users');
  const [tab, setTab] = useState('pending');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return api(`/admin/users?status=${tab}`)
      .then((next) => setData(next))
      .catch((err) => push(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [tab, push]);

  useEffect(() => {
    if (view === 'users') load();
  }, [load, view]);

  async function act(id, action, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(id);
    try {
      const result = await api(`/admin/users/${id}/${action}`, { method: 'POST' });
      push(result.message || 'Updated.');
      await load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleRole(account) {
    const role = account.role === 'admin' ? 'member' : 'admin';
    const confirmText =
      role === 'member'
        ? `Remove admin rights from ${account.name}?`
        : `Make ${account.name} an admin? They will be able to approve new signups.`;
    if (!window.confirm(confirmText)) return;

    setBusyId(account.id);
    try {
      await api(`/admin/users/${account.id}/role`, { method: 'POST', body: { role } });
      push(
        role === 'admin'
          ? `${account.name} is now an admin.`
          : `${account.name} is now a member.`,
      );
      await load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(account) {
    const ok = window.confirm(
      `Reset ${account.name}'s password? A temporary password will be shown once.`,
    );
    if (!ok) return;
    setBusyId(account.id);
    try {
      const result = await api(`/admin/users/${account.id}/reset-password`, {
        method: 'POST',
      });
      window.alert(
        `Temporary password for ${result.user.name}:\n\n  ${result.temporaryPassword}\n\n` +
          'Share it with them — they should change it from Settings after logging in.',
      );
      push(result.message || 'Password reset.');
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(account) {
    if (!window.confirm(`Delete ${account.name} (${account.email})? This cannot be undone.`)) {
      return;
    }
    setBusyId(account.id);
    try {
      const result = await api(`/admin/users/${account.id}`, { method: 'DELETE' });
      push(result.message || 'Deleted.');
      await load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  const counts = data?.counts ?? { pending: 0, approved: 0, rejected: 0, total: 0 };
  const users = data?.users ?? [];

  return (
    <div>
      <PageHeader
        title="Admin panel"
        subtitle="Approve signups, manage roles and the shared lists"
        action={
          view === 'users' ? (
            <Button
              variant="secondary"
              icon="refresh"
              onClick={load}
              loading={loading}
              className="w-full sm:w-auto"
            >
              Refresh
            </Button>
          ) : null
        }
      />

      {/* Users / Lists — segmented control */}
      <div className="-mx-4 mb-4 px-4 sm:mx-0 sm:px-0">
        <div className="grid max-w-sm grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {[
            { key: 'users', label: 'Users', icon: 'users' },
            { key: 'lists', label: 'Lists', icon: 'wallet' },
          ].map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={`flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-bold transition ${
                view === v.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon name={v.icon} className="h-4 w-4" />
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'lists' ? (
        <ListsPanel />
      ) : (
        <>
          {/* Counts — 3-up, fits a phone without scrolling */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Pending', value: counts.pending, tone: 'text-amber-600', icon: 'clock' },
              { label: 'Approved', value: counts.approved, tone: 'text-emerald-600', icon: 'check' },
              { label: 'Rejected', value: counts.rejected, tone: 'text-rose-600', icon: 'x' },
            ].map((stat) => (
              <Card key={stat.label} className="px-3 py-3.5 text-center sm:px-4">
                <span
                  className={`mx-auto grid h-9 w-9 place-items-center rounded-xl bg-slate-100 ${stat.tone}`}
                >
                  <Icon name={stat.icon} className="h-4.5 w-4.5" />
                </span>
                <p className="mt-2 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                  {stat.value}
                </p>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {stat.label}
                </p>
              </Card>
            ))}
          </div>

          {counts.pending > 0 && tab !== 'pending' ? (
            <button
              type="button"
              onClick={() => setTab('pending')}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition hover:bg-amber-100/70"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-amber-600 ring-1 ring-amber-200">
                <Icon name="clock" className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-amber-800">
                  {counts.pending} registration{counts.pending === 1 ? '' : 's'} waiting for
                  approval
                </span>
                <span className="block text-xs text-amber-600/80">Tap to review them</span>
              </span>
              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-amber-500" />
            </button>
          ) : null}

          {/* Tabs — horizontally scrollable on narrow screens */}
          <div className="mt-4 -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-1 rounded-xl bg-slate-100 p-1">
              {TABS.map((t) => {
                const active = tab === t.key;
                const badgeCount = t.key === 'all' ? counts.total : counts[t.key];
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`flex h-11 items-center gap-1.5 rounded-lg px-3.5 text-sm font-bold transition sm:px-4 ${
                      active
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t.label}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                        active ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'
                      }`}
                    >
                      {badgeCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Card className="mt-4">
            <CardHeader
              title={`${TABS.find((t) => t.key === tab)?.label} accounts`}
              subtitle="Approve, reject, reset passwords or manage roles"
              icon="users"
            />

            {loading ? (
              <div className="space-y-3 px-4 py-4 sm:px-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : users.length === 0 ? (
              <EmptyState
                icon="users"
                title={tab === 'pending' ? 'No pending requests' : `No ${tab} accounts`}
                description={
                  tab === 'pending'
                    ? 'When someone registers, their request appears here for approval.'
                    : 'Nothing to show for this filter.'
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {users.map((account) => {
                  const isSys = account.role === 'system_admin';
                  const isMe = account.id === me.id;
                  return (
                    <li
                      key={account.id}
                      className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar name={account.name} />
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-bold text-slate-800">
                            <span className="truncate">{account.name}</span>
                            <RoleBadge role={account.role} />
                            {isSys ? (
                              <Badge tone="slate">fixed · undeletable</Badge>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-slate-500">{account.email}</p>
                          <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                            Requested {formatDate(account.createdAt)}
                            {account.approvedAt
                              ? ` · approved ${formatDate(account.approvedAt)}`
                              : ''}
                          </p>
                        </div>
                        <span className="ml-auto shrink-0 self-start sm:hidden">
                          <Badge tone={STATUS_TONES[account.status]}>
                            {account.status === 'pending'
                              ? 'Pending'
                              : account.status === 'approved'
                                ? 'Active'
                                : 'Rejected'}
                          </Badge>
                        </span>
                      </div>

                      <div className="hidden shrink-0 sm:block">
                        <Badge tone={STATUS_TONES[account.status]}>
                          {account.status === 'pending'
                            ? 'Pending'
                            : account.status === 'approved'
                              ? 'Active'
                              : 'Rejected'}
                        </Badge>
                      </div>

                      {/* Actions wrap onto their own row on phones.
                          The System Admin row has none — it is built in. */}
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        {!isSys && account.status !== 'approved' ? (
                          <Button
                            size="sm"
                            variant="success"
                            icon="check"
                            loading={busyId === account.id}
                            onClick={() => act(account.id, 'approve')}
                          >
                            {account.status === 'rejected' ? 'Reinstate' : 'Approve'}
                          </Button>
                        ) : null}

                        {!isSys && !isMe && account.status !== 'rejected' ? (
                          <Button
                            size="sm"
                            variant="danger"
                            icon="x"
                            loading={busyId === account.id}
                            onClick={() =>
                              act(
                                account.id,
                                'reject',
                                `Reject ${account.name}'s registration? They can apply again later.`,
                              )
                            }
                          >
                            Reject
                          </Button>
                        ) : null}

                        {/* Role toggle: anyone approved can be demoted, but
                            only the System Admin can grant admin rights. */}
                        {!isSys && !isMe && account.status === 'approved' ? (
                          account.role === 'admin' ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon="shield"
                              loading={busyId === account.id}
                              onClick={() => toggleRole(account)}
                            >
                              Demote
                            </Button>
                          ) : iAmSystemAdmin ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon="shield"
                              loading={busyId === account.id}
                              onClick={() => toggleRole(account)}
                            >
                              Make admin
                            </Button>
                          ) : null
                        ) : null}

                        {iAmSystemAdmin && !isSys && !isMe ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon="key"
                            loading={busyId === account.id}
                            onClick={() => resetPassword(account)}
                          >
                            Reset password
                          </Button>
                        ) : null}

                        {!isSys && !isMe ? (
                          <Button
                            size="sm"
                            variant="danger"
                            icon="trash"
                            loading={busyId === account.id}
                            onClick={() => removeUser(account)}
                          >
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
