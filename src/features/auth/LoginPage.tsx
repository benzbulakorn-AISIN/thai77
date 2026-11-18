import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LogIn, Mail, UserRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n/th';
import { useAuth } from './AuthProvider';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function LoginPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailOk(email) || password.length < 6) { toast('กรอกอีเมลและรหัสผ่าน (อย่างน้อย 6 ตัว)', 'error'); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      const msg = error.message.includes('Email not confirmed')
        ? 'อีเมลยังไม่ได้ยืนยัน'
        : error.message.includes('Invalid login')
          ? t.auth.loginFailed
          : `เข้าสู่ระบบไม่สำเร็จ: ${error.message}`;
      toast(msg, 'error');
      return;
    }
    toast('ยินดีต้อนรับ', 'success');
    nav('/', { replace: true });
  };

  const onForgot = async () => {
    if (!emailOk(email)) { toast('กรอกอีเมลก่อน', 'error'); return; }
    const redirectTo = window.location.origin + window.location.pathname; // base URL, no hash
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    toast(error ? 'ส่งไม่สำเร็จ ลองใหม่ภายหลัง' : t.auth.resetSent, error ? 'error' : 'success');
  };

  return (
    <div className="mx-auto max-w-sm space-y-6 py-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-on-primary">
          <LogIn size={30} />
        </div>
        <h1 className="text-2xl font-bold">{t.auth.login}</h1>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm">
          {t.auth.email}
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="input mt-1" />
        </label>
        <label className="block text-sm">
          {t.auth.password}
          <input type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} className="input mt-1" />
        </label>
        <Button type="submit" disabled={busy} className="w-full" icon={<LogIn size={20} />}>
          {busy ? t.common.loading : t.auth.login}
        </Button>
      </form>
      <div className="flex justify-between text-sm">
        <button type="button" onClick={onForgot} className="flex items-center gap-1 text-primary">
          <Mail size={16} /> {t.auth.forgot}
        </button>
        <button type="button" onClick={() => nav('/')} className="flex items-center gap-1 text-muted">
          <UserRound size={16} /> {t.auth.guest}
        </button>
      </div>
    </div>
  );
}
