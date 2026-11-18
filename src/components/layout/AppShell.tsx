import { useEffect, useState, type CSSProperties } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, MapPinned, User, WifiOff } from 'lucide-react';
import { NAV_ITEMS } from './navItems';
import { t } from '../../i18n/th';
import { env } from '../../lib/env';
import { useAuth } from '../../features/auth/AuthProvider';
import { useCart } from '../../features/cart/CartProvider';
import { CartBar } from '../../features/cart/CartBar';

const COLLAPSE_KEY = 'thai77.nav.collapsed';

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

/** side menu: expanded (240px) or icons only (72px); remembered on this device */
function useCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* private mode */ }
  }, [collapsed]);
  return [collapsed, () => setCollapsed((v) => !v)];
}

const Badge = ({ n }: { n: number }) =>
  n > 0 ? <span className="absolute -right-2 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">{n}</span> : null;

function ProfileButton() {
  const { user, profile } = useAuth();
  const name = (profile?.display_name || user?.email || '').trim();
  const initial = name.charAt(0).toUpperCase();
  return (
    <Link to="/profile" aria-label={t.nav.profile}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-sm font-semibold text-primary">
      {initial || <User size={20} />}
    </Link>
  );
}

export function AppShell() {
  const online = useOnline();
  const { items } = useCart();
  const [collapsed, toggle] = useCollapsed();
  const cartCount = items.length;

  return (
    <div className="min-h-dvh bg-bg text-fg lg:flex" style={{ '--nav-w': collapsed ? '72px' : '240px' } as CSSProperties}>
      {/* ---------- Desktop side menu ---------- */}
      <aside aria-label={t.nav.side}
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex ${collapsed ? 'w-[72px]' : 'w-60'}`}>
        <div className={`flex h-14 items-center gap-2 border-b border-line ${collapsed ? 'justify-center' : 'px-4'}`}>
          <MapPinned className="shrink-0 text-primary" size={24} />
          {!collapsed && <span className="truncate text-lg font-bold text-primary">{t.appName}</span>}
        </div>
        <nav aria-label={t.nav.main} className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} aria-label={label} title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3 rounded-xl ${collapsed ? 'justify-center' : 'px-3'} ${isActive ? 'bg-primary text-on-primary' : 'hover:bg-surface-2'}`}>
              <span className="relative"><Icon size={20} />{to === '/trips' && <Badge n={cartCount} />}</span>
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <button type="button" onClick={toggle} aria-expanded={!collapsed}
            aria-label={collapsed ? t.nav.expand : t.nav.collapse} title={collapsed ? t.nav.expand : undefined}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-muted hover:bg-surface-2">
            {collapsed ? <ChevronsRight size={20} /> : <><ChevronsLeft size={20} /><span className="text-sm">{t.nav.collapse}</span></>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ---------- Top bar ---------- */}
        <header className="sticky top-0 z-[500] flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
          <Link to="/" aria-label={t.appName} className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
            <MapPinned className="shrink-0 text-primary" size={22} />
            <span className="min-w-0">
              <span className="block truncate text-base font-bold leading-tight">{t.appName}</span>
              <span className="block truncate text-[11px] leading-tight text-muted">{t.slogan}</span>
            </span>
          </Link>
          <p className="hidden min-w-0 flex-1 truncate text-sm text-muted lg:block">{t.slogan}</p>
          <ProfileButton />
        </header>

        {!online && (
          <div className="flex items-center gap-2 bg-amber-500 px-4 py-2 text-sm text-black">
            <WifiOff size={16} /> {t.common.offline}
          </div>
        )}
        {!env.isConfigured && (
          <div className="bg-red-600 px-4 py-2 text-sm text-white">
            ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
          </div>
        )}
        <main className={`mx-auto w-full max-w-5xl flex-1 px-4 pt-4 lg:pb-8 ${cartCount ? 'pb-52 lg:pb-24' : 'pb-32'}`}>
          <Outlet />
        </main>
      </div>

      <CartBar />

      {/* ---------- Mobile bottom menu (center "ทริป" button is raised) ---------- */}
      <nav aria-label={t.nav.main}
        className="fixed inset-x-0 bottom-0 z-[500] grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV_ITEMS.map(({ to, label, Icon }) => {
          const primary = to === '/trips';
          return (
            <NavLink key={to} to={to} end={to === '/'} aria-label={label} className="block">
              {({ isActive }) => (
                <span className={`relative flex h-16 flex-col items-center gap-1 text-xs ${primary ? 'justify-end pb-2' : 'justify-center'} ${isActive ? 'font-semibold text-primary' : 'text-muted'}`}>
                  {primary ? (
                    <span data-testid="nav-primary"
                      className={`absolute -top-5 flex h-14 w-14 items-center justify-center rounded-full border-4 border-bg bg-primary text-on-primary shadow-lg ${isActive ? 'ring-2 ring-primary' : ''}`}>
                      <Icon size={26} />
                      <Badge n={cartCount} />
                    </span>
                  ) : (
                    <Icon size={22} />
                  )}
                  {label}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
