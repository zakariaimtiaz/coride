import { avatarTone, initials } from '../lib/format.js';

/* ---------------------------------------------------------------- icons --- */

const PATHS = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  car: (
    <>
      <path d="M5 11.5 6.6 6.9A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.4L19 11.5" />
      <rect x="3" y="11.5" width="18" height="5.5" rx="1.8" />
      <path d="M6.5 17v1.6M17.5 17v1.6" />
      <path d="M7 14.2h.01M17 14.2h.01" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.2" />
      <path d="M3 10.2h18" />
      <path d="M16.5 14.6h1.8" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 19 6v5.8c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z" />
      <path d="m9 12 2.2 2.2L15.2 10" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3 20c0-3.2 2.7-5.4 6-5.4s6 2.2 6 5.4" />
      <path d="M16.2 5.6a3.4 3.4 0 0 1 0 6.6" />
      <path d="M18.2 14.8c1.9.8 3.3 2.6 3.3 5.2" />
    </>
  ),
  plus: <path d="M12 5.2v13.6M5.2 12h13.6" />,
  check: <path d="m4.8 12.6 4.6 4.6L19.4 7.2" />,
  x: <path d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6" />,
  trash: (
    <>
      <path d="M4.2 6.8h15.6" />
      <path d="M9.2 6.8V5.2a1.2 1.2 0 0 1 1.2-1.2h3.2a1.2 1.2 0 0 1 1.2 1.2v1.6" />
      <path d="M6.6 6.8 7.3 20a1.2 1.2 0 0 0 1.2 1.1h7a1.2 1.2 0 0 0 1.2-1.1l.7-13.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.4V12l3 1.9" />
    </>
  ),
  logout: (
    <>
      <path d="M14.8 4H17a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2.2" />
      <path d="m9.6 8.4-3.6 3.6 3.6 3.6" />
      <path d="M6.4 12h8.2" />
    </>
  ),
  'arrow-up-right': (
    <>
      <path d="M7.4 16.6 16.6 7.4" />
      <path d="M9.2 7.4h7.4v7.4" />
    </>
  ),
  'arrow-down-left': (
    <>
      <path d="M16.6 7.4 7.4 16.6" />
      <path d="M14.8 16.6H7.4V9.2" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.4h12v17.2l-3-1.8-3 1.8-3-1.8-3 1.8z" />
      <path d="M9.2 8.4h5.6M9.2 12.4h5.6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20.4 4v4.4H16" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.2 2.8 20h18.4z" />
      <path d="M12 10.2v4.2" />
      <path d="M12 17.4h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 11.4v5" />
      <path d="M12 8.2h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.4" />
      <path d="m16 16 4.2 4.2" />
    </>
  ),
  chevronRight: <path d="m9.4 5.6 6.4 6.4-6.4 6.4" />,
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="14" r="4" />
      <path d="m11 11 8-8M16.5 5.5 19 8M14 8l2 2" />
    </>
  ),
  send: (
    <>
      <path d="M20.6 3.4 10.8 13.2" />
      <path d="M20.6 3.4 14.2 21l-3.4-7.8L3 9.8z" />
    </>
  ),
  handshake: (
    <>
      <path d="M2.5 12.2 6 8.7l4.2 3.5 1.8-1.5 1.8 1.5 4.2-3.5 3.5 3.5" />
      <path d="M6 8.7V5.9M18 8.7V5.9" />
      <path d="m12 10.7-2.4 2.4a1.5 1.5 0 0 0 2.1 2.1l.3-.3.3.3a1.5 1.5 0 0 0 2.1-2.1" />
    </>
  ),
};

export function Icon({ name, className = 'h-5 w-5' }) {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

/* ------------------------------------------------------------- controls --- */

const BUTTON_STYLES = {
  primary:
    'bg-slate-900 text-white hover:bg-slate-800 focus-visible:outline-slate-900 disabled:bg-slate-400',
  secondary:
    'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 focus-visible:outline-slate-400',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:outline-emerald-600 disabled:bg-emerald-300',
  danger:
    'bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 focus-visible:outline-rose-500',
  ghost:
    'text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline-slate-400',
};

const BUTTON_SIZES = {
  sm: 'h-10 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
  icon: 'h-11 w-11 p-0', // full touch target on mobile headers/navs
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-xl font-semibold transition
        focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed
        disabled:opacity-70 ${BUTTON_STYLES[variant]} ${BUTTON_SIZES[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <Spinner className="h-4 w-4" />
      ) : icon ? (
        <Icon name={icon} className={size === 'icon' ? 'h-4.5 w-4.5' : 'h-4 w-4'} />
      ) : null}
      {children}
    </button>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" className="stroke-current opacity-25" strokeWidth="3" />
      <path
        d="M21 12a9.5 9.5 0 0 0-9.5-9.5"
        className="stroke-current opacity-90"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Label({ children, htmlFor, className = '' }) {
  return (
    <label
      htmlFor={htmlFor}
      className={`mb-1.5 block text-sm font-semibold text-slate-600 ${className}`}
    >
      {children}
    </label>
  );
}

// text-base (16px) on purpose: anything smaller makes iOS Safari zoom the
// viewport when a field is focused. Touch targets stay ≥ 44px (h-11).
const FIELD_BASE =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 text-base text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-900/5 disabled:bg-slate-50 disabled:text-slate-500';

export function Input({ className = '', invalid = false, ...props }) {
  return (
    <input
      className={`${FIELD_BASE} h-11 ${invalid ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-500/10' : ''} ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`${FIELD_BASE} py-2.5 ${className}`} rows={3} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${FIELD_BASE} h-11 appearance-none pr-9 ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, htmlFor, hint, error, children }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
      {error ? <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}

/* --------------------------------------------------------------- layout --- */

export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-2.5">
        {icon ? (
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        ) : null}
        <div>
          <h2 className="text-sm font-bold tracking-tight text-slate-900 sm:text-base">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Badge({ tone = 'slate', children, className = '' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    red: 'bg-rose-50 text-rose-700 ring-rose-600/15',
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/15',
    blue: 'bg-sky-50 text-sky-700 ring-sky-600/15',
    violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Avatar({ name = '', className = 'h-9 w-9 text-xs' }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-bold ${avatarTone(name)} ${className}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-[27px]">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="w-full sm:w-auto">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ icon = 'receipt', title, description, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      {description ? (
        <p className="mt-1 max-w-xs text-sm leading-relaxed text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Alert({ tone = 'error', children, className = '' }) {
  const tones = {
    error: 'border-rose-200 bg-rose-50 text-rose-700',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };
  const icons = { error: 'alert', info: 'info', amber: 'alert', success: 'check' };
  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium ${tones[tone]} ${className}`}
    >
      <Icon name={icons[tone]} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}
