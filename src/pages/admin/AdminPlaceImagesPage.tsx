import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, ImagePlus, Search, Star, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthProvider';
import { ACCEPT_IMAGES, compressImage, type Compressed } from '../../features/memories/imageCompress';
import { commonsApiUrl, parseCommonsResponse, parseCommonsTitle, type CommonsResult } from '../../features/placeImages/commons';
import {
  LICENSE_CHOICES, MAX_IMAGES_PER_PLACE, OWN_LICENSE, creditText, sortImages, validateImageMeta, type PlaceImage,
} from '../../features/placeImages/imageModel';
import {
  addCommonsImage, addUploadedImage, deleteImage, fetchPlaceImageSet, getPlaceBasics, setCover,
} from '../../features/placeImages/placeImagesApi';
import { clearCoverCache } from '../../features/placeImages/usePlaceCovers';
import { PlaceThumb } from '../../features/placeImages/PlaceImage';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

type Tab = 'commons' | 'upload';
type Picked = { comp: Compressed; preview: string };

async function callCommons(url: string): Promise<CommonsResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) return { ok: false, error: `Commons ตอบกลับผิดปกติ (${res.status})` };
    return parseCommonsResponse(await res.json());
  } catch {
    return { ok: false, error: 'เชื่อมต่อ Wikimedia Commons ไม่ได้ ลองใหม่อีกครั้ง' };
  } finally {
    clearTimeout(timer);
  }
}

export function AdminPlaceImagesPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const toast = useToast();
  const [place, setPlace] = useState<{ id: string; name_th: string } | null | undefined>(undefined);
  const [images, setImages] = useState<PlaceImage[]>([]);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('commons');
  const [busy, setBusy] = useState<string | null>(null);
  const [del, setDel] = useState<PlaceImage | null>(null);

  // Wikimedia Commons form
  const [cUrl, setCUrl] = useState('');
  const [check, setCheck] = useState<CommonsResult | null>(null);
  const [cAuthor, setCAuthor] = useState('');
  const [cAlt, setCAlt] = useState('');
  const [cCopy, setCCopy] = useState(true);

  // own-upload form
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [uLicense, setULicense] = useState(OWN_LICENSE);
  const [uAuthor, setUAuthor] = useState('');
  const [uSource, setUSource] = useState('');
  const [uAlt, setUAlt] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [p, set] = await Promise.all([getPlaceBasics(id), fetchPlaceImageSet(id)]);
      setPlace(p);
      setImages(sortImages(set.images));
      setCoverId(set.coverId);
      setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.preview); }, [picked]);

  if (error) return <div className="space-y-2"><p className="text-red-600">{error}</p><Button onClick={() => void load()}>ลองใหม่</Button></div>;
  if (place === undefined) return <Skeleton className="h-64" />;
  if (place === null || !id) return <EmptyState icon={<ImagePlus size={40} />} title="ไม่พบสถานที่นี้" action={<Link to="/admin/places" className="text-primary underline">กลับ</Link>} />;

  const nextOrder = images.reduce((m, i) => Math.max(m, i.sort_order + 1), 0);
  const full = images.length >= MAX_IMAGES_PER_PLACE;
  const effectiveCover = images.find((i) => i.id === coverId)?.id ?? images[0]?.id ?? null;

  const afterChange = async (newId?: string) => {
    clearCoverCache();
    if (newId && !images.some((i) => i.id === coverId)) { // first picture becomes the cover
      try { await setCover(id, newId); } catch { /* keep going: the first picture is shown anyway */ }
    }
    await load();
  };

  // ---------- Commons ----------
  const doCheck = async () => {
    const title = parseCommonsTitle(cUrl);
    if (!title) { toast('ใส่ลิงก์หน้าไฟล์จาก commons.wikimedia.org (ไฟล์ JPG/PNG/WebP) เช่น …/wiki/File:ชื่อไฟล์.jpg', 'error'); return; }
    setBusy('กำลังตรวจสอบกับ Commons…');
    setCheck(null);
    const r = await callCommons(commonsApiUrl(title));
    setBusy(null);
    setCheck(r);
    if (r.ok) { setCAuthor(r.info.author); setCAlt(`ภาพ${place.name_th}`); }
  };

  const addCommons = async () => {
    if (!check || !check.ok) return;
    if (full) { toast(`ใส่ได้สูงสุด ${MAX_IMAGES_PER_PLACE} รูปต่อสถานที่`, 'error'); return; }
    if (images.some((i) => i.source_url === check.info.pageUrl)) { toast('เพิ่มรูปนี้ไว้แล้ว', 'info'); return; }
    const meta = validateImageMeta({ license: check.info.license, author: cAuthor, source_url: check.info.pageUrl, alt_th: cAlt });
    if (!meta.ok) { toast(meta.error, 'error'); return; }
    setBusy(cCopy ? 'กำลังบันทึกสำเนารูป…' : 'กำลังบันทึก…');
    try {
      const r = await addCommonsImage({ placeId: id, info: check.info, meta: meta.value, copy: cCopy, sortOrder: nextOrder });
      toast(r.mode === 'copy' ? 'เพิ่มรูปแล้ว (เก็บสำเนาไว้ในระบบเรา)' : 'เพิ่มรูปแล้ว (ลิงก์จาก Wikimedia โดยตรง)', 'success');
      setCheck(null); setCUrl('');
      await afterChange(r.image.id);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };

  // ---------- own upload ----------
  const onFile = async (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    setBusy('กำลังย่อรูป…');
    try {
      const comp = await compressImage(f);
      setPicked({ comp, preview: URL.createObjectURL(comp.blob) });
      if (!uAuthor && profile?.display_name) setUAuthor(profile.display_name);
      if (!uAlt) setUAlt(`ภาพ${place.name_th}`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };

  const doUpload = async () => {
    if (!picked) return;
    if (full) { toast(`ใส่ได้สูงสุด ${MAX_IMAGES_PER_PLACE} รูปต่อสถานที่`, 'error'); return; }
    const meta = validateImageMeta({ license: uLicense, author: uAuthor, source_url: uSource, alt_th: uAlt });
    if (!meta.ok) { toast(meta.error, 'error'); return; }
    setBusy('กำลังอัปโหลด…');
    try {
      const img = await addUploadedImage({ placeId: id, comp: picked.comp, meta: meta.value, sortOrder: nextOrder });
      toast('เพิ่มรูปแล้ว', 'success');
      setPicked(null); setUSource('');
      await afterChange(img.id);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };

  const makeCover = async (img: PlaceImage) => {
    setBusy('กำลังบันทึก…');
    try { await setCover(id, img.id); clearCoverCache(); await load(); toast('ตั้งเป็นรูปปกแล้ว', 'success'); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };

  const doDelete = async () => {
    if (!del) return;
    setBusy('กำลังลบ…');
    try { await deleteImage(del); clearCoverCache(); setDel(null); await load(); toast('ลบรูปแล้ว', 'success'); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-2">
        <Link to={`/place/${id}`} aria-label="กลับไปหน้าสถานที่" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2"><ArrowLeft /></Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight">รูปภาพ</h2>
          <p className="truncate text-sm text-muted">{place.name_th} · {images.length}/{MAX_IMAGES_PER_PLACE} รูป</p>
        </div>
      </header>

      {busy && <p role="status" className="rounded-xl bg-surface-2 p-3 text-center text-sm">{busy}</p>}

      <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
        ใส่ได้เฉพาะรูปที่ใช้ได้ถูกลิขสิทธิ์: ภาพถ่ายของเราเอง หรือรูปจาก Wikimedia Commons ที่ License เป็น CC0 / Public domain / CC BY / CC BY-SA
        ทุกรูปต้องมี License + ผู้ถ่าย + ลิงก์ที่มา และเว็บจะแสดงเครดิตใต้รูปให้เอง ห้ามนำรูปจากเว็บอื่น / Google / Facebook / Instagram
      </p>

      {/* current pictures */}
      <section aria-label="รูปของสถานที่นี้" className="space-y-2">
        {images.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-4 text-center text-sm text-muted">ยังไม่มีรูป — ตอนนี้เว็บแสดงภาพปกอัตโนมัติ (มีป้าย “ภาพประกอบ”)</p>
        ) : (
          <ul className="space-y-2">
            {images.map((im) => (
              <li key={im.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2">
                <span className="relative block h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2"><PlaceThumb image={im} /></span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block truncate">{creditText(im)}</span>
                  <span className="block truncate text-xs text-muted">{im.storage_path ? 'เก็บในระบบของเรา' : 'ลิงก์จาก Wikimedia'}{im.id === effectiveCover ? ' · รูปปก' : ''}</span>
                  {im.source_url && <a href={im.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs text-primary underline"><ExternalLink size={12} /> ที่มา</a>}
                </span>
                <button type="button" aria-label={im.id === effectiveCover ? 'รูปปก' : 'ตั้งเป็นรูปปก'} aria-pressed={im.id === effectiveCover} disabled={Boolean(busy)} onClick={() => void makeCover(im)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-2">
                  <Star size={20} className={im.id === effectiveCover ? 'fill-amber-400 text-amber-400' : 'text-muted'} />
                </button>
                <button type="button" aria-label="ลบรูป" disabled={Boolean(busy)} onClick={() => setDel(im)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-red-600 hover:bg-surface-2">
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* add */}
      <section aria-label="เพิ่มรูป" className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line text-sm" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'commons'} onClick={() => setTab('commons')} className={`min-h-11 ${tab === 'commons' ? 'bg-primary text-on-primary' : ''}`}>จาก Wikimedia Commons</button>
          <button type="button" role="tab" aria-selected={tab === 'upload'} onClick={() => setTab('upload')} className={`min-h-11 ${tab === 'upload' ? 'bg-primary text-on-primary' : ''}`}>อัปโหลดรูปเอง</button>
        </div>
        {full && <p className="text-sm text-amber-700">ครบ {MAX_IMAGES_PER_PLACE} รูปแล้ว — ลบรูปเดิมก่อนจึงจะเพิ่มได้</p>}

        {tab === 'commons' ? (
          <div className="space-y-3">
            <label className="block text-sm">ลิงก์หน้าไฟล์บน Commons
              <input className="input mt-1" inputMode="url" placeholder="https://commons.wikimedia.org/wiki/File:ชื่อไฟล์.jpg" value={cUrl}
                onChange={(e) => { setCUrl(e.target.value); setCheck(null); }} />
            </label>
            <Button variant="secondary" className="w-full" icon={<Search size={18} />} disabled={Boolean(busy) || !cUrl.trim()} onClick={() => void doCheck()}>ตรวจสอบ License</Button>

            {check && !check.ok && (
              <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm text-red-800">
                ใช้รูปนี้ไม่ได้: {check.error}{check.license ? ` (License: ${check.license})` : ''}
              </p>
            )}
            {check && check.ok && (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-xl bg-surface-2">
                  <img src={check.info.thumbUrl} alt="ตัวอย่างรูปจาก Commons" referrerPolicy="no-referrer" className="max-h-64 w-full object-contain" />
                </div>
                <p className="rounded-xl bg-green-100 p-3 text-sm text-green-900">
                  ✓ ใช้ได้ — License: <b>{check.info.license}</b>
                  {check.info.licenseKind === 'cc-by' || check.info.licenseKind === 'cc-by-sa' ? ' (ต้องให้เครดิต — เว็บแสดงให้เอง)' : ''}
                </p>
                {check.info.warnings.map((w) => <p key={w} className="text-xs text-amber-800">⚠ {w}</p>)}
                <a href={check.info.pageUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm text-primary underline"><ExternalLink size={14} /> เปิดหน้าไฟล์เพื่อตรวจอีกครั้ง</a>
                <label className="block text-sm">ชื่อผู้ถ่าย *
                  <input className="input mt-1" maxLength={200} value={cAuthor} onChange={(e) => setCAuthor(e.target.value)} />
                </label>
                <label className="block text-sm">คำอธิบายรูป (alt)
                  <input className="input mt-1" maxLength={200} value={cAlt} onChange={(e) => setCAlt(e.target.value)} />
                </label>
                <label className="flex min-h-11 items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 h-5 w-5" checked={cCopy} onChange={(e) => setCCopy(e.target.checked)} />
                  <span>เก็บสำเนาไว้ในระบบเรา (แนะนำ — Wikimedia ไม่แนะนำให้ลิงก์ตรง เพราะไฟล์อาจถูกเปลี่ยนหรือลบ) ถ้าดาวน์โหลดไม่ได้จะลิงก์จาก Wikimedia แทน</span>
                </label>
                <Button className="w-full" icon={<ImagePlus size={20} />} disabled={Boolean(busy) || full} onClick={() => void addCommons()}>เพิ่มรูปนี้</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Button variant="secondary" className="w-full" icon={<Upload size={18} />} disabled={Boolean(busy) || full} onClick={() => fileRef.current?.click()}>เลือกรูปจากเครื่อง</Button>
            <input ref={fileRef} type="file" accept={ACCEPT_IMAGES} hidden onChange={(e) => void onFile(e.target.files?.[0])} />
            {picked && (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-xl bg-surface-2"><img src={picked.preview} alt="ตัวอย่างรูปที่เลือก" className="max-h-64 w-full object-contain" /></div>
                <p className="text-xs text-muted">ย่อแล้ว {picked.comp.width}×{picked.comp.height}px · {Math.round(picked.comp.blob.size / 1024)} KB · ลบข้อมูล GPS ออกแล้ว</p>
                <label className="block text-sm">License *
                  <select className="input mt-1" value={uLicense} onChange={(e) => setULicense(e.target.value)}>
                    {LICENSE_CHOICES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm">ชื่อผู้ถ่าย *
                  <input className="input mt-1" maxLength={200} value={uAuthor} onChange={(e) => setUAuthor(e.target.value)} />
                </label>
                <label className="block text-sm">ลิงก์ที่มา {uLicense === OWN_LICENSE ? '(ไม่บังคับสำหรับภาพถ่ายของเราเอง)' : '*'}
                  <input className="input mt-1" inputMode="url" placeholder="https://…" value={uSource} onChange={(e) => setUSource(e.target.value)} />
                </label>
                <label className="block text-sm">คำอธิบายรูป (alt)
                  <input className="input mt-1" maxLength={200} value={uAlt} onChange={(e) => setUAlt(e.target.value)} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="ghost" className="border border-line" onClick={() => setPicked(null)}>ยกเลิก</Button>
                  <Button icon={<Upload size={20} />} disabled={Boolean(busy) || full} onClick={() => void doUpload()}>อัปโหลด</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <ConfirmDialog open={del !== null} danger busy={Boolean(busy)} title="ลบรูปนี้?" confirmText="ลบ"
        message={`ลบรูปนี้ออกจากสถานที่ “${place.name_th}”${del?.storage_path ? '\nไฟล์ที่เก็บไว้ในระบบจะถูกลบด้วย' : ''}`}
        onCancel={() => setDel(null)} onConfirm={() => void doDelete()} />
    </div>
  );
}
