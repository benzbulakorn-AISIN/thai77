import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, EyeOff, FlaskConical, Inbox, Link2Off, MapPin, MapPinOff, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { adminStats, markStale, staleCutoff, type AdminStats } from '../../features/admin/adminApi';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

export function AdminDashboard() {
  const toast = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [stale, setStale] = useState<{ months: number; cutoff: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await staleCutoff();
      setStale(s);
      setStats(await adminStats(s.cutoff));
      setError(null);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="space-y-2"><p className="text-red-600">{error}</p><Button onClick={() => void load()}>ลองใหม่</Button></div>;
  if (!stats || !stale) return <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>;

  const cards = [
    { n: stats.total, label: 'สถานที่ทั้งหมด', Icon: MapPin, to: '/admin/places', tone: 'text-primary' },
    { n: stats.verified, label: 'ตรวจแล้ว', Icon: ShieldCheck, to: '/admin/places?verification=verified', tone: 'text-green-600' },
    { n: stats.pending, label: 'รอตรวจสอบ', Icon: TriangleAlert, to: '/admin/places?verification=pending', tone: 'text-amber-600' },
    { n: stats.outdated + stats.stale, label: `ข้อมูลเก่า (>${stale.months} เดือน)`, Icon: Clock, to: '/admin/places?problem=stale', tone: 'text-slate-500' },
    { n: stats.noCoords, label: 'ไม่มีพิกัด', Icon: MapPinOff, to: '/admin/places?problem=nocoords', tone: 'text-red-600' },
    { n: stats.noSource, label: 'ไม่มีแหล่งข้อมูล', Icon: Link2Off, to: '/admin/places', tone: 'text-red-600' },
    { n: stats.unpublished, label: 'ปิดการแสดง', Icon: EyeOff, to: '/admin/places?published=no', tone: 'text-muted' },
    { n: stats.demo, label: 'Demo Data', Icon: FlaskConical, to: '/admin/places?demo=yes', tone: 'text-violet-600' },
    { n: stats.submissions, label: 'ผู้ใช้เสนอสถานที่', Icon: Inbox, to: '/admin/review', tone: 'text-primary' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map(({ n, label, Icon, to, tone }) => (
          <Link key={label} to={to} className="rounded-2xl border border-line bg-surface p-4 hover:bg-surface-2">
            <Icon size={20} className={tone} />
            <p className="mt-2 text-2xl font-bold">{n.toLocaleString('th-TH')}</p>
            <p className="text-xs text-muted">{label}</p>
          </Link>
        ))}
      </div>

      {stats.stale > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p className="flex-1 text-sm">มี {stats.stale} สถานที่ที่ตรวจไว้นานกว่า {stale.months} เดือน (ก่อน {stale.cutoff})</p>
          <Button variant="secondary" icon={<RefreshCw size={18} />} onClick={() => setConfirm(true)}>ทำเครื่องหมาย “ข้อมูลเก่า”</Button>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4 text-sm">
        <p className="mb-1 font-semibold">หลักการข้อมูล</p>
        <ul className="list-inside list-disc space-y-1 text-muted">
          <li>ตั้งเป็น “ตรวจแล้ว” ได้เมื่อมีแหล่งข้อมูลอย่างน้อย 1 แหล่ง</li>
          <li>ห้ามเดาเวลาเปิด-ปิดหรือราคา — ไม่แน่ใจให้เว้นว่าง (แอปจะแสดง “รอตรวจสอบ”)</li>
          <li>เขียนคำอธิบายด้วยคำของเราเอง ไม่คัดลอกจากเว็บอื่น</li>
        </ul>
      </section>

      <ConfirmDialog open={confirm} busy={busy} title="ทำเครื่องหมายข้อมูลเก่า?" confirmText="ยืนยัน"
        message={`${stats.stale} สถานที่จะเปลี่ยนจาก “ตรวจแล้ว” เป็น “ข้อมูลเก่า” เพื่อให้ตรวจใหม่`}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try { const n = await markStale(stale.cutoff); toast(`อัปเดต ${n} สถานที่`, 'success'); setConfirm(false); await load(); }
          catch (e) { toast((e as Error).message, 'error'); }
          finally { setBusy(false); }
        }} />
    </div>
  );
}
