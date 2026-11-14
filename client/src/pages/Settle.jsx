import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { bdt, formatDateTime, localInputValue, paymentMethodLabel, PAYMENT_METHODS, toPaisa } from '../lib/format.js';
import { isAdminRole, isSystemAdmin } from '../lib/roles.js';

function SettlementRow({
  settlement,
  currentUserId,
  currentRole,
  onDelete,
  deleting,
  onAcknowledge,
  acknowledging,
}) {
  const canDelete = settlement.recordedBy === currentUserId || isAdminRole(currentRole);
  const isRecipient = settlement.to.id === currentUserId;
  const pending = settlement.status !== 'acknowledged';
  const canAcknowledge = isRecipient && pending;
  const methodLabel = settlement.paymentMethodLabel ?? paymentMethodLabel(settlement.paymentMethod);

  return (
    <li className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
        <Icon name="send" className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">
              {settlement.from.name.split(' ')[0]} → {settlement.to.name.split(' ')[0]}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">
              {formatDateTime(settlement.settledAt)}
            </p>
          </div>
          <p className="shrink-0 text-base font-extrabold text-slate-900">
            {bdt(settlement.amountPaisa)}
          </p>
        </div>

        {/* Method + status sit on one wrapping line so a 360px screen stays tidy */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone="blue">{methodLabel}</Badge>
          {pending ? (
            <Badge tone="amber">
              <Icon name="clock" className="h-3 w-3" /> Awaiting confirmation
            </Badge>
          ) : (
            <Badge tone="green">
              <Icon name="check" className="h-3 w-3" /> Confirmed
            </Badge>
          )}
        </div>

        {/* Status detail — who confirmed, and via what */}
        <p className="mt-1.5 break-words text-xs leading-relaxed text-slate-500">
          {pending
            ? isRecipient
              ? `${settlement.from.name.split(' ')[0]} paid via ${methodLabel.toLowerCase()} — confirm you received it.`
              : `Sent via ${methodLabel.toLowerCase()} · waiting for ${settlement.to.name.split(' ')[0]} to confirm.`
            : `Confirmed by ${settlement.to.name.split(' ')[0]} on ${formatDateTime(settlement.acknowledgedAt)}`}
        </p>

        <div className="mt-2 flex flex-wrap gap-3">
          {canAcknowledge ? (
            <button
              type="button"
              disabled={acknowledging}
              onClick={() => onAcknowledge(settlement)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              <Icon name="check" className="h-3.5 w-3.5" />
              {acknowledging ? 'Confirming…' : 'I received this'}
            </button>
          ) : null}

          {canDelete ? (
            <button
              type="button"
              disabled={deleting}
              onClick={() => onDelete(settlement)}
              className="inline-flex h-9 items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-rose-600 disabled:opacity-50"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
              Undo payment
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default function Settle() {
  const { user } = useAuth();
  const { push } = useToast();
  // Regular admins settle dues like members — only the System Admin is barred.
  const isSystem = isSystemAdmin(user.role);

  const [dashboard, setDashboard] = useState(null);
  const [members, setMembers] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState(PAYMENT_METHODS);
  const [loading, setLoading] = useState(true);

  const [toUser, setToUser] = useState('');
  const [amountText, setAmountText] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [settledAt, setSettledAt] = useState(() => localInputValue(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [ackId, setAckId] = useState(null);

  const load = useCallback(() => {
    return Promise.all([api('/dashboard'), api('/users'), api('/settlements?limit=50'), api('/meta')])
      .then(([dash, usersData, settlementsData, meta]) => {
        setDashboard(dash);
        setMembers(usersData.users);
        setSettlements(settlementsData.settlements);
        if (meta.paymentMethods?.length) setPaymentMethods(meta.paymentMethods);
      })
      .catch((err) => push(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  const myNetPaisa = dashboard?.myNetPaisa ?? 0;
  const balances = dashboard?.balances ?? [];
  const transfers = dashboard?.transfers ?? [];

  // Payments I still owe, and who I owe them to.
  const myDebts = useMemo(
    () => transfers.filter((t) => t.from.id === user.id),
    [transfers, user.id],
  );

  // Pick the suggested creditor as the default recipient.
  useEffect(() => {
    if (!toUser && myDebts.length > 0) setToUser(String(myDebts[0].to.id));
  }, [myDebts, toUser]);

  const receivables = useMemo(
    () => transfers.filter((t) => t.to.id === user.id),
    [transfers, user.id],
  );

  // Incoming payments I haven't confirmed yet (I am the pay-to user).
  const pendingMyConfirmations = useMemo(
    () => settlements.filter((s) => s.to.id === user.id && s.status !== 'acknowledged'),
    [settlements, user.id],
  );

  const amountPaisa = toPaisa(amountText);

  // Keep the selection valid when the admin changes the available methods.
  useEffect(() => {
    if (paymentMethods.length > 0 && !paymentMethods.some((m) => m.value === paymentMethod)) {
      setPaymentMethod(paymentMethods[0].value);
    }
  }, [paymentMethods, paymentMethod]);

  function paySuggested(transfer) {
    setToUser(String(transfer.to.id));
    setAmountText((transfer.amountPaisa / 100).toFixed(2));
    setFormError(null);
    document.getElementById('pay-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);

    if (!toUser) return setFormError('Choose who you are paying.');
    if (Number(toUser) === user.id) return setFormError('You cannot pay yourself.');
    if (!amountPaisa) return setFormError('Enter the amount you paid.');

    setSubmitting(true);
    try {
      await api('/settlements', {
        method: 'POST',
        body: {
          toUser: Number(toUser),
          amountPaisa,
          paymentMethod,
          settledAt,
        },
      });
      push(`Payment of ${bdt(amountPaisa)} recorded — awaiting ${receiver?.name?.split(' ')[0] ?? 'their'} confirmation.`);
      setAmountText('');
      setSettledAt(localInputValue(new Date()));
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcknowledge(settlement) {
    setAckId(settlement.id);
    try {
      const { settlement: updated } = await api(`/settlements/${settlement.id}/acknowledge`, {
        method: 'POST',
      });
      push(`Confirmed — ${bdt(updated.amountPaisa)} from ${updated.from.name} received.`);
      await load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setAckId(null);
    }
  }

  async function handleDelete(settlement) {
    const ok = window.confirm(
      `Undo the ${bdt(settlement.amountPaisa)} payment from ${settlement.from.name} to ${settlement.to.name}?`,
    );
    if (!ok) return;
    setDeletingId(settlement.id);
    try {
      await api(`/settlements/${settlement.id}`, { method: 'DELETE' });
      push('Payment removed.');
      await load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-5">
          <Skeleton className="h-80 w-full rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 w-full rounded-2xl lg:col-span-3" />
        </div>
      </div>
    );
  }

  const owes = myNetPaisa < 0;
  const receiver = members.find((m) => m.id === Number(toUser));
  const pendingConfirmCount = settlements.filter((s) => s.status !== 'acknowledged').length;

  return (
    <div>
      <PageHeader
        title="Pay due"
        subtitle="Record a payment and everyone's balance updates instantly"
        action={
          <Link to="/" className="block sm:inline-block">
            <Button variant="secondary" icon="home" className="w-full sm:w-auto">
              Dashboard
            </Button>
          </Link>
        }
      />

      {/* Payments waiting for MY confirmation — the pay-to user's action item */}
      {pendingMyConfirmations.length > 0 ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-amber-600 ring-1 ring-amber-200">
              <Icon name="clock" className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-800">
                {pendingMyConfirmations.length} payment
                {pendingMyConfirmations.length === 1 ? '' : 's'} waiting for your confirmation
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-700/90">
                {pendingMyConfirmations
                  .map((s) => `${s.from.name.split(' ')[0]} → ${bdt(s.amountPaisa)}`)
                  .join(' · ')}{' '}
                — confirm in the history below once you've received the money.
              </p>
            </div>
            <button
              type="button"
              onClick={() => document.getElementById('settlement-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-amber-700 shadow-sm ring-1 ring-amber-200 transition hover:text-amber-900"
            >
              Review
            </button>
          </div>
        </div>
      ) : null}

      {/* Balance summary — full width on mobile */}
      <Card
        className={`mb-4 overflow-hidden ${
          owes
            ? 'border-rose-200 bg-gradient-to-br from-rose-50 to-white'
            : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
        }`}
      >
        <div className="flex flex-wrap items-center gap-4 px-4 py-5 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Your net balance
            </p>
            <p
              className={`mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl ${
                owes ? 'text-rose-600' : myNetPaisa > 0 ? 'text-emerald-600' : 'text-slate-900'
              }`}
            >
              {bdt(Math.abs(myNetPaisa))}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {isSystem
                ? 'The System Admin oversees the ledger — it never holds a balance.'
                : owes
                  ? 'You owe the group — settle it below.'
                  : myNetPaisa > 0
                    ? 'You are owed money. Colleagues will pay you.'
                    : 'You are all settled up 🎉'}
            </p>
          </div>

          <span
            className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${
              owes ? 'bg-white text-rose-500 ring-1 ring-rose-200' : 'bg-white text-emerald-500 ring-1 ring-emerald-200'
            }`}
          >
            <Icon
              name={owes ? 'arrow-down-left' : myNetPaisa > 0 ? 'arrow-up-right' : 'check'}
              className="h-7 w-7"
            />
          </span>
        </div>

        {receivables.length > 0 ? (
          <div className="border-t border-slate-100/80 px-4 py-3 sm:px-6">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Waiting on others
            </p>
            <div className="flex flex-wrap gap-2">
              {receivables.map((transfer, index) => (
                <span
                  key={`${transfer.from.id}-${index}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-200"
                >
                  <Avatar name={transfer.from.name} className="h-5 w-5 text-[9px]" />
                  {transfer.from.name.split(' ')[0]} owes you {bdt(transfer.amountPaisa)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* --- Pay due form -------------------------------------------- */}
        <Card className="lg:col-span-2" id="pay-form">
          <CardHeader
            title="Record a payment"
            subtitle={isSystem ? 'The System Admin does not move money' : 'Cash, bKash, Nagad — anything'}
            icon="wallet"
          />

          {isSystem ? (
            <div className="px-4 pb-5 pt-4 sm:px-5">
              <EmptyState
                icon="shield"
                title="The System Admin doesn't hold balances"
                description="Members and admins record their own payments. You can review and undo any settlement in the history."
              />
            </div>
          ) : owes ? (
            myDebts.length > 0 ? (
              <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Suggested
                </p>
                <div className="space-y-2">
                  {myDebts.map((transfer, index) => (
                    <button
                      key={`${transfer.to.id}-${index}`}
                      type="button"
                      onClick={() => paySuggested(transfer)}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-left transition hover:border-slate-900 hover:bg-white"
                    >
                      <Avatar name={transfer.to.name} className="h-8 w-8 text-[11px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-800">
                          Pay {transfer.to.name.split(' ')[0]}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          clears your full balance
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-extrabold text-slate-900">
                        {bdt(transfer.amountPaisa)}
                      </span>
                      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-slate-300" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null
          ) : (
            <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
              <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-medium leading-relaxed text-emerald-700">
                <Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  You have no outstanding dues. You can still record a payment below if you paid a
                  colleague directly.
                </span>
              </div>
            </div>
          )}

          {isSystem ? null : (
          <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4 sm:px-5">
            {formError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                {formError}
              </div>
            ) : null}

            <Field label="Pay to" htmlFor="toUser">
              <Select
                id="toUser"
                value={toUser}
                onChange={(e) => setToUser(e.target.value)}
                disabled={members.length <= 1}
              >
                <option value="">Select a colleague…</option>
                {members
                  .filter((m) => m.id !== user.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label="Amount" htmlFor="payAmount" hint={receiver ? `Paying ${receiver.name}` : undefined}>
              <div className="relative">
                <Input
                  id="payAmount"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  className="h-14 pl-4 pr-16 text-2xl font-extrabold tracking-tight"
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold text-slate-400">
                  BDT
                </span>
              </div>
            </Field>

            <div className="grid gap-4">
              <Field label="Date" htmlFor="settledAt">
                <Input
                  id="settledAt"
                  type="datetime-local"
                  value={settledAt}
                  onChange={(e) => setSettledAt(e.target.value)}
                />
              </Field>

              <Field
                label="Payment method"
                htmlFor="paymentMethod"
                hint="How you actually sent the money."
              >
                <Select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  {paymentMethods.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Button
              type="submit"
              size="lg"
              loading={submitting}
              disabled={!owes && !amountPaisa}
              className="w-full"
              icon="send"
            >
              Record payment
            </Button>
          </form>
          )}
        </Card>

        {/* --- History --------------------------------------------------- */}
        <Card className="lg:col-span-3" id="settlement-history">
          <CardHeader
            title="Settlement history"
            subtitle={`${settlements.length} payment${settlements.length === 1 ? '' : 's'} recorded${
              pendingConfirmCount > 0 ? ` · ${pendingConfirmCount} awaiting confirmation` : ''
            }`}
            icon="receipt"
          />
          {settlements.length === 0 ? (
            <EmptyState
              icon="wallet"
              title="No payments yet"
              description="Once someone clears a balance it appears here for the whole group."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {settlements.map((settlement) => (
                <SettlementRow
                  key={settlement.id}
                  settlement={settlement}
                  currentUserId={user.id}
                  currentRole={user.role}
                  onDelete={handleDelete}
                  deleting={deletingId === settlement.id}
                  onAcknowledge={handleAcknowledge}
                  acknowledging={ackId === settlement.id}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {balances.length > 0 ? (
        <Card className="mt-4">
          <CardHeader title="Full ledger" subtitle="Every member's current net position" icon="users" />
          <ul className="divide-y divide-slate-100">
            {balances.map((balance) => (
              <li key={balance.userId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar name={balance.name} className="h-8 w-8 text-[11px]" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">
                  {balance.name}
                  {balance.userId === user.id ? (
                    <span className="ml-1.5 text-[11px] font-bold text-slate-400">(you)</span>
                  ) : null}
                </span>
                {balance.netPaisa === 0 ? (
                  <Badge tone="slate">Settled</Badge>
                ) : balance.netPaisa > 0 ? (
                  <Badge tone="green">is owed {bdt(balance.netPaisa)}</Badge>
                ) : (
                  <Badge tone="red">owes {bdt(Math.abs(balance.netPaisa))}</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
