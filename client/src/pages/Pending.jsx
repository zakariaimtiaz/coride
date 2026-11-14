import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Icon, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function Pending() {
  const { user, loading, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate('/login', { replace: true });
    else if (user.status === 'approved') navigate('/', { replace: true });
    else if (user.status === 'rejected') {
      navigate('/login', { replace: true, state: { status: 'rejected' } });
    }
  }, [user, loading, navigate]);

  async function handleCheck() {
    setChecking(true);
    try {
      const next = await refresh();
      if (next.status === 'approved') {
        push('Approved! Opening your dashboard…');
        navigate('/', { replace: true });
      } else if (next.status === 'rejected') {
        navigate('/login', { replace: true, state: { status: 'rejected' } });
      } else {
        push('Still waiting for admin approval.', 'info');
      }
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setChecking(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  if (loading || !user || user.status !== 'pending') {
    return (
      <div className="grid min-h-screen place-items-center text-slate-400">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[440px]">
        <Card className="overflow-hidden text-center">
          <div className="bg-gradient-to-br from-slate-900 to-slate-700 px-6 py-8 text-white">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Icon name="clock" className="h-8 w-8" />
            </span>
            <h1 className="mt-4 text-xl font-extrabold tracking-tight">Awaiting approval</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
              Hi {user.name.split(' ')[0]} — your account is registered but locked until an admin
              approves it.
            </p>
          </div>

          <div className="px-6 py-6">
            <div className="mx-auto flex max-w-xs items-center justify-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-700 ring-1 ring-amber-600/15">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              Status: Pending approval
            </div>

            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              Ask your office admin to open the <strong className="font-semibold text-slate-700">Admin panel</strong>{' '}
              and approve <span className="font-semibold text-slate-700">{user.email}</span>. Once
              approved, tap the button below.
            </p>

            <div className="mt-5 space-y-2.5">
              <Button size="lg" loading={checking} onClick={handleCheck} className="w-full" icon="refresh">
                I&apos;ve been approved — continue
              </Button>
              <Button variant="secondary" size="lg" onClick={handleLogout} className="w-full">
                Log out
              </Button>
            </div>
          </div>
        </Card>

        <p className="mt-4 text-center text-xs text-slate-400">
          This page checks your status with the server — no refresh needed.
        </p>
      </div>
    </div>
  );
}
