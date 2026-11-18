import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, Inbox, MapPin, MapPinOff, X } from 'lucide-react';
import { useReference } from '../../features/provinces/useGeoData';
import { decideSubmission, listAllCategories, listSubmissions, type AdminCategory, type Submission } from '../../features/admin/adminApi';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

export function AdminReviewPage() {
  const toast = useToast();
  const { provinces } = useReference();
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reject, setReject] = useState<Submission | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSubmissions().then(setSubs).catch((e: Error) => setError(e.message));
    listAllCategories().then(setCats).catch(() => setCats([]));
  }, []);

  const provName = useMemo(() => new Map(provinces.map((p) => [p.id, p.name_th])), [provinces]);
  const catName = useMemo(() => new Map(cats.map((c) => [c.id, c.name_th])), [cats]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!subs) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">สถานที่ที่ผู้ใช้เสนอให้เพิ่มเป็นสถานที่ส่วนกลาง (ไม่เห็นบันทึกส่วนตัวของผู้ใช้) · อนุมัติแล้วจะเริ่มเป็น “รอตรวจสอบ” จนกว่าจะเพิ่มแหล่งข้อมูล</p>
      {subs.length === 0 && <EmptyState icon={<Inbox size={40} />} title="ไม่มีรายการรอตรวจ" />}
      {subs.map((s) => (
        <article key={s.id} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
          <div>
            <p className="font-semibold">{s.name_th}</p>
            <p className="text-xs text-muted">
              {(s.province_id && provName.get(s.province_id)) || 'ไม่ระบุจังหวัด'} · {(s.category_id && catName.get(s.category_id)) || 'ไม่ระบุหมวด'} · เสนอโดย {s.owner_name ?? 'ผู้ใช้'}
            </p>
          </div>
          {s.short_description && <p className="text-sm">{s.short_description}</p>}
          <p className="flex flex-wrap gap-3 text-xs">
            {s.lat != null ? (
              <a className="inline-flex items-center gap-1 text-primary underline" target="_blank" rel="noopener noreferrer"
                href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=17/${s.lat}/${s.lng}`}><MapPin size={12} /> ดูพิกัด</a>
            ) : <span className="inline-flex items-center gap-1 text-amber-700"><MapPinOff size={12} /> ไม่มีพิกัด</span>}
            {s.google_maps_url && (
              <a className="inline-flex items-center gap-1 text-primary underline" target="_blank" rel="noopener noreferrer nofollow" href={s.google_maps_url}><ExternalLink size={12} /> ลิงก์ที่แนบ</a>
            )}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" className="border border-line" icon={<X size={18} />} onClick={() => setReject(s)}>ปฏิเสธ</Button>
            <Link to={`/admin/places/new?from=${s.id}`}><Button className="w-full" icon={<Check size={18} />}>ตรวจและเพิ่ม</Button></Link>
          </div>
        </article>
      ))}

      <ConfirmDialog open={reject !== null} danger busy={busy} title="ปฏิเสธรายการนี้?" confirmText="ปฏิเสธ"
        message={`“${reject?.name_th ?? ''}” จะยังเป็นสถานที่ส่วนตัวของผู้ใช้ตามเดิม แต่จะไม่ถูกเพิ่มเป็นสถานที่ส่วนกลาง`}
        onCancel={() => setReject(null)}
        onConfirm={async () => {
          if (!reject) return;
          setBusy(true);
          try {
            await decideSubmission(reject.id, 'rejected');
            setSubs((xs) => (xs ?? []).filter((x) => x.id !== reject.id));
            toast('ปฏิเสธแล้ว', 'success');
            setReject(null);
          } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
        }} />
    </div>
  );
}
