// End-to-end smoke test for the CoRide API.
const BASE = process.env.BASE_URL || "http://localhost:4000";

const jar = new Map();
function cookieHeader(name = "default") {
  const c = jar.get(name);
  return c ? { Cookie: c } : {};
}
async function req(method, path, { body, name = "default" } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...cookieHeader(name) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  for (const sc of setCookie) {
    const [pair] = sc.split(";");
    jar.set(name, pair);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, data };
}

let failures = 0;
function check(label, condition, extra) {
  if (condition) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}`, extra ?? "");
  }
}

const rand = Math.random().toString(36).slice(2, 8);
const newEmail = `pending${rand}@office.local`;

console.log("\n— health —");
{
  const r = await req("GET", "/api/health");
  check("GET /api/health → 200", r.status === 200 && r.data.ok, r);
}

console.log("\n— unauthenticated guards —");
{
  jar.delete("anon");
  const r = await req("GET", "/api/rides", { name: "anon" });
  check("GET /api/rides without cookie → 401", r.status === 401, r);
  const d = await req("GET", "/api/dashboard", { name: "anon" });
  check("GET /api/dashboard without cookie → 401", d.status === 401, d);
}

console.log("\n— registration (pending) —");
{
  const r = await req("POST", "/api/auth/register", {
    body: { name: "Pending Pete", email: newEmail, password: "secret123" },
    name: "pending",
  });
  check(
    "register → 201 pending",
    r.status === 201 && r.data.user?.status === "pending",
    r,
  );

  const me = await req("GET", "/api/auth/me", { name: "pending" });
  check("me → pending user", me.data?.user?.status === "pending", me);

  const dash = await req("GET", "/api/dashboard", { name: "pending" });
  check(
    "pending user blocked from dashboard → 403 APPROVAL_REQUIRED",
    dash.status === 403 && dash.data.code === "APPROVAL_REQUIRED",
    dash,
  );

  const dup = await req("POST", "/api/auth/register", {
    body: { name: "Pending Pete", email: newEmail, password: "secret123" },
    name: "pending",
  });
  check("duplicate pending register → 409", dup.status === 409, dup);

  const badLogin = await req("POST", "/api/auth/login", {
    body: { email: newEmail, password: "wrong" },
    name: "x",
  });
  check("wrong password → 401", badLogin.status === 401, badLogin);
}

console.log("\n— admin approval —");
let pendingId;
{
  const login = await req("POST", "/api/auth/login", {
    body: { email: "admin@uberexpenses.local", password: "Admin@123" },
    name: "admin",
  });
  check(
    "system admin login → 200 (role system_admin, name System Admin)",
    login.status === 200 &&
      login.data.user?.role === "system_admin" &&
      login.data.user?.name === "System Admin",
    login,
  );

  const list = await req("GET", "/api/admin/users?status=pending", {
    name: "admin",
  });
  check(
    "admin lists pending users",
    list.status === 200 && list.data.counts.pending >= 1,
    list,
  );
  pendingId = list.data.users.find((u) => u.email === newEmail)?.id;
  check("new signup appears as pending", Boolean(pendingId));

  const approve = await req("POST", `/api/admin/users/${pendingId}/approve`, {
    name: "admin",
  });
  check(
    "approve → approved",
    approve.status === 200 && approve.data.user.status === "approved",
    approve,
  );

  const memberLogin = await req("POST", "/api/auth/login", {
    body: { email: newEmail, password: "secret123" },
    name: "member",
  });
  check(
    "approved user login → 200",
    memberLogin.status === 200 && memberLogin.data.user.status === "approved",
    memberLogin,
  );
}

console.log("\n— seed extra approved members —");
{
  for (const [nm, em] of [
    ["Extra Eve", `eve${rand}@office.local`],
    ["Extra Sam", `sam${rand}@office.local`],
  ]) {
    await req("POST", "/api/auth/register", {
      body: { name: nm, email: em, password: "secret123" },
      name: em,
    });
    const list = await req("GET", "/api/admin/users?status=pending", {
      name: "admin",
    });
    const id = list.data.users.find((u) => u.email === em)?.id;
    const r = await req("POST", `/api/admin/users/${id}/approve`, {
      name: "admin",
    });
    check(
      `approve ${nm}`,
      r.status === 200 && r.data.user.status === "approved",
      r,
    );
  }

  // A second member session, used later to prove creator-only deletions.
  const eveLogin = await req("POST", "/api/auth/login", {
    body: { email: `eve${rand}@office.local`, password: "secret123" },
    name: "eve",
  });
  check(
    "second member can log in (permission tests)",
    eveLogin.status === 200,
    eveLogin,
  );
}

console.log("\n— non-admin blocked from admin panel —");
{
  const r = await req("GET", "/api/admin/users", { name: "member" });
  check("member GET /api/admin/users → 403", r.status === 403, r);
}

console.log("\n— rides & balances —");
let rideId;
{
  const members = await req("GET", "/api/users", { name: "admin" });
  const ids = members.data.users.map((u) => u.id);
  check(
    "GET /api/users → approved members",
    members.status === 200 && ids.length >= 3,
    members,
  );
  check(
    "admin excluded from participant list",
    !members.data.users.some((u) => u.role !== "member"),
    members.data.users,
  );

  const created = await req("POST", "/api/rides", {
    body: {
      paidBy: ids[0],
      amountPaisa: 45000,
      description: "Morning office run",
      route: "Dhanmondi to Kawran Bazar",
      splitMethod: "equal",
      participants: ids.slice(0, 3),
    },
    name: "member",
  });
  check("create ride → 201", created.status === 201, created);
  rideId = created.data?.ride?.id;
  const shares = created.data?.ride?.shares || [];
  check(
    "equal split shares sum to total",
    shares.reduce((a, s) => a + s.sharePaisa, 0) === 45000,
    shares,
  );
  check("3 participants", shares.length === 3, shares);

  const odd = await req("POST", "/api/rides", {
    body: {
      paidBy: ids[0],
      amountPaisa: 10000,
      description: "odd split",
      splitMethod: "custom",
      participants: ids.slice(0, 3),
      shares: { [ids[0]]: 4000, [ids[1]]: 3000, [ids[2]]: 2000 },
    },
    name: "member",
  });
  check("custom split mismatch → 400", odd.status === 400, odd);

  const custom = await req("POST", "/api/rides", {
    body: {
      paidBy: ids[0],
      amountPaisa: 10000,
      description: "custom split ok",
      splitMethod: "custom",
      participants: ids.slice(0, 3),
      shares: { [ids[0]]: 5000, [ids[1]]: 3000, [ids[2]]: 2000 },
    },
    name: "member",
  });
  check("custom split accepted → 201", custom.status === 201, custom);

  const noDesc = await req("POST", "/api/rides", {
    body: {
      paidBy: ids[0],
      amountPaisa: 5000,
      splitMethod: "equal",
      participants: ids.slice(0, 2),
    },
    name: "member",
  });
  check(
    "ride without description → 201 (defaults to Ride expense)",
    noDesc.status === 201 && noDesc.data?.ride?.description === "Ride expense",
    noDesc,
  );

  const adminRide = await req("POST", "/api/rides", {
    body: {
      paidBy: ids[0],
      amountPaisa: 10000,
      description: "admin attempt",
      splitMethod: "equal",
      participants: ids.slice(0, 2),
    },
    name: "admin",
  });
  check(
    "admin cannot log a ride → 403 ADMIN_READ_ONLY",
    adminRide.status === 403 && adminRide.data.code === "ADMIN_READ_ONLY",
    adminRide,
  );

  const dash = await req("GET", "/api/dashboard", { name: "admin" });
  const balances = dash.data.balances;
  const sum = balances.reduce((a, b) => a + b.netPaisa, 0);
  check("dashboard balances net to zero", dash.status === 200 && sum === 0, {
    sum,
    balances,
  });
  check(
    "dashboard returns direct debt transfers",
    Array.isArray(dash.data.transfers),
    dash.data.transfers,
  );
  check(
    "transfers exclude zero amounts",
    (dash.data.transfers ?? []).every((t) => t.amountPaisa > 0),
    dash.data.transfers,
  );
  check(
    "month stats present",
    typeof dash.data.month.rideTotalPaisa === "number",
    dash.data.month,
  );
  check(
    "recent rides returned",
    dash.data.recentRides.length >= 2,
    dash.data.recentRides.length,
  );
  check(
    "admin excluded from balance ledger",
    !balances.some((b) => b.role !== "member"),
    balances,
  );
}

console.log("\n— multiple payers per ride —");
{
  const members = await req("GET", "/api/users", { name: "admin" });
  const ids = members.data.users.map((u) => u.id);

  const split = await req("POST", "/api/rides", {
    body: {
      payers: [
        { userId: ids[0], amountPaisa: 3000 },
        { userId: ids[1], amountPaisa: 2000 },
      ],
      amountPaisa: 5000,
      description: "two payers split the bill",
      splitMethod: "equal",
      participants: ids.slice(0, 4),
    },
    name: "member",
  });
  check("ride with two payers → 201", split.status === 201, split);
  const payers = split.data?.ride?.payers ?? [];
  check(
    "both payers returned, amounts sum to the total",
    payers.length === 2 &&
      payers.reduce((a, p) => a + p.amountPaisa, 0) === 5000,
    payers,
  );
  check(
    "paidBy kept as primary (biggest) payer for compat",
    split.data?.ride?.paidBy?.id === ids[0],
    split.data?.ride?.paidBy,
  );
  const multiShares = split.data?.ride?.shares ?? [];
  check(
    "multi-payer ride shares still sum to the total",
    multiShares.reduce((a, s) => a + s.sharePaisa, 0) === 5000,
    multiShares,
  );

  const mismatch = await req("POST", "/api/rides", {
    body: {
      payers: [{ userId: ids[0], amountPaisa: 3000 }],
      amountPaisa: 5000,
      splitMethod: "equal",
      participants: ids.slice(0, 2),
    },
    name: "member",
  });
  check(
    "payer amounts ≠ total → 400 PAYERS_MISMATCH",
    mismatch.status === 400 && mismatch.data.code === "PAYERS_MISMATCH",
    mismatch,
  );

  const admins = await req("GET", "/api/admin/users?status=all", {
    name: "admin",
  });
  const adminId = admins.data.users.find(
    (u) => u.email === "admin@uberexpenses.local",
  )?.id;
  const adminPayer = await req("POST", "/api/rides", {
    body: {
      payers: [{ userId: adminId, amountPaisa: 5000 }],
      amountPaisa: 5000,
      splitMethod: "equal",
      participants: ids.slice(0, 2),
    },
    name: "member",
  });
  check(
    "System Admin cannot be a payer → rejected",
    adminPayer.status === 400,
    adminPayer,
  );

  const dupPayer = await req("POST", "/api/rides", {
    body: {
      payers: [
        { userId: ids[0], amountPaisa: 2500 },
        { userId: ids[0], amountPaisa: 2500 },
      ],
      amountPaisa: 5000,
      splitMethod: "equal",
      participants: ids.slice(0, 2),
    },
    name: "member",
  });
  check("duplicate payer row → 400", dupPayer.status === 400, dupPayer);

  const zeroPayer = await req("POST", "/api/rides", {
    body: {
      payers: [
        { userId: ids[0], amountPaisa: 5000 },
        { userId: ids[1], amountPaisa: 0 },
      ],
      amountPaisa: 5000,
      splitMethod: "equal",
      participants: ids.slice(0, 2),
    },
    name: "member",
  });
  check("payer contributing 0 → 400", zeroPayer.status === 400, zeroPayer);

  // Reconciliation: applying every suggested transfer to the balance ledger
  // must clear every member's net — proves direct debts match the maths.
  const dash = await req("GET", "/api/dashboard", { name: "admin" });
  const sum = dash.data.balances.reduce((a, b) => a + b.netPaisa, 0);
  check("balances net to zero with multi-payer rides", sum === 0, sum);
  const nets = new Map(dash.data.balances.map((b) => [b.userId, b.netPaisa]));
  for (const t of dash.data.transfers) {
    nets.set(t.from.id, (nets.get(t.from.id) ?? 0) + t.amountPaisa);
    nets.set(t.to.id, (nets.get(t.to.id) ?? 0) - t.amountPaisa);
  }
  check(
    "direct debts reconcile with balances (every net clears)",
    [...nets.values()].every((v) => v === 0),
    [...nets.entries()].filter(([, v]) => v !== 0),
  );
}

console.log("\n— settlement —");
{
  const dash = await req("GET", "/api/dashboard", { name: "admin" });
  const debtor = dash.data.transfers[0];
  check("someone owes someone", Boolean(debtor), dash.data.transfers);

  const adminPay = await req("POST", "/api/settlements", {
    body: { toUser: debtor.to.id, amountPaisa: 1000 },
    name: "admin",
  });
  check(
    "admin cannot record a payment → 403 ADMIN_READ_ONLY",
    adminPay.status === 403 && adminPay.data.code === "ADMIN_READ_ONLY",
    adminPay,
  );

  const paid = await req("POST", "/api/settlements", {
    body: {
      toUser: debtor.to.id,
      amountPaisa: debtor.amountPaisa,
      paymentMethod: "bkash",
    },
    name: "member",
  });
  // member may not be in debt — either 201 or 400 for self-payment
  check(
    "settlement recorded (201) or valid rejection",
    paid.status === 201 || paid.status === 400,
    paid,
  );

  if (paid.status === 201) {
    check(
      "paymentMethod echoed back as bkash",
      paid.data.settlement.paymentMethod === "bkash",
      paid.data.settlement,
    );
    check(
      "new settlement starts pending",
      paid.data.settlement.status === "pending",
      paid.data.settlement,
    );
  }

  const badMethod = await req("POST", "/api/settlements", {
    body: { toUser: debtor.to.id, amountPaisa: 1000, paymentMethod: "bitcoin" },
    name: "member",
  });
  check("invalid paymentMethod → 400", badMethod.status === 400, badMethod);

  const list = await req("GET", "/api/settlements", { name: "member" });
  check(
    "GET /api/settlements → 200",
    list.status === 200 && Array.isArray(list.data.settlements),
    list,
  );

  // Acknowledgement — create a deterministic member→eve payment to confirm.
  const members = await req("GET", "/api/users", { name: "admin" });
  const eve = members.data.users.find(
    (u) => u.email === `eve${rand}@office.local`,
  );
  const ackPay = await req("POST", "/api/settlements", {
    body: { toUser: eve.id, amountPaisa: 77700, paymentMethod: "nagad" },
    name: "member",
  });
  check("ack-fixture payment created → 201", ackPay.status === 201, ackPay);

  const ackId = ackPay.data.settlement.id;
  const wrongPerson = await req(
    "POST",
    `/api/settlements/${ackId}/acknowledge`,
    { name: "member" },
  );
  check(
    "ack by non-recipient → 403 NOT_RECIPIENT",
    wrongPerson.status === 403 && wrongPerson.data.code === "NOT_RECIPIENT",
    wrongPerson,
  );

  const rLogin = await req("POST", "/api/auth/login", {
    body: { email: `eve${rand}@office.local`, password: "secret123" },
    name: "recip",
  });
  check("recipient logs in (for ack test)", rLogin.status === 200, rLogin);

  const ack = await req("POST", `/api/settlements/${ackId}/acknowledge`, {
    name: "recip",
  });
  check(
    "recipient acknowledges → 200 + acknowledged + timestamp",
    ack.status === 200 &&
      ack.data.settlement.status === "acknowledged" &&
      ack.data.settlement.acknowledgedAt,
    ack,
  );

  const ack2 = await req("POST", `/api/settlements/${ackId}/acknowledge`, {
    name: "recip",
  });
  check(
    "double acknowledge → 409 ALREADY_ACKNOWLEDGED",
    ack2.status === 409 && ack2.data.code === "ALREADY_ACKNOWLEDGED",
    ack2,
  );

  const dash2 = await req("GET", "/api/dashboard", { name: "admin" });
  const sum2 = dash2.data.balances.reduce((a, b) => a + b.netPaisa, 0);
  check("balances still net to zero after settlement", sum2 === 0, sum2);
}

console.log("\n— delete ride (permission) —");
{
  const r = await req("DELETE", `/api/rides/${rideId}`, { name: "eve" });
  check("non-creator cannot delete → 403", r.status === 403, r);
  const byAdmin = await req("DELETE", `/api/rides/${rideId}`, {
    name: "admin",
  });
  check("admin can delete (oversight) → 200", byAdmin.status === 200, byAdmin);
}

console.log("\n— rejection flow —");
{
  const email2 = `rej${rand}@office.local`;
  await req("POST", "/api/auth/register", {
    body: { name: "Rejected Rita", email: email2, password: "secret123" },
    name: "r1",
  });
  const list = await req("GET", "/api/admin/users?status=pending", {
    name: "admin",
  });
  const id = list.data.users.find((u) => u.email === email2)?.id;
  const rej = await req("POST", `/api/admin/users/${id}/reject`, {
    name: "admin",
  });
  check(
    "admin rejects signup",
    rej.status === 200 && rej.data.user.status === "rejected",
    rej,
  );

  const login = await req("POST", "/api/auth/login", {
    body: { email: email2, password: "secret123" },
    name: "rej",
  });
  check(
    "rejected login → 403 REJECTED",
    login.status === 403 && login.data.code === "REJECTED",
    login,
  );

  const reapply = await req("POST", "/api/auth/register", {
    body: { name: "Rejected Rita", email: email2, password: "secret123" },
    name: "r2",
  });
  check(
    "rejected user can re-apply → 201 pending",
    reapply.status === 201 && reapply.data.user.status === "pending",
    reapply,
  );
}

console.log("\n— roles: System Admin / Admin / Member —");
let sysAdminId;
{
  const all = await req("GET", "/api/admin/users?status=all", {
    name: "admin",
  });
  const sys = all.data.users.find(
    (u) => u.email === "admin@uberexpenses.local",
  );
  sysAdminId = sys?.id;
  check(
    "System Admin account exists (role system_admin)",
    sys?.role === "system_admin",
    sys,
  );
  check(
    "System Admin is the only system_admin",
    all.data.users.filter((u) => u.role === "system_admin").length === 1,
    all.data.users.filter((u) => u.role === "system_admin"),
  );

  // Promote a fresh member to Admin — they can then reject & protect-check.
  const bossEmail = `boss${rand}@office.local`;
  await req("POST", "/api/auth/register", {
    body: { name: "Boss Rafi", email: bossEmail, password: "secret123" },
    name: bossEmail,
  });
  const pend = await req("GET", "/api/admin/users?status=pending", {
    name: "admin",
  });
  const bossId = pend.data.users.find((u) => u.email === bossEmail)?.id;
  await req("POST", `/api/admin/users/${bossId}/approve`, { name: "admin" });
  const promoted = await req("POST", `/api/admin/users/${bossId}/role`, {
    body: { role: "admin" },
    name: "admin",
  });
  check(
    "System Admin promotes a member to Admin → role admin",
    promoted.status === 200 && promoted.data.user.role === "admin",
    promoted,
  );

  const bossLogin = await req("POST", "/api/auth/login", {
    body: { email: bossEmail, password: "secret123" },
    name: "boss",
  });
  check("new admin can log in", bossLogin.status === 200, bossLogin);

  // Only the System Admin may grant admin rights — a regular admin cannot.
  const approved = await req("GET", "/api/admin/users?status=approved", {
    name: "boss",
  });
  const victim = approved.data.users.find(
    (u) => u.role === "member" && u.id !== bossId,
  );
  const blockedPromo = await req("POST", `/api/admin/users/${victim.id}/role`, {
    body: { role: "admin" },
    name: "boss",
  });
  check(
    "regular admin cannot promote to admin → 403 SYSTEM_ADMIN_REQUIRED",
    blockedPromo.status === 403 &&
      blockedPromo.data.code === "SYSTEM_ADMIN_REQUIRED",
    blockedPromo,
  );
  const approvedAgain = await req("GET", "/api/admin/users?status=approved", {
    name: "boss",
  });
  const victimAfter = approvedAgain.data.users.find((u) => u.id === victim.id);
  check(
    "victim is still a member after the blocked promotion",
    victimAfter?.role === "member",
    victimAfter,
  );

  // The built-in account is untouchable — even by another admin.
  const r1 = await req("POST", `/api/admin/users/${sysAdminId}/reject`, {
    name: "boss",
  });
  check(
    "admin cannot reject the System Admin → 403 SYSTEM_ADMIN_PROTECTED",
    r1.status === 403 && r1.data.code === "SYSTEM_ADMIN_PROTECTED",
    r1,
  );
  const r2 = await req("POST", `/api/admin/users/${sysAdminId}/role`, {
    body: { role: "member" },
    name: "boss",
  });
  check(
    "admin cannot demote the System Admin → 403 SYSTEM_ADMIN_PROTECTED",
    r2.status === 403 && r2.data.code === "SYSTEM_ADMIN_PROTECTED",
    r2,
  );
  const r3 = await req("DELETE", `/api/admin/users/${sysAdminId}`, {
    name: "boss",
  });
  check(
    "admin cannot delete the System Admin → 403 SYSTEM_ADMIN_PROTECTED",
    r3.status === 403 && r3.data.code === "SYSTEM_ADMIN_PROTECTED",
    r3,
  );

  // Regular admins CAN reject and manage ordinary users.
  const rejEmail = `rej2${rand}@office.local`;
  await req("POST", "/api/auth/register", {
    body: { name: "Rival Raj", email: rejEmail, password: "secret123" },
    name: rejEmail,
  });
  const pend2 = await req("GET", "/api/admin/users?status=pending", {
    name: "admin",
  });
  const rivalId = pend2.data.users.find((u) => u.email === rejEmail)?.id;
  const bossRej = await req("POST", `/api/admin/users/${rivalId}/reject`, {
    name: "boss",
  });
  check(
    "regular admin can reject a signup → 200",
    bossRej.status === 200 && bossRej.data.user.status === "rejected",
    bossRej,
  );

  // Only the System Admin may reset forgotten passwords.
  const denied = await req(
    "POST",
    `/api/admin/users/${bossId}/reset-password`,
    { name: "boss" },
  );
  check(
    "regular admin cannot reset passwords → 403 SYSTEM_ADMIN_REQUIRED",
    denied.status === 403 && denied.data.code === "SYSTEM_ADMIN_REQUIRED",
    denied,
  );

  const reset = await req("POST", `/api/admin/users/${bossId}/reset-password`, {
    name: "admin",
  });
  check(
    "System Admin resets a password → 200 + temporary password",
    reset.status === 200 && Boolean(reset.data.temporaryPassword),
    reset,
  );
  const tempLogin = await req("POST", "/api/auth/login", {
    body: { email: bossEmail, password: reset.data.temporaryPassword },
    name: "boss2",
  });
  check(
    "user can log in with the temporary password → 200",
    tempLogin.status === 200,
    tempLogin,
  );

  // Demote the helper admin back — their panel access disappears instantly.
  const demoted = await req("POST", `/api/admin/users/${bossId}/role`, {
    body: { role: "member" },
    name: "admin",
  });
  check(
    "System Admin demotes an admin → member",
    demoted.status === 200 && demoted.data.user.role === "member",
    demoted,
  );
  const after = await req("GET", "/api/admin/users", { name: "boss2" });
  check("demoted user loses admin panel → 403", after.status === 403, after);
}

console.log("\n— change password (self) —");
{
  const wrong = await req("POST", "/api/auth/change-password", {
    body: { currentPassword: "nope123", newPassword: "newpass42" },
    name: "member",
  });
  check(
    "wrong current password → 401 WRONG_PASSWORD",
    wrong.status === 401 && wrong.data.code === "WRONG_PASSWORD",
    wrong,
  );

  const short = await req("POST", "/api/auth/change-password", {
    body: { currentPassword: "secret123", newPassword: "abc" },
    name: "member",
  });
  check("short new password → 400", short.status === 400, short);

  const ok = await req("POST", "/api/auth/change-password", {
    body: { currentPassword: "secret123", newPassword: "newpass42" },
    name: "member",
  });
  check("correct current password → 200", ok.status === 200 && ok.data.ok, ok);

  const relogin = await req("POST", "/api/auth/login", {
    body: { email: newEmail, password: "newpass42" },
    name: "member2",
  });
  check(
    "login works with the new password → 200",
    relogin.status === 200,
    relogin,
  );

  const stillOld = await req("POST", "/api/auth/login", {
    body: { email: newEmail, password: "secret123" },
    name: "x2",
  });
  check(
    "old password no longer works → 401",
    stillOld.status === 401,
    stillOld,
  );
}

console.log("\n— metadata: payment methods & routes (admin-managed) —");
{
  const meta = await req("GET", "/api/meta", { name: "member" });
  check(
    "GET /api/meta → defaults (cash…nagad + Office routes)",
    meta.status === 200 &&
      meta.data.paymentMethods.some((m) => m.value === "bkash") &&
      meta.data.routes.some((r) => r.name === "Office to Home"),
    meta,
  );

  const byMember = await req("POST", "/api/meta/routes", {
    body: { name: "Member Route" },
    name: "member",
  });
  check(
    "member cannot create metadata → 403",
    byMember.status === 403,
    byMember,
  );

  const manageByMember = await req("GET", "/api/meta/manage", {
    name: "member",
  });
  check(
    "member cannot open /api/meta/manage → 403",
    manageByMember.status === 403,
    manageByMember,
  );

  const methodLabel = `Rocket ${rand}`;
  const methodValue = `rocket-${rand}`;
  const created = await req("POST", "/api/meta/payment-methods", {
    body: { label: methodLabel },
    name: "admin",
  });
  check(
    "admin creates a payment method → 201 (slug value)",
    created.status === 201 && created.data.paymentMethod.value === methodValue,
    created,
  );

  const dup = await req("POST", "/api/meta/payment-methods", {
    body: { label: methodLabel },
    name: "admin",
  });
  check("duplicate payment method → 409", dup.status === 409, dup);

  const members = await req("GET", "/api/users", { name: "admin" });
  const eve = members.data.users.find(
    (u) => u.email === `eve${rand}@office.local`,
  );
  const useNew = await req("POST", "/api/settlements", {
    body: { toUser: eve.id, amountPaisa: 5000, paymentMethod: methodValue },
    name: "member",
  });
  check(
    "settlement with the new method → 201 + label",
    useNew.status === 201 &&
      useNew.data.settlement.paymentMethodLabel === methodLabel,
    useNew,
  );

  const del = await req(
    "DELETE",
    `/api/meta/payment-methods/${created.data.paymentMethod.id}`,
    {
      name: "admin",
    },
  );
  check(
    "deleting a used method archives it → archived:true",
    del.status === 200 && del.data.archived === true,
    del,
  );

  const afterDel = await req("GET", "/api/meta", { name: "member" });
  check(
    "archived method hidden from the form",
    !afterDel.data.paymentMethods.some((m) => m.value === methodValue),
    afterDel.data.paymentMethods,
  );

  const blocked = await req("POST", "/api/settlements", {
    body: { toUser: eve.id, amountPaisa: 1000, paymentMethod: methodValue },
    name: "member",
  });
  check("archived method rejected → 400", blocked.status === 400, blocked);

  // Routes: create → edit → delete (unused removes outright).
  const route = await req("POST", "/api/meta/routes", {
    body: { name: "Office to Mall" },
    name: "admin",
  });
  check("admin creates a route → 201", route.status === 201, route);
  const renamed = await req("PUT", `/api/meta/routes/${route.data.route.id}`, {
    body: { name: "Office to Supermarket" },
    name: "admin",
  });
  check(
    "admin edits a route → 200",
    renamed.status === 200 &&
      renamed.data.route.name === "Office to Supermarket",
    renamed,
  );
  const routeDel = await req(
    "DELETE",
    `/api/meta/routes/${route.data.route.id}`,
    { name: "admin" },
  );
  check(
    "unused route deleted outright → deleted:true",
    routeDel.status === 200 && routeDel.data.deleted === true,
    routeDel,
  );

  const methodEdit = await req(
    "PUT",
    `/api/meta/payment-methods/${created.data.paymentMethod.id}`,
    {
      body: { label: "Rocket (archived)" },
      name: "admin",
    },
  );
  check(
    "admin edits a payment method label → 200",
    methodEdit.status === 200 &&
      methodEdit.data.paymentMethod.label === "Rocket (archived)",
    methodEdit,
  );
}

console.log("\n— delete user —");
{
  const goneEmail = `gone${rand}@office.local`;
  await req("POST", "/api/auth/register", {
    body: { name: "Gone Guy", email: goneEmail, password: "secret123" },
    name: goneEmail,
  });
  const pend = await req("GET", "/api/admin/users?status=pending", {
    name: "admin",
  });
  const goneId = pend.data.users.find((u) => u.email === goneEmail)?.id;
  await req("POST", `/api/admin/users/${goneId}/approve`, { name: "admin" });

  const del = await req("DELETE", `/api/admin/users/${goneId}`, {
    name: "admin",
  });
  check(
    "System Admin deletes an account with no history → 200",
    del.status === 200 && del.data.ok,
    del,
  );

  const login = await req("POST", "/api/auth/login", {
    body: { email: goneEmail, password: "secret123" },
    name: "gone",
  });
  check("deleted account cannot log in → 401", login.status === 401, login);

  // The member has rides & payments — deletion must be refused.
  const withData = await req("GET", "/api/admin/users?status=all", {
    name: "admin",
  });
  const memberRow = withData.data.users.find((u) => u.email === newEmail);
  const refused = await req("DELETE", `/api/admin/users/${memberRow.id}`, {
    name: "admin",
  });
  check(
    "account with ledger history → 409 USER_HAS_DATA",
    refused.status === 409 && refused.data.code === "USER_HAS_DATA",
    refused,
  );

  const selfDel = await req("DELETE", `/api/admin/users/${sysAdminId}`, {
    name: "admin",
  });
  check(
    "self-delete attempt → 403 SYSTEM_ADMIN_PROTECTED",
    selfDel.status === 403 && selfDel.data.code === "SYSTEM_ADMIN_PROTECTED",
    selfDel,
  );
}

console.log("\n— logout —");
{
  const out = await req("POST", "/api/auth/logout", { name: "member" });
  check("logout → 200", out.status === 200, out);
}

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}\n`,
);
process.exit(failures === 0 ? 0 : 1);
