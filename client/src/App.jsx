import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { isAdminRole } from './lib/roles.js';
import Admin from './pages/Admin.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Pending from './pages/Pending.jsx';
import Register from './pages/Register.jsx';
import Rides from './pages/Rides.jsx';
import Settle from './pages/Settle.jsx';
import Settings from './pages/Settings.jsx';

function FullScreenLoading() {
  return (
    <div className="grid min-h-screen place-items-center text-slate-400">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

/** Route guard: requires a signed-in, admin-approved account. */
function Protected({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (user.status === 'pending') return <Navigate to="/pending" replace />;
  if (user.status === 'rejected') {
    return <Navigate to="/login" replace state={{ status: 'rejected' }} />;
  }
  if (adminOnly && !isAdminRole(user.role)) return <Navigate to="/" replace />;

  return children ?? <Outlet />;
}

/** Route guard for login/register — sends signed-in users to their destination. */
function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (user?.status === 'approved') return <Navigate to="/" replace />;
  if (user?.status === 'pending') return <Navigate to="/pending" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <Login />
          </GuestOnly>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnly>
            <Register />
          </GuestOnly>
        }
      />
      <Route path="/pending" element={<Pending />} />

      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/rides" element={<Rides />} />
        <Route path="/settle" element={<Settle />} />
        <Route path="/settings" element={<Settings />} />
        <Route
          path="/admin"
          element={
            <Protected adminOnly>
              <Admin />
            </Protected>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
