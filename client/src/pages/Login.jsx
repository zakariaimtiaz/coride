import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Card, Field, Icon, Input } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { clearLastEmail, getLastEmail, setLastEmail } from "../lib/lastUser.js";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState(() => getLastEmail());
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // First-render value: non-empty only when an email was remembered on this
  // browser — focus the password field so only the password needs typing.
  const prefilled = useRef(email).current;
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  useEffect(() => {
    if (prefilled) passwordRef.current?.focus();
  }, [prefilled]);

  function handleClearEmail() {
    setEmail("");
    clearLastEmail();
    emailRef.current?.focus();
  }

  const rejectedNotice = location.state?.status === "rejected";

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login(email, password);
      setLastEmail(email); // remember who logged in on this browser
      navigate(user.status === "pending" ? "/pending" : "/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-white shadow-sm">
            <Icon name="car" className="h-6 w-6" />
          </span>
          <div>
            <p className="text-lg font-extrabold tracking-tight text-slate-900">
              CoRide
            </p>
            <p className="text-xs font-medium text-slate-500">
              Ride sharing, settled simply.
            </p>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 bg-gradient-to-br from-slate-900 to-slate-700 px-5 py-5 text-white">
            <h1 className="text-lg font-bold">Welcome back</h1>
            <p className="mt-1 text-sm text-slate-300">
              Log in to see this month&apos;s pooled rides and balances.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
            {rejectedNotice ? (
              <Alert tone="amber">
                Your previous registration was rejected. You can register again
                below.
              </Alert>
            ) : null}
            {error ? <Alert>{error}</Alert> : null}

            <Field label="Email" htmlFor="email">
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@office.local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  ref={emailRef}
                  className="pr-10"
                />
                {email ? (
                  <button
                    type="button"
                    onClick={handleClearEmail}
                    aria-label="Clear remembered email"
                    className="absolute inset-y-0 right-1 grid w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </Field>

            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                ref={passwordRef}
              />
            </Field>

            <Button type="submit" size="lg" loading={busy} className="w-full">
              Log in
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-slate-500">
          New here?{" "}
          <Link
            to="/register"
            className="font-semibold text-slate-900 underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
