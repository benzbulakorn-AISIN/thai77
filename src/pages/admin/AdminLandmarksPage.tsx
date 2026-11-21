import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Image, Landmark, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useReference } from '../../features/provinces/useGeoData';
import {
  listLandmarkAdminRows, publishLandmark, unpublishLandmark,
  type ImageReviewQueue, type LandmarkAdminRow,
} from '../../features/admin/landmarkApi';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

type PendingAction = { row: LandmarkAdminRow; publish: boolean } | null;

const STATUS: Record<LandmarkAdminRow['landmark_status'], string> = {
  draft: 'ฉบับร่าง', pending: 'รอเผยแพร่', published: 'เผยแพร่แล้ว', rejected: 'ไม่ผ่าน',
};

function ImageState({ queue, hasCover }: { queue?: ImageReviewQueue; hasCover: boolean }) {
  if (hasCover) return <span className="text-green-700">มีรูปจริง</span>;
  if (!queue) return <span className="text-amber-700">ภาพปกอัตโนมัติ</span>;
  return (
    <a href={queue.commons_search_url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-amber-700 underline">
      <Search size={13} /> ตรวจ Commons
    </a>
  );
}

export function AdminLandmarksPage() {
  const toast = useToast();
  const { provinces } = useReference();
  const [rows, setRows] = useState<LandmarkAdminRow[] | null>(null);
  const [imageQueue, setImageQueue] = useState<Map<string, ImageReviewQueue>>(new Map());
  const [candidateCounts, setCandidateCounts] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);

  const load = () => listLandmarkAdminRows()
    .then((d) => { setRows(d.rows); setImageQueue(d.imageQueue); setCandidateCounts(d.candidateCounts); setError(null); })
    .catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);

  const provinceNames = useMemo(() => new Map(provinces.map((p) => [p.id, p.name_th])), [provinces]);
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('th');
    return (rows ?? []).filter((r) => !q || r.name_th.toLocaleLowerCase('th').includes(q)
      || (provinceNames.get(r.province_id) ?? '').toLocaleLowerCase('th').includes(q));
  }, [rows, query, provinceNames]);
  const published = (rows ?? []).filter((r) => r.landmark_status === 'published' && r.is_published).length;

  const confirm = async () => {
    if (!action) return;
    setBusy(true);
    try {
      if (action.publish) await publishLandmark(action.row.id); else await unpublishLandmark(action.row.id);
      toast(action.publish ? 'เผยแพร่ Landmark แล้ว' : 'ยกเลิกเผยแพร่แล้ว', 'success');
      setAction(null);
      await load();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  if (error) return <div className="space-y-2"><p className="text-red-600">{error}</p><Button onClick={load}>ลองใหม่</Button></div>;
  if (!rows) return <Skeleton className="h-72" />;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Landmark size={19} /> Landmark 77 จังหวัด</h2>
        <p className="mt-1 text-sm text-muted">นำเข้าแล้ว {rows.length}/77 · เผยแพร่แล้ว {published}/77</p>
        <p className="mt-2 text-xs text-muted">ปุ่มเผยแพร่คือการยืนยันโดย Admin: ระบบจะตั้ง verified/published พร้อมกัน ส่วนรูปจริงต้องผ่านหน้า File ของ Wikimedia Commons; ถ้ายังไม่ผ่านจะใช้ภาพปกอัตโนมัติ</p>
      </section>

      <label className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-3">
        <Search size={18} className="text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาจังหวัดหรือ Landmark" className="min-w-0 flex-1 bg-transparent outline-none" />
      </label>

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {shown.map((r) => {
          const q = imageQueue.get(r.id);
          const isPublished = r.landmark_status === 'published' && r.is_published;
          return (
            <li key={r.id} className="space-y-2 p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{provinceNames.get(r.province_id) ?? '—'} · {r.name_th}</p>
                  <p className="text-xs text-muted">{r.place_key} · อันดับ {r.landmark_rank} · {STATUS[r.landmark_status]} · {r.verification}</p>
                  <p className="mt-1 text-xs"><ImageState queue={q} hasCover={Boolean(r.cover_image_id)} />
                    {(candidateCounts.get(r.province_id) ?? 0) > 0 && <span className="ml-2 text-muted">Candidate {candidateCounts.get(r.province_id)} รายการ</span>}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${isPublished ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
                  {isPublished ? 'สาธารณะ' : 'Admin เท่านั้น'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Link to={`/admin/places/${r.id}`} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line text-xs">ตรวจข้อมูล</Link>
                <Link to={`/admin/places/${r.id}/images`} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-line text-xs"><Image size={14} /> รูป</Link>
                <button type="button" onClick={() => setAction({ row: r, publish: !isPublished })}
                  className={`min-h-10 rounded-lg px-2 text-xs font-medium ${isPublished ? 'border border-line' : 'bg-primary text-on-primary'}`}>
                  {isPublished ? 'ยกเลิกเผยแพร่' : 'ยืนยันและเผยแพร่'}
                </button>
              </div>
              {q?.commons_page_url && <a href={q.commons_page_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline"><ExternalLink size={12} /> เปิดหน้าไฟล์ Commons</a>}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog open={Boolean(action)}
        title={action?.publish ? 'ยืนยันและเผยแพร่ Landmark?' : 'ยกเลิกเผยแพร่ Landmark?'}
        message={action?.publish
          ? `“${action.row.name_th}” จะถูกตั้งเป็น verified/published และใช้เป็นเกณฑ์ “ถึงแล้ว” ของจังหวัด\n\nหากยังไม่มีรูปจริง ระบบจะคงภาพปกอัตโนมัติไว้`
          : `“${action?.row.name_th ?? ''}” จะหายจากหน้าสาธารณะ แต่ตราจังหวัดที่ผู้ใช้เคยได้รับจะไม่ถูกลบ`}
        confirmText={busy ? 'กำลังบันทึก…' : action?.publish ? 'เผยแพร่' : 'ยกเลิกเผยแพร่'}
        onCancel={() => !busy && setAction(null)} onConfirm={() => void confirm()} />
    </div>
  );
}
