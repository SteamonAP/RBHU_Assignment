import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import { cn } from '../../lib/utils';
import Button from '../ui/Button';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/customers', label: 'Customers' },
  { to: '/shipments', label: 'Shipments' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/chat', label: 'AI Assistant' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useSocket();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white md:w-64 md:border-b-0 md:border-r">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            LO
          </span>
          <span className="text-lg font-semibold text-slate-800">LogiOps</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-2 md:flex-1 md:flex-col md:space-y-1 md:p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'block shrink-0 rounded-md px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 md:px-6">
          <h1 className="text-base font-semibold text-slate-700">
            Operations Platform
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">
                {user?.name ?? 'User'}
              </p>
              <p className="text-xs capitalize text-slate-500">
                {user?.role ?? ''}
              </p>
            </div>
            <Button variant="secondary" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
