import { Link } from 'react-router-dom';
import { Camera, ChevronRight, LogIn, LogOut, MapPinPlus, Palette, ShieldCheck } from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import { ThemePicker } from '../features/settings/ThemePicker';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { t } from '../i18n/th';

const MENU = [
  { to: '/my-places', label: 'สถานที่ส่วนตัว', Icon: MapPinPlus },
  { to: '/memories', label: 'ความทรงจำของฉัน', Icon: Camera },
];

export function ProfilePage() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const toast = useToast();

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-4">
        {user ? (
          <div className="space-y-3">
            <div>
              <p className="font-semibold">{profile?.display_name ?? user.email}</p>
              <p className="text-sm text-muted">{user.email}</p>
            </div>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900">
                <ShieldCheck size={16} /> Admin
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">โหมดผู้เยี่ยมชม — ข้อมูลจะเก็บในเครื่องนี้เท่านั้น</p>
            <Link to="/auth/login"><Button className="w-full" icon={<LogIn size={20} />}>{t.auth.login}</Button></Link>
          </div>
        )}
      </section>

      {user && (
        <nav className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {MENU.map(({ to, label, Icon }) => (
            <Link key={to} to={to} className="flex min-h-14 items-center gap-3 px-4 hover:bg-surface-2">
              <Icon size={20} className="text-primary" />
              <span className="flex-1">{label}</span>
              <ChevronRight size={18} className="text-muted" />
            </Link>
          ))}
        </nav>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Palette size={18} /> ธีม</h2>
        <ThemePicker />
      </section>

      {user && (
        <Button variant="secondary" icon={<LogOut size={20} />} className="w-full"
          onClick={async () => { await signOut(); toast('ออกจากระบบแล้ว', 'success'); }}>
          {t.auth.logout}
        </Button>
      )}
    </div>
  );
}
