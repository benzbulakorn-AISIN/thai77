import { Link, NavLink, Outlet } from 'react-router-dom';
import { ArrowLeft, FileUp, Inbox, Landmark, LayoutDashboard, MapPin, ShieldAlert, Tags } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthProvider';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

const TABS = [
  { to: '/admin', label: 'ภาพรวม', Icon: LayoutDashboard, end: true },
  { to: '/admin/places', label: 'สถานที่', Icon: MapPin, end: false },
  { to: '/admin/import', label: 'นำเข้า', Icon: FileUp, end: false },
  { to: '/admin/landmarks', label: 'Landmark', Icon: Landmark, end: false },
  { to: '/admin/categories', label: 'หมวดหมู่', Icon: Tags, end: false },
  { to: '/admin/review', label: 'รอตรวจ', Icon: Inbox, end: false },
];

/** Guard + tab bar for every /admin page. Real protection is RLS; this only hides the UI. */
export function AdminShell() {
  const { user, profile, isAdmin, loading } = useAuth();
  if (loading || (user && !profile)) return <Skeleton className="h-64" />;
  if (!user || !isAdmin) {
    return <EmptyState icon={<ShieldAlert size={40} />} title="สำหรับ Admin เท่านั้น" action={<Link to="/" className="text-primary underline">กลับหน้าแรก</Link>} />;
  }
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/profile" aria-label="กลับ" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2"><ArrowLeft /></Link>
        <h1 className="flex-1 text-2xl font-bold">Admin</h1>
      </header>
      <nav className="grid grid-cols-3 overflow-hidden rounded-xl border border-line bg-surface text-[11px] sm:grid-cols-6 sm:text-sm">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }: { isActive: boolean }) => `flex min-h-12 flex-col items-center justify-center gap-0.5 sm:flex-row sm:gap-2 ${isActive ? 'bg-primary text-on-primary' : ''}`}>
            <Icon size={18} /> {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
