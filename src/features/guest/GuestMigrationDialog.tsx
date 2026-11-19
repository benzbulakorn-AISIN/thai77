import { useState } from 'react';
import { Bookmark, CircleCheck, Heart, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { guestStore, useGuestPlaces } from './guestStore';
import { summaryText } from './migrate';
import { migrateGuestData } from './migrateApi';

const SNOOZE_KEY = 'thai77.guest.snooze';
const readSnooze = () => { try { return sessionStorage.getItem(SNOOZE_KEY) === '1'; } catch { return false; } };

/**
 * Shown once after signing in when this device holds places saved as a guest:
 * move them into the account, decide later, or delete them (they may belong to someone else on a shared computer).
 */
export function GuestMigrationDialog() {
  const { user, loading } = useAuth();
  const toast = useToast();
  const guest = useGuestPlaces();
  const [snoozed, setSnoozed] = useState(readSnooze);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const c = guest.counts;
  const open = !loading && user !== null && c.entries > 0 && !snoozed;
  if (!open || !user) return null;

  const later = () => {
    try { sessionStorage.setItem(SNOOZE_KEY, '1'); } catch { /* private mode: it will ask again next time */ }
    setSnoozed(true);
  };

  const migrate = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await migrateGuestData(user.id, guest.items);
      guestStore.remove(r.handledIds); // only after every write succeeded
      toast(summaryText(r.summary), 'success');
      // the lists already on screen were loaded before the move: reload once so every page shows the account's data
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setError((e as Error).message || 'ย้ายไม่สำเร็จ ลองใหม่อีกครั้ง');
      setBusy(false);
    }
  };

  return (
    <>
      <BottomSheet open title="ย้ายข้อมูลในเครื่องนี้ขึ้นบัญชี?" onClose={() => { if (!busy) later(); }}
        footer={
          <div className="space-y-2">
            <Button className="w-full" disabled={busy} onClick={() => void migrate()}>{busy ? 'กำลังย้าย…' : 'ย้ายขึ้นบัญชี'}</Button>
            <Button variant="ghost" className="w-full border border-line" disabled={busy} onClick={later}>ไว้ทีหลัง</Button>
          </div>
        }>
        <p className="text-sm">ก่อนเข้าสู่ระบบ เครื่องนี้บันทึกสถานที่ไว้ให้คุณแล้ว:</p>
        <ul className="grid grid-cols-3 gap-2 text-center text-sm">
          <li className="rounded-xl bg-surface-2 p-2"><Bookmark size={18} className="mx-auto text-primary" /><b className="block text-lg">{c.want}</b>อยากไป</li>
          <li className="rounded-xl bg-surface-2 p-2"><CircleCheck size={18} className="mx-auto text-primary" /><b className="block text-lg">{c.visited}</b>ไปมาแล้ว</li>
          <li className="rounded-xl bg-surface-2 p-2"><Heart size={18} className="mx-auto text-rose-500" /><b className="block text-lg">{c.favorite}</b>โปรด</li>
        </ul>
        <p className="text-sm">จะย้ายเข้าบัญชี <b className="break-all">{user.email}</b></p>
        <p className="text-xs text-muted">
          ไม่ทับของเดิมในบัญชี: ถ้าบัญชีมีสถานะที่ก้าวหน้ากว่าอยู่แล้ว (เช่น “ไปมาแล้ว”) จะไม่ถูกเปลี่ยนกลับเป็น “อยากไป” และรายการโปรดเดิมไม่ถูกลบ
          ข้อมูลในเครื่องจะถูกลบออกหลังย้ายสำเร็จเท่านั้น
        </p>
        {error && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-800">{error}</p>}
        <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)}
          className="inline-flex min-h-11 items-center gap-1 text-sm text-red-600 disabled:opacity-50">
          <Trash2 size={16} /> ไม่ใช่ของฉัน — ลบจากเครื่องนี้
        </button>
      </BottomSheet>

      <ConfirmDialog open={confirmDelete} danger title="ลบข้อมูลในเครื่องนี้?" confirmText="ลบ"
        message={`สถานที่ที่บันทึกไว้ในเครื่องนี้ ${c.entries} แห่งจะถูกลบ (ไม่ได้ย้ายเข้าบัญชีใด ๆ) บัญชี ${user.email} ไม่ถูกกระทบ`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => { guestStore.clear(); setConfirmDelete(false); toast('ลบข้อมูลในเครื่องแล้ว', 'success'); }} />
    </>
  );
}
