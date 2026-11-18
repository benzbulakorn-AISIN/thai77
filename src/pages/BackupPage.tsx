import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, DatabaseBackup, Download, FileJson, FileSpreadsheet, LogIn, ShieldAlert, Trash2, Upload, UserX } from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import { downloadText } from '../features/admin/csv';
import {
  MAX_BACKUP_BYTES, TABLE_LABEL, previewCounts, validateBackup, type Backup, type PreviewLine, type RestoreMode,
} from '../features/backup/backupModel';
import { buildBackup, deleteAccount, existingIds, restoreBackup, wipeMyData, type RestoreResult } from '../features/backup/backupApi';
import { buildTripsCsv } from '../features/backup/tripsCsv';
import { Button } from '../components/ui/Button';
import { BottomSheet } from '../components/ui/BottomSheet';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

type Danger = 'wipe' | 'account' | null;
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); };

export function BackupPage() {
  const { user, loading, signOut } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<{ name: string; backup: Backup } | null>(null);
  const [existing, setExisting] = useState<Awaited<ReturnType<typeof existingIds>> | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [danger, setDanger] = useState<Danger>(null);
  const [typed, setTyped] = useState('');

  if (loading) return <Skeleton className="h-64" />;
  if (!user) {
    return <EmptyState icon={<DatabaseBackup size={40} />} title="เข้าสู่ระบบเพื่อสำรองข้อมูล"
      action={<Link to="/auth/login"><Button icon={<LogIn size={20} />}>เข้าสู่ระบบ</Button></Link>} />;
  }

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { toast((e as Error).message || 'ไม่สำเร็จ', 'error'); } finally { setBusy(null); }
  };

  const exportJson = () => run('กำลังสร้างไฟล์สำรอง…', async () => {
    const b = await buildBackup(user.id);
    downloadText(`thai77-backup-${today()}.json`, JSON.stringify(b, null, 1), 'application/json');
    const n = Object.values(b.data).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0);
    toast(`สำรองแล้ว ${n} รายการ`, 'success');
  });

  const exportCsv = () => run('กำลังสร้าง CSV…', async () => {
    const r = await buildTripsCsv();
    if (!r.trips) { toast('ยังไม่มีทริป', 'info'); return; }
    downloadText(`thai77-trips-${today()}.csv`, r.csv);
    toast(`Export ${r.trips} ทริป · ${r.rows} รายการ`, 'success');
  });

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (fileRef.current) fileRef.current.value = '';
    if (f.size > MAX_BACKUP_BYTES) { toast('ไฟล์ใหญ่เกิน 20 MB', 'error'); return; }
    await run('กำลังตรวจไฟล์…', async () => {
      const v = validateBackup(await f.text());
      if (!v.ok) { toast(v.error, 'error'); return; }
      setExisting(await existingIds(v.backup));
      setFile({ name: f.name, backup: v.backup });
      setMode('merge');
      setResult(null);
    });
  };

  const preview: PreviewLine[] = file && existing ? previewCounts(file.backup, existing, mode) : [];
  const totalInsert = preview.reduce((s, l) => s + l.insert, 0);
  const otherAccount = Boolean(file && file.backup.userId && file.backup.userId !== user.id);

  const doRestore = () => run('กำลังกู้คืน…', async () => {
    if (!file) return;
    setConfirmRestore(false);
    const r = await restoreBackup({ backup: file.backup, uid: user.id, mode, fileName: file.name, onStep: (s) => setBusy(s) });
    setResult(r);
    setFile(null);
    toast(r.failed ? `กู้คืนแล้ว แต่ไม่สำเร็จ ${r.failed} รายการ` : 'กู้คืนเรียบร้อย', r.failed ? 'error' : 'success');
  });

  const doDanger = () => run(danger === 'account' ? 'กำลังลบบัญชี…' : 'กำลังลบข้อมูล…', async () => {
    if (danger === 'wipe') {
      const r = await wipeMyData(user.id, false);
      toast(`ลบข้อมูลการเดินทางแล้ว (รูป ${r.files} ไฟล์)`, 'success');
      setDanger(null); setTyped('');
    } else if (danger === 'account') {
      await deleteAccount();
      localStorage.clear();
      await signOut().catch(() => undefined);
      toast('ลบบัญชีเรียบร้อยแล้ว', 'success');
      nav('/', { replace: true });
    }
  });

  const CONFIRM_WORD = danger === 'account' ? 'ลบบัญชี' : 'ลบข้อมูล';

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/profile" aria-label="กลับ" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2"><ArrowLeft /></Link>
        <h1 className="flex-1 text-2xl font-bold">สำรอง / กู้คืนข้อมูล</h1>
      </header>

      {busy && <p className="rounded-xl bg-surface-2 p-3 text-center text-sm" aria-live="polite">{busy}</p>}

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Download size={18} /> สำรองข้อมูล</h2>
        <p className="text-sm text-muted">ทริป, Timeline, งบประมาณ, สถานที่ที่เคยไป, รีวิว, สถานที่ส่วนตัว, ข้อมูลอ้างอิงรูป และการตั้งค่า</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button icon={<FileJson size={20} />} disabled={Boolean(busy)} onClick={() => void exportJson()}>Backup (JSON)</Button>
          <Button variant="secondary" icon={<FileSpreadsheet size={20} />} disabled={Boolean(busy)} onClick={() => void exportCsv()}>ทริปเป็น CSV</Button>
        </div>
        <ul className="list-inside list-disc text-xs text-muted">
          <li>ไฟล์ JSON <b>ไม่รวมตัวไฟล์รูป</b> — รูปยังอยู่ใน Supabase Storage จนกว่าจะลบ</li>
          <li>ไฟล์มีข้อมูลส่วนตัว (เช่น จุดเริ่มต้นทริป) — เก็บไว้ในที่ปลอดภัย อย่าแชร์</li>
        </ul>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Upload size={18} /> กู้คืนจากไฟล์</h2>
        {!file && (
          <>
            <Button variant="secondary" className="w-full" icon={<Upload size={20} />} disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>เลือกไฟล์ Backup (.json)</Button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          </>
        )}

        {file && (
          <div className="space-y-3">
            <p className="text-sm"><b>{file.name}</b><br /><span className="text-xs text-muted">สร้างเมื่อ {fmt(file.backup.exportedAt)} · รูปแบบ v{file.backup.schemaVersion}</span></p>
            {otherAccount && <p className="rounded-xl bg-amber-100 p-2 text-xs text-amber-900">ไฟล์นี้มาจากบัญชีอื่น — ข้อมูลจะถูกนำเข้าเป็นของคุณ แต่รูปภาพจะกู้คืนไม่ได้</p>}

            <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line text-sm" role="radiogroup" aria-label="วิธีกู้คืน">
              <button type="button" role="radio" aria-checked={mode === 'merge'} onClick={() => setMode('merge')}
                className={`min-h-14 px-2 ${mode === 'merge' ? 'bg-primary text-on-primary' : ''}`}>รวม (Merge)<br /><span className="text-xs opacity-80">เพิ่มเฉพาะที่ยังไม่มี</span></button>
              <button type="button" role="radio" aria-checked={mode === 'replace'} onClick={() => setMode('replace')}
                className={`min-h-14 px-2 ${mode === 'replace' ? 'bg-red-600 text-white' : ''}`}>แทนที่ (Replace)<br /><span className="text-xs opacity-80">ลบของเดิมก่อน</span></button>
            </div>

            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-1">ข้อมูล</th><th className="text-right">ในไฟล์</th><th className="text-right">มีอยู่แล้ว</th><th className="text-right">จะเพิ่ม</th></tr></thead>
              <tbody className="divide-y divide-line">
                {preview.map((l) => (
                  <tr key={l.table}><td className="py-1">{TABLE_LABEL[l.table]}</td><td className="text-right">{l.total}</td>
                    <td className="text-right text-muted">{l.existing}</td><td className="text-right font-semibold">{l.insert}</td></tr>
                ))}
              </tbody>
            </table>
            {preview.length === 0 && <p className="text-sm text-muted">ไฟล์นี้ไม่มีข้อมูล</p>}
            {file.backup.data.userSettings && <p className="text-xs text-muted">+ การตั้งค่า (ธีม, ค่าน้ำมัน) จะถูกใช้ตามไฟล์</p>}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" className="border border-line" onClick={() => setFile(null)}>ยกเลิก</Button>
              <Button variant={mode === 'replace' ? 'danger' : 'primary'} disabled={Boolean(busy) || (mode === 'merge' && totalInsert === 0)}
                onClick={() => setConfirmRestore(true)}>กู้คืน</Button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
            <p className="font-semibold">ผลการกู้คืน</p>
            <p>เพิ่ม {result.inserted} · ข้าม (มีอยู่แล้ว) {result.skipped} · ไม่สำเร็จ {result.failed}</p>
            {result.photosMissing > 0 && <p className="text-xs text-amber-700">รูป {result.photosMissing} รูปไม่มีไฟล์ใน Storage แล้ว — กู้คืนไม่ได้</p>}
            {result.dropped > 0 && <p className="text-xs text-muted">ข้าม {result.dropped} รายการที่อ้างถึงสถานที่ที่ถูกลบไปแล้ว</p>}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-red-300 bg-surface p-4">
        <h2 className="flex items-center gap-2 font-semibold text-red-700"><ShieldAlert size={18} /> พื้นที่อันตราย</h2>
        <p className="text-sm text-muted">แนะนำให้กด “Backup (JSON)” ก่อนทุกครั้ง</p>
        <Button variant="ghost" className="w-full border border-red-300 text-red-700" icon={<Trash2 size={18} />} onClick={() => { setTyped(''); setDanger('wipe'); }}>
          ลบข้อมูลการเดินทางทั้งหมด
        </Button>
        <Button variant="danger" className="w-full" icon={<UserX size={18} />} onClick={() => { setTyped(''); setDanger('account'); }}>ลบบัญชีถาวร</Button>
      </section>

      <ConfirmDialog open={confirmRestore} danger={mode === 'replace'} busy={Boolean(busy)}
        title={mode === 'replace' ? 'แทนที่ข้อมูลทั้งหมด?' : 'รวมข้อมูลจากไฟล์?'} confirmText="กู้คืน"
        message={mode === 'replace'
          ? `ทริป, สถานที่ที่เคยไป, สถานที่ส่วนตัว และสถานะทั้งหมดของคุณจะถูกลบ แล้วแทนด้วยข้อมูลในไฟล์ (${totalInsert} รายการ)\n• ไฟล์รูปใน Storage จะไม่ถูกลบ และจะเชื่อมกลับถ้ามีในไฟล์\n• ทริปที่คุณเป็นเจ้าของแล้วแชร์ให้คนอื่นจะถูกลบสำหรับทุกคน`
          : `เพิ่ม ${totalInsert} รายการที่ยังไม่มี ข้อมูลเดิมจะไม่ถูกแก้ไข`}
        onCancel={() => setConfirmRestore(false)} onConfirm={() => void doRestore()} />

      <BottomSheet open={danger !== null} onClose={() => !busy && setDanger(null)}
        title={danger === 'account' ? 'ลบบัญชีถาวร' : 'ลบข้อมูลการเดินทางทั้งหมด'}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" className="border border-line" disabled={Boolean(busy)} onClick={() => setDanger(null)}>ยกเลิก</Button>
            <Button variant="danger" disabled={typed.trim() !== CONFIRM_WORD || Boolean(busy)} onClick={() => void doDanger()}>{busy ?? 'ลบถาวร'}</Button>
          </div>
        }>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-red-700">สิ่งที่จะถูกลบถาวร (กู้คืนไม่ได้ ยกเว้นจากไฟล์ Backup):</p>
          <ul className="list-inside list-disc space-y-1">
            <li>ทริปที่คุณเป็นเจ้าของ รวม Timeline และงบประมาณ — <b>คนที่คุณชวนจะไม่เห็นทริปนั้นอีก</b></li>
            <li>สถานที่ที่เคยไป รีวิว และ<b>ไฟล์รูปทั้งหมด</b></li>
            <li>สถานที่ส่วนตัว สถานะ และสถานที่โปรด</li>
            {danger === 'account' && <li>บัญชี โปรไฟล์ และการตั้งค่า — ต้องสมัครใหม่ถ้าจะใช้อีก</li>}
          </ul>
          <p className="text-muted">ไม่ถูกลบ: สถานที่ส่วนกลาง{danger === 'account' ? ' (สถานที่ที่คุณเพิ่มในฐานะ Admin จะยังอยู่)' : ' และบัญชีของคุณ'}</p>
          <label className="block pt-2">พิมพ์ <b>{CONFIRM_WORD}</b> เพื่อยืนยัน
            <input className="input mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
        </div>
      </BottomSheet>
    </div>
  );
}
