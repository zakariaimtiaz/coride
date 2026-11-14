import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  PageHeader,
  Skeleton,
} from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import {
  bdt,
  formatDate,
  formatRelative,
  paidByLabel,
  paymentMethodLabel,
} from "../lib/format.js";
import { isAdminRole, isSystemAdmin, roleLabel } from "../lib/roles.js";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function StatCard({ label, value, sub, tone = "slate", icon, className = "" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-rose-50 text-rose-600",
  };
  return (
    <Card className={`px-4 py-4 sm:px-5 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
            {label}
          </p>
          <p className="mt-1.5 truncate text-lg font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            {value}
          </p>
          {sub ? (
            <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-snug text-slate-500 sm:text-xs">
              {sub}
            </p>
          ) : null}
        </div>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tones[tone]}`}
        >
          <Icon name={icon} className="h-4.5 w-4.5" />
        </span>
      </div>
    </Card>
  );
}

function BalanceRow({ balance, currentUserId }) {
  const isYou = balance.userId === currentUserId;
  const net = balance.netPaisa;

  // The row already shows the member's name, so the badge only carries the
  // direction + amount — short enough to stay on one line on a 360px screen.
  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${isYou ? "bg-slate-50/80" : ""}`}
    >
      <Avatar name={balance.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">
          {balance.name}
          {isYou ? (
            <span className="ml-1.5 text-[11px] font-bold text-slate-400">
              (you)
            </span>
          ) : null}
        </p>
        <p className="text-xs text-slate-400">{roleLabel(balance.role)}</p>
      </div>

      {net === 0 ? (
        <Badge tone="slate" className="shrink-0 whitespace-nowrap">
          <Icon name="check" className="h-3 w-3" /> Settled
        </Badge>
      ) : net > 0 ? (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/15 sm:px-2.5 sm:text-xs">
          <Icon name="arrow-up-right" className="h-3.5 w-3.5" />
          is owed {bdt(net)}
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-700 ring-1 ring-inset ring-rose-600/15 sm:px-2.5 sm:text-xs">
          <Icon name="arrow-down-left" className="h-3.5 w-3.5" />
          owes {bdt(Math.abs(net))}
        </span>
      )}
    </li>
  );
}

function RideItem({ ride }) {
  return (
    <li className="flex gap-3 px-4 py-3.5 sm:px-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
        <Icon name="car" className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {ride.route ? (
              <p className="truncate text-sm font-semibold text-slate-800">
                {ride.route}
              </p>
            ) : null}
          </div>
          <p className="shrink-0 text-sm font-extrabold text-slate-900">
            {bdt(ride.amountPaisa)}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Icon name="wallet" className="h-3 w-3" /> Paid by{" "}
            {paidByLabel(ride)}
          </span>
          <span>
            {formatDate(ride.rideAt, { day: "numeric", month: "short" })}
          </span>
          <span>{ride.shares.length} sharing</span>
        </div>
      </div>
    </li>
  );
}

function SettlementItem({ settlement }) {
  const pending = settlement.status !== "acknowledged";
  return (
    <li className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
        <Icon name="send" className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">
          {settlement.from.name.split(" ")[0]} paid{" "}
          {settlement.to.name.split(" ")[0]}
        </p>
        <p className="truncate text-xs text-slate-500">
          {settlement.paymentMethodLabel ??
            paymentMethodLabel(settlement.paymentMethod)}{" "}
          ·{" "}
          <span
            className={
              pending
                ? "font-semibold text-amber-600"
                : "font-semibold text-emerald-600"
            }
          >
            {pending ? "awaiting confirmation" : "confirmed"}
          </span>{" "}
          · {formatRelative(settlement.settledAt)}
        </p>
      </div>
      <p className="shrink-0 text-sm font-extrabold text-slate-900">
        {bdt(settlement.amountPaisa)}
      </p>
    </li>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user.role);
  // Only the System Admin holds no balance — regular admins participate.
  const isSystem = isSystemAdmin(user.role);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    return api("/dashboard")
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !data) {
    return (
      <Card className="px-5 py-6">
        <p className="text-sm font-medium text-rose-600">{error}</p>
        <Button
          className="mt-3"
          variant="secondary"
          onClick={load}
          icon="refresh"
        >
          Try again
        </Button>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 w-full rounded-2xl lg:col-span-2" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const {
    month,
    balances,
    transfers = [],
    recentRides,
    recentSettlements,
    myNetPaisa,
  } = data;

  // Group the suggested payments by payer so each user's status reads
  // "Zakaria → Rafed, Zakaria → Masud, …". A user with nothing to pay (0 BDT)
  // never appears because they have no transfers.
  const payerGroups = [];
  const groupByPayer = new Map();
  for (const transfer of transfers) {
    let group = groupByPayer.get(transfer.from.id);
    if (!group) {
      group = { from: transfer.from, payments: [], totalPaisa: 0 };
      groupByPayer.set(transfer.from.id, group);
      payerGroups.push(group);
    }
    group.payments.push(transfer);
    group.totalPaisa += transfer.amountPaisa;
  }
  const myBalance = balances.find((b) => b.userId === user.id);
  const average = month.rideCount
    ? Math.round(month.rideTotalPaisa / month.rideCount)
    : 0;

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        subtitle={`${month.label} · ${month.rideCount} ride${month.rideCount === 1 ? "" : "s"} logged by the team`}
        action={
          isAdmin ? (
            <Link to="/admin" className="block sm:inline-block">
              <Button icon="shield" className="w-full sm:w-auto">
                Admin panel
              </Button>
            </Link>
          ) : (
            <div className="flex gap-2">
              <Link to="/rides" className="flex-1 sm:flex-none">
                <Button icon="plus" className="w-full sm:w-auto">
                  Log a ride
                </Button>
              </Link>
              <Link to="/settle" className="flex-1 sm:flex-none">
                <Button
                  variant="secondary"
                  icon="wallet"
                  className="w-full sm:w-auto"
                >
                  Pay due
                </Button>
              </Link>
            </div>
          )
        }
      />

      {/* Summary — 2-up on phones, 3-up from sm */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          className="col-span-2 sm:col-span-1"
          label="Pooled this month"
          value={bdt(month.rideTotalPaisa)}
          sub={
            month.rideCount
              ? `${month.rideCount} rides · avg ${bdt(average)}`
              : "No rides logged yet"
          }
          icon="receipt"
        />
        <StatCard
          label="Settled this month"
          value={bdt(month.settlementTotalPaisa)}
          sub={`${month.settlementCount} payment${month.settlementCount === 1 ? "" : "s"} recorded`}
          tone="green"
          icon="check"
        />
        <StatCard
          label="Your balance"
          value={bdt(Math.abs(myNetPaisa ?? 0))}
          sub={
            isSystem
              ? "System Admin account — no balance"
              : (myNetPaisa ?? 0) === 0
                ? "You are all settled up"
                : myNetPaisa > 0
                  ? `You are owed ${bdt(myNetPaisa)}`
                  : `You owe ${bdt(Math.abs(myNetPaisa))}`
          }
          tone={
            (myNetPaisa ?? 0) > 0
              ? "green"
              : (myNetPaisa ?? 0) < 0
                ? "red"
                : "slate"
          }
          icon={
            isSystem
              ? "shield"
              : (myNetPaisa ?? 0) < 0
                ? "arrow-down-left"
                : (myNetPaisa ?? 0) > 0
                  ? "arrow-up-right"
                  : "check"
          }
        />
      </div>

      {/* Balances + settle-up suggestions */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Who owes whom"
            subtitle="Live net balances across every logged ride and settlement"
            icon="users"
            action={
              <Link
                to="/settle"
                className="whitespace-nowrap text-xs font-bold text-slate-500 hover:text-slate-900"
              >
                Settle up →
              </Link>
            }
          />
          {balances.length === 0 ? (
            <EmptyState
              icon="car"
              title="No activity yet"
              description="Log the first ride and everyone's balance will appear here."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {balances.map((balance) => (
                <BalanceRow
                  key={balance.userId}
                  balance={balance}
                  currentUserId={user.id}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Suggested transfers"
            subtitle="Who pays whom"
            icon="send"
          />
          {payerGroups.length === 0 ? (
            <EmptyState
              icon="check"
              title="Everyone is settled up"
              description="No outstanding dues between colleagues right now."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {payerGroups.map((group) => (
                <li key={group.from.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex items-center gap-2.5">
                    <Avatar
                      name={group.from.name}
                      className="h-8 w-8 text-[11px]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-slate-800">
                        {group.from.name}
                      </p>
                      <p className="text-[11px] font-medium text-slate-400">
                        has to pay
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-rose-50 px-2 py-1 text-xs font-extrabold text-rose-700 ring-1 ring-inset ring-rose-600/15">
                      {bdt(group.totalPaisa)}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {group.payments.map((payment) => (
                      <li
                        key={payment.to.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
                      >
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-600">
                          <Icon
                            name="chevronRight"
                            className="h-3.5 w-3.5 shrink-0 text-slate-300"
                          />
                          <span className="truncate">{payment.to.name}</span>
                        </span>
                        <span className="shrink-0 text-xs font-extrabold text-slate-900">
                          {bdt(payment.amountPaisa)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
            <Link to="/settle">
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                icon="wallet"
              >
                Record a payment
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent rides"
            subtitle="Newest entries first"
            icon="car"
            action={
              <Link
                to="/rides"
                className="whitespace-nowrap text-xs font-bold text-slate-500 hover:text-slate-900"
              >
                View all →
              </Link>
            }
          />
          {recentRides.length === 0 ? (
            <EmptyState
              icon="car"
              title="No rides logged"
              description="The ledger starts with the first trip of the month."
              action={
                <Link to="/rides">
                  <Button size="sm" icon="plus">
                    Log a ride
                  </Button>
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentRides.map((ride) => (
                <RideItem key={ride.id} ride={ride} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Settlement history"
            subtitle="Payments between colleagues"
            icon="wallet"
            action={
              <Link
                to="/settle"
                className="whitespace-nowrap text-xs font-bold text-slate-500 hover:text-slate-900"
              >
                View all →
              </Link>
            }
          />
          {recentSettlements.length === 0 ? (
            <EmptyState
              icon="wallet"
              title="No settlements yet"
              description="When someone pays their due, it shows up here instantly."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentSettlements.map((settlement) => (
                <SettlementItem key={settlement.id} settlement={settlement} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {myBalance && myBalance.netPaisa < 0 ? (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 sm:flex-row sm:items-center">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-rose-600 ring-1 ring-rose-200">
            <Icon name="alert" className="h-4.5 w-4.5" />
          </span>
          <p className="flex-1 text-sm font-medium text-rose-800">
            You owe{" "}
            <strong className="font-extrabold">
              {bdt(Math.abs(myBalance.netPaisa))}
            </strong>{" "}
            for this group&apos;s rides.
          </p>
          <Link to="/settle">
            <Button variant="success" size="sm" icon="send">
              Pay due now
            </Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
