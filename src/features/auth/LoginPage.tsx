import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Cloud, LogIn, Lock, Mail, UserRound, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n/th';
import { useAuth } from './AuthProvider';
import { LoginArt } from './LoginArt';
import { PasswordField } from './PasswordField';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const BENEFITS = [
  { Icon: Cloud, text: 'ซิงก์ข้ามเครื่อง' },
  { Icon: Lock, text: 'รูปเป็นส่วนตัว' },
  { Icon: Users, text: 'วางแผนร่วมกัน' },
];

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
    <div className="mx-auto max-w-sm space-y-5 py-2">
      <LoginArt />

      <div className="text-center">
        <h1 className="text-2xl font-bold">{t.auth.login}</h1>
        <p className="mt-1 text-sm text-muted">เพื่อบันทึกทริปและความทรงจำของคุณ</p>
      </div>

      <ul className="flex flex-wrap justify-center gap-2" aria-label="ประโยชน์ของการเข้าสู่ระบบ">
        {BENEFITS.map(({ Icon, text }) => (
          <li key={text} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs">
            <Icon size={14} className="text-primary" /> {text}
          </li>
        ))}
      </ul>

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm">
          {t.auth.email}
          <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1" />
        </label>
        <PasswordField label={t.auth.password} value={password} onChange={setPassword} autoComplete="current-password" />
        <Button type="submit" disabled={busy} className="w-full" icon={<LogIn size={20} />}>
          {busy ? t.common.loading : t.auth.login}
        </Button>
      </form>

      <div className="flex justify-between text-sm">
        <button type="button" onClick={onForgot} className="flex min-h-11 items-center gap-1 text-primary">
          <Mail size={16} /> {t.auth.forgot}
        </button>
        <button type="button" onClick={() => nav('/')} className="flex min-h-11 items-center gap-1 text-muted">
          <UserRound size={16} /> {t.auth.guest}
        </button>
      </div>
    </div>
  );
}
