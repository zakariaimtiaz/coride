import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  Skeleton,
} from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { api } from "../lib/api.js";
import {
  bdt,
  formatDateTime,
  localInputValue,
  paidByLabel,
  toPaisa,
} from "../lib/format.js";
import { isAdminRole, isSystemAdmin } from "../lib/roles.js";

/** Same rounding rule as the server: whole paisa, remainder goes to the first people. */
function equalShares(amountPaisa, participantIds) {
  if (!amountPaisa || participantIds.length === 0) return [];
  const base = Math.floor(amountPaisa / participantIds.length);
  let remainder = amountPaisa - base * participantIds.length;
  return participantIds.map((userId) => ({
    userId,
    sharePaisa: base + (remainder-- > 0 ? 1 : 0),
  }));
}

/** Split the fare across the selected payers (same remainder rule) → { id: "123.45" }. */
function distributePayers(payerIds, totalPaisa) {
  const map = {};
  if (payerIds.length === 0) return map;
  if (!totalPaisa || totalPaisa <= 0) {
    for (const id of payerIds) map[id] = "";
    return map;
  }
  const base = Math.floor(totalPaisa / payerIds.length);
  let remainder = totalPaisa - base * payerIds.length;
  for (const id of payerIds) {
    map[id] = ((base + (remainder-- > 0 ? 1 : 0)) / 100).toFixed(2);
  }
  return map;
}

function ParticipantChip({ share }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
      <span className="truncate">{share.name.split(" ")[0]}</span>
      <span className="shrink-0 text-slate-400">{bdt(share.sharePaisa)}</span>
    </span>
  );
}

function RideCard({ ride, currentUserId, currentRole, onDelete, deleting }) {
  const canDelete =
    ride.createdBy === currentUserId || isAdminRole(currentRole);

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
          <Icon name="car" className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {ride.route ? (
                <p className="truncate text-sm font-bold text-slate-800">
                  {ride.route}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 text-base font-extrabold tracking-tight text-slate-900">
              {bdt(ride.amountPaisa)}
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Icon name="wallet" className="h-3 w-3" />
              Paid by {paidByLabel(ride)}
            </span>
            <span>{formatDateTime(ride.rideAt)}</span>
            {ride.splitMethod === "custom" ? (
              <Badge tone="blue">Custom split</Badge>
            ) : null}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {ride.shares.map((share) => (
              <ParticipantChip key={share.userId} share={share} />
            ))}
          </div>

          {canDelete ? (
            <button
              type="button"
              disabled={deleting}
              onClick={() => onDelete(ride)}
              className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-rose-600 disabled:opacity-50"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
              Delete entry
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default function Rides() {
  const { user } = useAuth();
  const { push } = useToast();
  // Regular admins log rides like members — only the System Admin is oversight-only.
  const isSystem = isSystemAdmin(user.role);

  const [members, setMembers] = useState([]);
  const [rides, setRides] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [payerIds, setPayerIds] = useState([user.id]);
  const [payerAmounts, setPayerAmounts] = useState({}); // userId → BDT text
  const [payerDirty, setPayerDirty] = useState(false); // user hand-edited an amount
  const [rideAt, setRideAt] = useState(() => localInputValue(new Date()));
  const [amountText, setAmountText] = useState("");
  const [route, setRoute] = useState("");
  const [splitMethod, setSplitMethod] = useState("equal");
  const [selected, setSelected] = useState([]);
  const [customShares, setCustomShares] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(() => {
    return Promise.all([api("/users"), api("/rides?limit=50"), api("/meta")])
      .then(([usersData, ridesData, meta]) => {
        setMembers(usersData.users);
        setRides(ridesData.rides);
        setRoutes(meta.routes ?? []);
        setSelected((prev) =>
          prev.length ? prev : usersData.users.map((m) => m.id),
        );
      })
      .catch((err) => push(err.message, "error"))
      .finally(() => setLoading(false));
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedMembers = useMemo(
    () => members.filter((m) => selected.includes(m.id)),
    [members, selected],
  );
  const amountPaisa = toPaisa(amountText);
  const previewShares = equalShares(amountPaisa, selected);

  const customSum = useMemo(() => {
    return selected.reduce(
      (total, id) => total + (toPaisa(customShares[id]) ?? 0),
      0,
    );
  }, [selected, customShares]);

  const customValid = splitMethod !== "custom" || customSum === amountPaisa;

  const payerSum = useMemo(
    () =>
      payerIds.reduce((total, id) => total + (toPaisa(payerAmounts[id]) ?? 0), 0),
    [payerIds, payerAmounts],
  );
  const payerValid =
    payerIds.length > 0 && !!amountPaisa && payerSum === amountPaisa;

  function togglePayer(id) {
    const next = payerIds.includes(id)
      ? payerIds.filter((x) => x !== id)
      : [...payerIds, id];
    setPayerIds(next);
    setPayerAmounts(distributePayers(next, amountPaisa));
    setPayerDirty(false);
  }

  function toggleParticipant(id) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setCustomShares((prev) => {
      if (prev[id] !== undefined) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return prev;
    });
  }

  function setAllParticipants() {
    setSelected(members.map((m) => m.id));
    setCustomShares({});
  }

  function distributeEvenly() {
    if (!amountPaisa) return;
    const map = {};
    for (const share of equalShares(amountPaisa, selected)) {
      map[share.userId] = (share.sharePaisa / 100).toFixed(2);
    }
    setCustomShares(map);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);

    if (!amountPaisa) return setFormError("Enter the total fare.");
    if (selected.length === 0)
      return setFormError("Pick at least one participant.");
    if (payerIds.length === 0)
      return setFormError("Select who paid the bill.");
    if (!payerValid) {
      return setFormError(
        `Payers must add up to ${bdt(amountPaisa)} — currently ${bdt(payerSum)}.`,
      );
    }
    if (!customValid) {
      return setFormError(
        `Shares must add up to ${bdt(amountPaisa)} — currently ${bdt(customSum)}.`,
      );
    }

    const shares = {};
    if (splitMethod === "custom") {
      for (const id of selected) shares[id] = toPaisa(customShares[id]) ?? 0;
    }

    setSubmitting(true);
    try {
      const { ride } = await api("/rides", {
        method: "POST",
        body: {
          payers: payerIds.map((id) => ({
            userId: id,
            amountPaisa: toPaisa(payerAmounts[id]) ?? 0,
          })),
          amountPaisa,
          route: route.trim() || null,
          rideAt,
          splitMethod,
          participants: selected,
          shares,
        },
      });
      push(
        `Ride logged — ${bdt(ride.amountPaisa)} split ${splitMethod === "equal" ? "evenly" : "by custom shares"}.`,
      );
      setAmountText("");
      setRoute("");
      setRideAt(localInputValue(new Date()));
      setPayerAmounts({});
      setPayerDirty(false);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(ride) {
    const ok = window.confirm(
      `Delete this ride expense (${bdt(ride.amountPaisa)})? Everyone's balance will be recalculated.`,
    );
    if (!ok) return;
    setDeletingId(ride.id);
    try {
      await api(`/rides/${ride.id}`, { method: "DELETE" });
      push("Ride deleted.");
      await load();
    } catch (err) {
      push(err.message, "error");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 xl:grid-cols-12">
          <Skeleton className="h-140 w-full rounded-2xl xl:col-span-5" />
          <Skeleton className="h-140 w-full rounded-2xl xl:col-span-7" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Log a ride"
        subtitle="Who paid, how much, who shared the ride — then the ledger below"
        action={
          <Link to="/" className="block sm:inline-block">
            <Button
              variant="secondary"
              icon="home"
              className="w-full sm:w-auto"
            >
              Dashboard
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 xl:grid-cols-12">
        {/* --- Entry panel ------------------------------------------------ */}
        <Card className="xl:col-span-5">
          <CardHeader
            title={isSystem ? "Admin access" : "New expense"}
            subtitle={
              isSystem
                ? "System control only"
                : "Who paid, how much, who shared it"
            }
            icon={isSystem ? "shield" : "plus"}
          />

          {isSystem ? (
            <div className="px-4 pb-5 pt-4 sm:px-5">
              <EmptyState
                icon="shield"
                title="The System Admin doesn't take part in rides"
                description="Members and admins record their own trips and splits. Your account approves signups and oversees the ledger."
                action={
                  <Link to="/admin">
                    <Button size="sm" icon="shield">
                      Open admin panel
                    </Button>
                  </Link>
                }
              />
            </div>
          ) : members.length === 0 ? (
            <div className="px-4 pb-5 pt-4 sm:px-5">
              <EmptyState
                icon="users"
                title="No members yet"
                description="Approve a signup first — colleagues then appear here as participants."
                action={
                  <Link to="/admin">
                    <Button size="sm" icon="shield">
                      Open admin panel
                    </Button>
                  </Link>
                }
              />
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="space-y-4 px-4 py-4 sm:px-5"
            >
              {formError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                  {formError}
                </div>
              ) : null}

              {/* Amount — big, numeric keypad, right on top for mobile */}
              <Field
                label="Total fare"
                htmlFor="amount"
                hint="Amount paid to the driver (BDT)."
              >
                <div className="relative">
                  <Input
                    id="amount"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={amountText}
                    onChange={(e) => {
                      setAmountText(e.target.value);
                      // Keep the payer split in step with the fare until the
                      // user edits the payer amounts by hand.
                      if (!payerDirty) {
                        setPayerAmounts(
                          distributePayers(payerIds, toPaisa(e.target.value)),
                        );
                      }
                    }}
                    className="h-14 pl-4 pr-16 text-2xl font-extrabold tracking-tight"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold text-slate-400">
                    BDT
                  </span>
                </div>
              </Field>

              {amountPaisa && selected.length > 0 && splitMethod === "equal" ? (
                <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-600">
                  {previewShares.every(
                    (s) => s.sharePaisa === previewShares[0].sharePaisa,
                  )
                    ? `Each of ${selected.length} people pays ${bdt(previewShares[0].sharePaisa)}`
                    : `Split across ${selected.length} people — ${previewShares
                        .slice(0, 3)
                        .map((s) => bdt(s.sharePaisa))
                        .join(" · ")}${previewShares.length > 3 ? " …" : ""}`}
                </p>
              ) : null}

              {/* Stacked on every width: the native datetime widget clips inside
                narrow columns. */}
              <div className="grid gap-4">
                <Field label="Date & time" htmlFor="rideAt">
                  <Input
                    id="rideAt"
                    type="datetime-local"
                    value={rideAt}
                    onChange={(e) => setRideAt(e.target.value)}
                  />
                </Field>
              </div>

              {/* Paid by — one or several members split the bill */}
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-600">
                    Paid by ({payerIds.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPayerAmounts(distributePayers(payerIds, amountPaisa));
                      setPayerDirty(false);
                    }}
                    className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  >
                    Split evenly
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {members.map((member) => {
                    const active = payerIds.includes(member.id);
                    return (
                      <div
                        key={member.id}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition ${
                          active
                            ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={active}
                            onChange={() => togglePayer(member.id)}
                          />
                          <span
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition ${
                              active
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-300 bg-white"
                            }`}
                          >
                            {active ? (
                              <Icon
                                name="check"
                                className="h-3 w-3"
                                strokeWidth="3"
                              />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                            {member.name.split(" ")[0]}
                            {member.id === user.id ? " (you)" : ""}
                          </span>
                        </label>

                        {active ? (
                          <div className="relative w-28 shrink-0">
                            <input
                              inputMode="decimal"
                              placeholder="0"
                              aria-label={`Amount paid by ${member.name}`}
                              value={payerAmounts[member.id] ?? ""}
                              onChange={(e) => {
                                setPayerDirty(true);
                                setPayerAmounts((prev) => ({
                                  ...prev,
                                  [member.id]: e.target.value,
                                }));
                              }}
                              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 pr-8 text-right text-sm font-semibold text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] font-bold text-slate-400">
                              BDT
                            </span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {payerIds.length > 0 && amountPaisa ? (
                  <p
                    className={`mt-2 rounded-lg px-3 py-2 text-center text-xs font-bold ${
                      payerValid
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {payerValid
                      ? `Payers add up to ${bdt(amountPaisa)} ✓`
                      : payerSum > amountPaisa
                        ? `Paid more than the fare — over by ${bdt(payerSum - amountPaisa)}`
                        : `Paid ${bdt(payerSum)} — remaining ${bdt(amountPaisa - payerSum)}`}
                  </p>
                ) : null}
              </div>

              <Field
                label="Route (optional)"
                htmlFor="route"
                hint="Suggestions come from the admin-managed route list."
              >
                <Input
                  id="route"
                  list="route-suggestions"
                  placeholder="Dhanmondi to Kawran Bazar"
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                />
                <datalist id="route-suggestions">
                  {routes.map((r) => (
                    <option key={r.id} value={r.name} />
                  ))}
                </datalist>
              </Field>

              {/* Split method */}
              <div>
                <span className="mb-1.5 block text-sm font-semibold text-slate-600">
                  Split method
                </span>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                  {[
                    { value: "equal", label: "Equal split" },
                    { value: "custom", label: "Adjust shares" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSplitMethod(option.value)}
                      className={`h-11 rounded-lg text-sm font-bold transition ${
                        splitMethod === option.value
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Participants */}
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-600">
                    Participants ({selected.length})
                  </span>
                  <button
                    type="button"
                    onClick={setAllParticipants}
                    className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  >
                    Select all
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {members.map((member) => {
                    const active = selected.includes(member.id);
                    return (
                      <label
                        key={member.id}
                        className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                          active
                            ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={active}
                          onChange={() => toggleParticipant(member.id)}
                        />
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition ${
                            active
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-300 bg-white"
                          }`}
                        >
                          {active ? (
                            <Icon
                              name="check"
                              className="h-3 w-3"
                              strokeWidth="3"
                            />
                          ) : null}
                        </span>
                        <Avatar
                          name={member.name}
                          className="h-7 w-7 text-[10px]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-800">
                            {member.name.split(" ")[0]}
                          </span>
                          <span className="block truncate text-[11px] text-slate-400">
                            {member.email}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Custom shares */}
              {splitMethod === "custom" && selectedMembers.length > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-700">
                      Adjust each share
                    </span>
                    <button
                      type="button"
                      onClick={distributeEvenly}
                      className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:text-slate-900"
                    >
                      Distribute evenly
                    </button>
                  </div>

                  <div className="space-y-2">
                    {selectedMembers.map((member) => (
                      <div key={member.id} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">
                          {member.name.split(" ")[0]}
                        </span>
                        <div className="relative w-32 sm:w-36">
                          <Input
                            inputMode="decimal"
                            placeholder="0"
                            aria-label={`Share for ${member.name}`}
                            value={customShares[member.id] ?? ""}
                            onChange={(e) =>
                              setCustomShares((prev) => ({
                                ...prev,
                                [member.id]: e.target.value,
                              }))
                            }
                            className="h-11 pr-12 text-right font-semibold"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-slate-400">
                            BDT
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p
                    className={`mt-3 rounded-lg px-3 py-2 text-center text-xs font-bold ${
                      customValid
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {customValid
                      ? `Shares add up to ${bdt(amountPaisa ?? 0)} ✓`
                      : `Remaining: ${bdt((amountPaisa ?? 0) - customSum)}`}
                  </p>
                </div>
              ) : null}

              <Button
                type="submit"
                size="lg"
                loading={submitting}
                className="w-full"
                icon="plus"
              >
                Add ride to ledger
              </Button>
            </form>
          )}
        </Card>

        {/* --- Recent rides ---------------------------------------------- */}
        <Card className="xl:col-span-7">
          <CardHeader
            title="Recent rides"
            subtitle={`${rides.length} entr${rides.length === 1 ? "y" : "ies"} in the ledger`}
            icon="receipt"
          />
          {rides.length === 0 ? (
            <EmptyState
              icon="car"
              title="Nothing logged yet"
              description="Submit the form and the ride appears here instantly."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rides.map((ride) => (
                <RideCard
                  key={ride.id}
                  ride={ride}
                  currentUserId={user.id}
                  currentRole={user.role}
                  onDelete={handleDelete}
                  deleting={deletingId === ride.id}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
