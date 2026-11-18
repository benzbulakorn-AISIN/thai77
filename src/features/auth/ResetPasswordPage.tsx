import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n/th';
import { PasswordField } from './PasswordField';
import { MIN_PASSWORD, checkPassword } from './passwordRules';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';

export function ResetPasswordPage() {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const nav = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkPassword(pw).ok) { toast(`รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`, 'error'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast('ลิงก์หมดอายุ ขอใหม่อีกครั้ง', 'error'); return; }
    toast(t.auth.passwordUpdated, 'success');
    nav('/', { replace: true });
  };

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4 py-6">
      <h1 className="text-2xl font-bold">{t.auth.setPassword}</h1>
      <PasswordField label={t.auth.newPassword} value={pw} onChange={setPw} autoComplete="new-password" showRules />
      <Button type="submit" disabled={busy} className="w-full" icon={<KeyRound size={20} />}>{t.common.save}</Button>
    </form>
  );
}
