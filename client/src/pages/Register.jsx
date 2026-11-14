import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, Card, Field, Icon, Input } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register({ name, email, password });
      navigate("/pending", { replace: true });
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
            <h1 className="text-lg font-bold">Request an invite</h1>
            <p className="mt-1 text-sm text-slate-300">
              An admin approves every new account before the dashboard unlocks.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
            {error ? <Alert>{error}</Alert> : null}

            <Field label="Full name" htmlFor="name">
              <Input
                id="name"
                autoComplete="name"
                required
                placeholder="Zakaria Hossain"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label="Work email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@office.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              hint="At least 6 characters."
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            <Button type="submit" size="lg" loading={busy} className="w-full">
              Submit for approval
            </Button>

            <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
              <Icon name="shield" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Your account stays{" "}
              <strong className="font-semibold text-slate-600">
                pending
              </strong>{" "}
              until an admin approves it — you&apos;ll be able to log in but not
              see the ledger yet.
            </p>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-slate-900 underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
