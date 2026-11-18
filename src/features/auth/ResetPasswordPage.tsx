import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n/th';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';

export function ResetPasswordPage() {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const nav = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) { toast('รหัสผ่านอย่างน้อย 8 ตัว', 'error'); return; }
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
      <label className="block text-sm">
        {t.auth.newPassword}
        <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)}
          className="input mt-1" />
      </label>
      <Button type="submit" disabled={busy} className="w-full" icon={<KeyRound size={20} />}>{t.common.save}</Button>
    </form>
  );
}
