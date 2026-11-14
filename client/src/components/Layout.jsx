import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { isAdminRole, roleLabel } from "../lib/roles.js";
import { Avatar, Button, Icon } from "./ui.jsx";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "home", end: true },
  { to: "/rides", label: "Rides", icon: "car" },
  { to: "/settle", label: "Pay Due", icon: "wallet" },
  { to: "/settings", label: "Settings", icon: "lock" },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white shadow-sm">
        <Icon name="car" className="h-5 w-5" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-extrabold tracking-tight text-slate-900">
          CoRide
        </span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Office pool · BDT
        </span>
      </span>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const items = isAdminRole(user?.role)
    ? [...NAV_ITEMS, { to: "/admin", label: "Admin", icon: "shield" }]
    : NAV_ITEMS;
  const mobileCols = items.length >= 5 ? "grid-cols-5" : "grid-cols-4";

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
      isActive
        ? "bg-slate-900 text-white shadow-sm"
        : "text-slate-600 hover:bg-white hover:text-slate-900"
    }`;

  const mobileClass = ({ isActive }) =>
    `flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-semibold transition ${
      isActive ? "text-slate-900" : "text-slate-400"
    }`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Logo />

          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={linkClass}
              >
                <Icon name={item.icon} className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-1 pl-1 pr-3 sm:flex">
              <Avatar name={user?.name} className="h-8 w-8 text-[11px]" />
              <div className="leading-tight">
                <p className="max-w-[140px] truncate text-xs font-bold text-slate-800">
                  {user?.name}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {roleLabel(user?.role)}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="icon"
              onClick={handleLogout}
              title="Log out"
              aria-label="Log out"
            >
              <Icon name="logout" className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile-first: single column, generous side gutters, always clear of the
          fixed bottom tab bar (pb-30) and the iOS home indicator (pb-safe nav). */}
      <main className="mx-auto w-full max-w-6xl px-4 pb-30 pt-4 sm:px-5 md:pb-14 md:pt-7">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <div
          className={`mx-auto grid ${mobileCols} max-w-lg gap-1 px-2 py-1.5`}
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={mobileClass}
            >
              <Icon name={item.icon} className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
          {items.length < 4 ? (
            <button
              type="button"
              onClick={handleLogout}
              className="flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-semibold text-slate-400 transition hover:text-slate-700"
            >
              <Icon name="logout" className="h-5 w-5" />
              Logout
            </button>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
