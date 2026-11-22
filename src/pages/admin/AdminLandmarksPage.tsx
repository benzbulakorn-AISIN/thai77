import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, Image, Landmark, Link2, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { useReference } from '../../features/provinces/useGeoData';
import {
  linkLandmarkBundleRows, listLandmarkAdminRows, loadLandmarkLinkContext,
  publishProvinceLandmark, reviewProvinceLandmark, unpublishProvinceLandmark,
  type LandmarkAdminRow,
} from '../../features/admin/landmarkApi';
import {
  analyzeLandmarkBundle, landmarkMappingCsv, parseLandmarkBundle, summarizeLandmarkLinks,
  type AnalyzedLandmarkLink,
} from '../../features/admin/landmarkImportModel';

const STATUS: Record<LandmarkAdminRow['status'], string> = {
  draft: 'ฉบับร่าง', pending: 'รอตรวจ/รอเผยแพร่', published: 'เผยแพร่แล้ว', rejected: 'ไม่ผ่าน',
};

function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ImageStatus({ row }: { row: LandmarkAdminRow }) {
  if (row.cover_image_id) return <span className="text-green-700">มีรูปปกจริงที่อนุมัติแล้ว</span>;
  const image = row.image;
  if (!image) return <span className="text-amber-700">AutoCover · ภาพประกอบ</span>;
  const label = image.image_status === 'license_verified_visual_pending' ? 'รอตรวจภาพเต็มขนาด'
    : image.image_status === 'rejected_as_cover' ? 'ไม่ผ่านเป็นภาพปก' : 'ยังไม่มีภาพ';
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-amber-700">
      AutoCover · ภาพประกอบ · {label}
      {image.source_url && <a href={image.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline"><ExternalLink size={12} /> หน้า File</a>}
    </span>
  );
}

function LandmarkCard({ row, provinceName, reload }: { row: LandmarkAdminRow; provinceName: string; reload: () => Promise<void> }) {
  const toast = useToast();
  const [rank, setRank] = useState(row.rank);
  const [reason, setReason] = useState(row.landmark_reason_th);
  const [busy, setBusy] = useState(false);
  const isPublished = row.status === 'published' && row.is_published;
  const placeReady = row.verification === 'verified' && row.place_is_published;

  const review = async (status: 'pending' | 'rejected') => {
    setBusy(true);
    try {
      await reviewProvinceLandmark({ id: row.id, rank, reason, status });
      toast(status === 'rejected' ? 'ปฏิเสธ Candidate แล้ว — ยังไม่เผยแพร่' : 'บันทึกการตรวจแล้ว — ยังไม่เผยแพร่', 'success');
      await reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  const togglePublish = async () => {
    setBusy(true);
    try {
      if (isPublished) await unpublishProvinceLandmark(row.id); else await publishProvinceLandmark(row.id);
      toast(isPublished ? 'ยกเลิกเผยแพร่แล้ว' : 'เผยแพร่ Landmark แล้ว', 'success');
      await reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  return (
    <article className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{provinceName} · {row.name_th}</h3>
          <p className="text-xs text-muted">{row.place_key} · {STATUS[row.status]} · place: {row.verification}/{row.place_is_published ? 'published' : 'private'}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs ${isPublished ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
          {isPublished ? 'สาธารณะ' : 'Admin เท่านั้น'}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[7rem_1fr]">
        <label className="text-xs text-muted">อันดับ 1–3
          <input type="number" min={1} max={3} value={rank} onChange={(e) => setRank(Number(e.target.value))}
            className="mt-1 min-h-10 w-full rounded-lg border border-line bg-background px-3" />
        </label>
        <label className="text-xs text-muted">เหตุผล Landmark
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-line bg-background p-3 text-sm" />
        </label>
      </div>
      <p className="flex items-center gap-1 text-xs"><Image size={14} /><ImageStatus row={row} /></p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Link to={`/admin/places/${row.place_id}`} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line text-xs">ตรวจสถานที่</Link>
        <Link to={`/admin/places/${row.place_id}/images`} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line text-xs">จัดการรูปจริง</Link>
        <button disabled={busy} onClick={() => void review(row.status === 'rejected' ? 'pending' : 'rejected')}
          className="min-h-10 rounded-lg border border-line px-2 text-xs disabled:opacity-50">
          {row.status === 'rejected' ? 'คืนเป็น pending' : 'ปฏิเสธ Candidate'}
        </button>
        <button disabled={busy || (!isPublished && !placeReady)} onClick={() => void togglePublish()}
          title={!isPublished && !placeReady ? 'ตรวจและเผยแพร่สถานที่หลักก่อน' : undefined}
          className="min-h-10 rounded-lg bg-primary px-2 text-xs font-medium text-on-primary disabled:opacity-40">
          {isPublished ? 'ยกเลิกเผยแพร่' : 'เผยแพร่ Landmark'}
        </button>
      </div>
      <Button disabled={busy || !reason.trim() || rank < 1 || rank > 3} onClick={() => void review('pending')}>บันทึกการตรวจ (ยังไม่เผยแพร่)</Button>
    </article>
  );
}

export function AdminLandmarksPage() {
  const toast = useToast();
  const { provinces } = useReference();
  const [rows, setRows] = useState<LandmarkAdminRow[] | null>(null);
  const [preview, setPreview] = useState<AnalyzedLandmarkLink[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmLink, setConfirmLink] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const reload = async () => {
    const data = await listLandmarkAdminRows();
    setRows(data); setError(null);
  };
  useEffect(() => { reload().catch((e: Error) => setError(e.message)); }, []);

  const names = useMemo(() => new Map(provinces.map((p) => [p.id, p.name_th])), [provinces]);
  const summary = preview ? summarizeLandmarkLinks(preview) : null;

  const choose = async (file: File) => {
    setError(null); setPreview(null); setFileName(file.name);
    try {
      const [bundle, ctx] = await Promise.all([file.text().then((t) => parseLandmarkBundle(file.name, t)), loadLandmarkLinkContext()]);
      setPreview(analyzeLandmarkBundle(bundle, ctx));
    } catch (e) { setError((e as Error).message); }
  };

  const apply = async () => {
    if (!preview || preview.some((r) => r.kind !== 'ready')) return;
    setConfirmLink(false); setProgress({ done: 0, total: preview.length });
    try {
      const result = await linkLandmarkBundleRows(preview, (done, total) => setProgress({ done, total }));
      if (result.failed) throw new Error(`เชื่อมสำเร็จ ${result.linked} แต่ล้มเหลว ${result.failed}: ${result.errors[0]?.message ?? ''}`);
      toast(`เชื่อม Landmark ${result.linked} แห่งเป็น pending แล้ว — ยังไม่เผยแพร่`, 'success');
      setPreview(null); setFileName('');
      await reload();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setProgress(null); }
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Landmark size={19} /> Landmark ภาคเหนือ</h2>
        <p className="text-sm text-muted">แยกเป็น 2 ขั้น: นำเข้า places ก่อน แล้วอัปโหลด bundle เพื่อจับคู่ place_id จริงและเชื่อมอันดับ/เหตุผล/แหล่งข้อมูล/metadata รูป</p>
        <p className="text-xs text-amber-800">การเชื่อมและการอนุมัติ Candidate ไม่ใช่การเผยแพร่ ทุกแถวถูกบังคับเป็น pending/is_published=false และรูปที่ยังไม่ตรวจเต็มขนาดใช้ AutoCover พร้อมป้าย “ภาพประกอบ”</p>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-on-primary">
          <Upload size={17} /> เลือก northern_landmark_link_manifest.json
          <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f); e.currentTarget.value = ''; }} />
        </label>
      </section>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {summary && preview && (
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <h3 className="font-semibold"><Link2 size={17} className="mr-1 inline" /> Preview · {fileName}</h3>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded-xl bg-surface-2 p-2">ทั้งหมด<br /><b>{summary.total}</b></div>
            <div className="rounded-xl bg-green-50 p-2 text-green-800">พร้อม<br /><b>{summary.ready}</b></div>
            <div className="rounded-xl bg-red-50 p-2 text-red-700">ผิดพลาด<br /><b>{summary.error}</b></div>
            <div className="rounded-xl bg-surface-2 p-2">ID เดิม/ชื่อ<br /><b>{summary.fixedId}/{summary.exactName}</b></div>
          </div>
          <div className="max-h-72 overflow-auto rounded-xl border border-line text-xs">
            {preview.map((r) => <div key={r.item.place_key} className="grid grid-cols-[1fr_auto] gap-2 border-b border-line p-2 last:border-0">
              <span>{r.item.province_name_th} · #{r.item.landmark_rank} {r.item.place_name_th}<br /><span className="text-muted">{r.matchReason ?? r.errors.join(' · ')}</span></span>
              <b className={r.kind === 'ready' ? 'text-green-700' : 'text-red-600'}>{r.kind === 'ready' ? 'พร้อม' : 'หยุด'}</b>
            </div>)}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="ghost" icon={<Download size={17} />} onClick={() => downloadText('northern_landmark_place_id_mapping.csv', landmarkMappingCsv(preview), 'text/csv;charset=utf-8')}>Export mapping place_id จริง</Button>
            <Button disabled={summary.error > 0 || Boolean(progress)} onClick={() => setConfirmLink(true)}>{progress ? `${progress.done}/${progress.total}` : 'เชื่อมเป็น pending (ไม่ Publish)'}</Button>
          </div>
        </section>
      )}

      {rows === null ? <Skeleton className="h-48" /> : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">ยังไม่มี Landmark ที่เชื่อมแล้ว — หลังนำเข้า places ให้ Preview bundle ด้านบนก่อน</p>
      ) : (
        <section className="space-y-3">
          <p className="text-sm text-muted">เชื่อมแล้ว {rows.length} แห่ง · เผยแพร่ {rows.filter((r) => r.is_published).length} แห่ง</p>
          {rows.map((row) => <LandmarkCard key={row.id} row={row} provinceName={names.get(row.province_id) ?? '—'} reload={reload} />)}
        </section>
      )}

      <ConfirmDialog open={confirmLink} title="เชื่อม Landmark กับ place_id จริง?"
        message={`ระบบจะเชื่อม ${summary?.ready ?? 0} แถวเป็น pending/is_published=false เพิ่มแหล่งข้อมูลแบบไม่ให้ค่าว่างทับของเดิม และเก็บรูปที่ยังไม่ตรวจเต็มขนาดเป็น metadata ใน place_images โดยไม่ตั้งเป็นปก\n\nขั้นตอนนี้ไม่ Import place, ไม่ Publish และไม่อัปโหลดรูป`}
        confirmText="เชื่อมเป็น pending" onCancel={() => setConfirmLink(false)} onConfirm={() => void apply()} />
    </div>
  );
}
