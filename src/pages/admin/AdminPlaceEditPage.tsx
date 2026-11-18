import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, LocateFixed, Plus, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthProvider';
import { useReference } from '../../features/provinces/useGeoData';
import {
  addSource, decideSubmission, deletePlace, deleteSource, districtsOf, emptyFacilities, getPlaceFull, listAllCategories,
  listSubmissions, saveFacilities, savePlace, type AdminCategory, type Facilities, type Source, type SourceType,
} from '../../features/admin/adminApi';
import { emptyForm, fromForm, parseThaiCoords, toForm, todayIso, type PlaceForm } from '../../features/admin/placeForm';
import { locatePoint } from '../../features/map/locate';
import { formatOpeningHoursTh } from '../../features/routing/openingHours';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const SOURCE_TYPES: [SourceType, string][] = [
  ['tat', 'ททท.'], ['province', 'เว็บไซต์จังหวัด'], ['national_park', 'กรมอุทยานฯ'], ['local_gov', 'หน่วยงานท้องถิ่น'],
  ['official_social', 'เพจ/เว็บทางการของสถานที่'], ['osm', 'OpenStreetMap'], ['other', 'อื่น ๆ'],
];
const FIELD_TAGS: [string, string][] = [
  ['lat', 'พิกัด'], ['opening_hours_text', 'เวลาเปิด-ปิด'], ['fee_thai', 'ค่าเข้า'], ['phone', 'โทร'],
  ['address', 'ที่อยู่'], ['short_description', 'คำอธิบาย'], ['facilities', 'สิ่งอำนวยความสะดวก'],
];
const FAC: [keyof Facilities, string][] = [
  ['has_toilet', 'ห้องน้ำ'], ['has_parking', 'ที่จอดรถ'], ['elderly_friendly', 'ผู้สูงอายุ'],
  ['wheelchair', 'รถเข็น'], ['kid_friendly', 'เหมาะกับเด็ก'], ['pet_friendly', 'สัตว์เลี้ยง'],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Text({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: 'decimal' | 'numeric' | 'url' | 'tel'; maxLength?: number }) {
  return (
    <label className="block text-sm">{label}
      <input className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </label>
  );
}

function TriState({ value, onChange, label }: { value: boolean | null; onChange: (v: boolean | null) => void; label: string }) {
  return (
    <div className="text-sm">
      <p className="mb-1">{label}</p>
      <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-line">
        {([[true, 'มี'], [false, 'ไม่มี'], [null, 'ไม่ทราบ']] as [boolean | null, string][]).map(([v, l]) => (
          <button key={l} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
            className={`min-h-10 text-xs ${value === v ? 'bg-primary text-on-primary' : ''}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function AdminPlaceEditPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const [params] = useSearchParams();
  const fromSubmission = isNew ? params.get('from') : null;
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { provinces } = useReference();

  const [form, setForm] = useState<PlaceForm>(emptyForm);
  const [fac, setFac] = useState<Facilities>(emptyFacilities);
  const [sources, setSources] = useState<Source[]>([]);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [districts, setDistricts] = useState<{ id: string; pcode: string; name_th: string }[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>(isNew ? 'ok' : 'loading');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [locInfo, setLocInfo] = useState<string | null>(null);
  const [src, setSrc] = useState({ url: '', name: '', type: 'official_social' as SourceType, fields: [] as string[], checked: todayIso() });

  const set = <K extends keyof PlaceForm>(k: K, v: PlaceForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => { listAllCategories().then(setCats).catch(() => setCats([])); }, []);

  useEffect(() => {
    if (isNew) {
      if (!fromSubmission) return;
      listSubmissions().then((subs) => {
        const s = subs.find((x) => x.id === fromSubmission);
        if (!s) { toast('ไม่พบรายการที่เสนอ (อาจถูกตรวจไปแล้ว)', 'error'); return; }
        setForm(toForm({
          name_th: s.name_th, name_en: s.name_en, province_id: s.province_id ?? '', district_id: s.district_id,
          category_id: s.category_id ?? '', short_description: s.short_description, lat: s.lat, lng: s.lng,
          address: s.address, suggested_minutes: s.suggested_minutes, est_cost_per_person: s.est_cost_per_person,
          google_maps_url: s.google_maps_url, verification: 'pending',
        }));
      }).catch((e: Error) => toast(e.message, 'error'));
      return;
    }
    getPlaceFull(id as string).then((d) => {
      if (!d) { setState('missing'); return; }
      setForm(toForm(d.place)); setFac(d.facilities); setSources(d.sources); setState('ok');
    }).catch((e: Error) => { setErr(e.message); setState('missing'); });
  }, [id, isNew, fromSubmission]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    districtsOf(form.province_id).then((d) => alive && setDistricts(d));
    return () => { alive = false; };
  }, [form.province_id]);

  // coordinates -> province / district (point-in-polygon on boundary files)
  useEffect(() => {
    const c = parseThaiCoords(form.coords);
    if (!form.coords.trim()) { setLocInfo(null); return; }
    if (!c) { setLocInfo('พิกัดไม่ถูกต้อง หรืออยู่นอกประเทศไทย'); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const r = await locatePoint(c.lat, c.lng);
      if (!alive) return;
      if (!r) { setLocInfo('หาจังหวัดจากพิกัดไม่พบ'); return; }
      const prov = provinces.find((p) => p.pcode === r.provincePcode);
      const ds = prov ? await districtsOf(prov.id) : [];
      if (!alive) return;
      const d = ds.find((x) => x.pcode === r.districtPcode);
      setLocInfo(`📍 ${prov?.name_th ?? '?'}${d ? ` · ${d.name_th}` : ''}`);
      setForm((f) => (prov && (f.province_id !== prov.id || (d && f.district_id !== d.id))
        ? { ...f, province_id: prov.id, district_id: d?.id ?? '' } : f));
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [form.coords, provinces]);

  const hoursPreview = useMemo(() => formatOpeningHoursTh(form.opening_hours_text), [form.opening_hours_text]);

  if (state === 'loading') return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (state === 'missing') return <EmptyState icon={<Trash2 size={40} />} title={err ?? 'ไม่พบสถานที่นี้'} action={<Link to="/admin/places" className="text-primary underline">กลับ</Link>} />;

  const save = async () => {
    if (!user) return;
    const r = fromForm(form);
    if (!r.ok) { setErr(r.error); return; }
    if (r.input.verification === 'verified' && sources.length === 0) {
      setErr('ตั้งเป็น “ตรวจแล้ว” ต้องมีแหล่งข้อมูลอย่างน้อย 1 แหล่ง — บันทึกเป็น “รอตรวจสอบ” ก่อน แล้วเพิ่มแหล่งข้อมูล');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const placeId = await savePlace(isNew ? null : (id as string), r.input, user.id);
      await saveFacilities(placeId, fac);
      if (fromSubmission) await decideSubmission(fromSubmission, 'approved', placeId);
      toast(fromSubmission ? 'เพิ่มเป็นสถานที่ส่วนกลางแล้ว' : 'บันทึกแล้ว', 'success');
      if (isNew) nav(`/admin/places/${placeId}`, { replace: true });
      else setForm((f) => ({ ...f, verified_at: r.input.verified_at ?? '' }));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const addSrc = async () => {
    const u = src.url.trim();
    if (!/^https?:\/\/[^\s<>"']+$/i.test(u)) { toast('ลิงก์แหล่งข้อมูลต้องขึ้นต้นด้วย http(s)://', 'error'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(src.checked) || src.checked > todayIso()) { toast('วันที่ตรวจไม่ถูกต้อง', 'error'); return; }
    try {
      const s = await addSource(id as string, {
        source_url: u.slice(0, 1000), source_name: src.name.trim().slice(0, 200) || null, source_type: src.type,
        fields: src.fields, checked_at: src.checked, note: null,
      });
      setSources((xs) => [s, ...xs]);
      setSrc({ ...src, url: '', name: '', fields: [] });
      toast('เพิ่มแหล่งข้อมูลแล้ว', 'success');
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const pick = (xs: string[], v: string) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]);

  return (
    <div className="space-y-4 pb-24">
      <header className="flex items-start gap-2">
        <Link to="/admin/places" aria-label="กลับ" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-surface-2"><ArrowLeft /></Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold">{isNew ? (fromSubmission ? 'ตรวจสถานที่ที่ผู้ใช้เสนอ' : 'เพิ่มสถานที่') : form.name_th || 'แก้ไขสถานที่'}</h2>
          {!isNew && <Link to={`/place/${id}`} className="inline-flex items-center gap-1 text-sm text-primary underline"><ExternalLink size={14} /> ดูหน้าสถานที่</Link>}
        </div>
      </header>

      <Section title="ข้อมูลหลัก">
        <Text label="ชื่อภาษาไทย *" value={form.name_th} onChange={(v) => set('name_th', v)} maxLength={200} />
        <Text label="ชื่อภาษาอังกฤษ" value={form.name_en} onChange={(v) => set('name_en', v)} maxLength={200} />
        <label className="block text-sm">หมวดหมู่ *
          <select className="input mt-1" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
            <option value="">เลือกหมวด</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name_th}{c.is_active ? '' : ' (ปิดอยู่)'}</option>)}
          </select>
        </label>
        <label className="block text-sm">คำอธิบายสั้น (เขียนเอง ไม่คัดลอก)
          <textarea className="input mt-1 min-h-20 py-2" maxLength={500} value={form.short_description} onChange={(e) => set('short_description', e.target.value)} />
        </label>
        <label className="block text-sm">จุดเด่น (บรรทัดละ 1 ข้อ สูงสุด 10)
          <textarea className="input mt-1 min-h-20 py-2" value={form.highlights} onChange={(e) => set('highlights', e.target.value)} />
        </label>
      </Section>

      <Section title="ตำแหน่ง">
        <div className="text-sm">
          <label htmlFor="ap-coords">พิกัด (วางลิงก์ Google Maps ได้)</label>
          <div className="mt-1 flex gap-2">
            <input id="ap-coords" className="input" placeholder="13.7563, 100.5018" value={form.coords} onChange={(e) => set('coords', e.target.value)} />
            <Button variant="secondary" aria-label="ใช้ตำแหน่งปัจจุบัน" icon={<LocateFixed size={18} />}
              onClick={() => navigator.geolocation?.getCurrentPosition(
                (p) => set('coords', `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`),
                () => toast('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง', 'error'), { enableHighAccuracy: true, timeout: 10000 })}>ที่นี่</Button>
          </div>
          <p className="mt-1 text-xs text-muted">{locInfo ?? 'ใส่พิกัดแล้วระบบเลือกจังหวัด/อำเภอให้จากเส้นขอบ'}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">จังหวัด *
            <select className="input mt-1" value={form.province_id} onChange={(e) => setForm((f) => ({ ...f, province_id: e.target.value, district_id: '' }))}>
              <option value="">เลือก</option>
              {provinces.map((p) => <option key={p.id} value={p.id}>{p.name_th}</option>)}
            </select>
          </label>
          <label className="block text-sm">อำเภอ
            <select className="input mt-1" value={form.district_id} onChange={(e) => set('district_id', e.target.value)}>
              <option value="">ไม่ระบุ</option>
              {districts.map((d) => <option key={d.id} value={d.id}>{d.name_th}</option>)}
            </select>
          </label>
        </div>
        <Text label="ที่อยู่" value={form.address} onChange={(v) => set('address', v)} maxLength={500} />
        <Text label="ลิงก์ Google Maps" value={form.google_maps_url} onChange={(v) => set('google_maps_url', v)} inputMode="url" />
      </Section>

      <Section title="เวลาและค่าใช้จ่าย (ไม่แน่ใจ = เว้นว่าง)">
        <label className="block text-sm">เวลาเปิด-ปิด
          <input className="input mt-1" placeholder="Mo-Fr 08:30-16:30; Sa,Su 09:00-18:00" value={form.opening_hours_text} onChange={(e) => set('opening_hours_text', e.target.value)} />
          <span className="text-xs text-muted">รูปแบบ OpenStreetMap ใช้คำนวณ Timeline ได้ · แสดงเป็น: {hoursPreview ?? '—'}</span>
        </label>
        <Text label="วันหยุด" value={form.closed_days_text} onChange={(v) => set('closed_days_text', v)} maxLength={300} />
        <div className="grid grid-cols-2 gap-2">
          <Text label="ค่าเข้า คนไทย (บาท)" value={form.fee_thai} onChange={(v) => set('fee_thai', v)} inputMode="decimal" />
          <Text label="ค่าเข้า ต่างชาติ (บาท)" value={form.fee_foreigner} onChange={(v) => set('fee_foreigner', v)} inputMode="decimal" />
          <Text label="ค่าจอดรถ (บาท)" value={form.parking_fee} onChange={(v) => set('parking_fee', v)} inputMode="decimal" />
          <Text label="ค่าใช้จ่ายประมาณ/คน" value={form.est_cost_per_person} onChange={(v) => set('est_cost_per_person', v)} inputMode="decimal" />
          <Text label="เวลาที่ควรใช้ (นาที)" value={form.suggested_minutes} onChange={(v) => set('suggested_minutes', v)} inputMode="numeric" />
          <Text label="ช่วงเวลาที่แนะนำ" value={form.best_time_of_day} onChange={(v) => set('best_time_of_day', v)} placeholder="เช้า / เย็น" />
        </div>
        <div className="text-sm">
          <p className="mb-1">เดือนที่เหมาะ</p>
          <div className="grid grid-cols-6 gap-1">
            {MONTHS.map((m, i) => (
              <button key={m} type="button" aria-pressed={form.best_months.includes(i + 1)}
                onClick={() => set('best_months', pick(form.best_months.map(String), String(i + 1)).map(Number))}
                className={`min-h-10 rounded-lg border text-xs ${form.best_months.includes(i + 1) ? 'border-primary bg-primary text-on-primary' : 'border-line'}`}>{m}</button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="ติดต่อ">
        <Text label="โทรศัพท์" value={form.phone} onChange={(v) => set('phone', v)} inputMode="tel" maxLength={60} />
        <Text label="เว็บไซต์" value={form.website_url} onChange={(v) => set('website_url', v)} inputMode="url" />
        <Text label="Social Media" value={form.social_url} onChange={(v) => set('social_url', v)} inputMode="url" />
      </Section>

      <Section title="สิ่งอำนวยความสะดวก">
        <div className="grid grid-cols-2 gap-3">
          {FAC.map(([k, l]) => <TriState key={k} label={l} value={fac[k]} onChange={(v) => setFac((f) => ({ ...f, [k]: v }))} />)}
        </div>
      </Section>

      <Section title="สถานะ">
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">การตรวจสอบ
            <select className="input mt-1" value={form.verification} onChange={(e) => set('verification', e.target.value as PlaceForm['verification'])}>
              <option value="pending">รอตรวจสอบ</option>
              <option value="verified">ตรวจแล้ว</option>
              <option value="outdated">ข้อมูลเก่า</option>
              <option value="demo">Demo</option>
            </select>
          </label>
          <label className="block text-sm">วันที่ตรวจล่าสุด
            <input type="date" max={todayIso()} className="input mt-1" value={form.verified_at} onChange={(e) => set('verified_at', e.target.value)} />
          </label>
          <label className="block text-sm">สถานะสถานที่
            <select className="input mt-1" value={form.state} onChange={(e) => set('state', e.target.value as PlaceForm['state'])}>
              <option value="active">เปิดปกติ</option>
              <option value="seasonal">เปิดตามฤดูกาล</option>
              <option value="temporarily_closed">ปิดชั่วคราว</option>
              <option value="permanently_closed">ปิดถาวร</option>
            </select>
          </label>
          <Text label="ความนิยม (0–100)" value={form.popularity} onChange={(v) => set('popularity', v)} inputMode="numeric" />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={form.is_published} onChange={(e) => set('is_published', e.target.checked)} /> แสดงให้ผู้ใช้เห็น
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={form.is_demo} onChange={(e) => set('is_demo', e.target.checked)} /> เป็น Demo Data
        </label>
      </Section>

      {!isNew && (
        <Section title={`แหล่งข้อมูล (${sources.length})`}>
          {sources.length === 0 && <p className="text-sm text-amber-700">ยังไม่มีแหล่งข้อมูล — ต้องมีก่อนตั้งเป็น “ตรวจแล้ว”</p>}
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={s.id} className="flex items-start gap-2 rounded-xl bg-surface-2 p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <a href={s.source_url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-primary underline">{s.source_name ?? s.source_url}</a>
                  <p className="text-xs text-muted">
                    {SOURCE_TYPES.find(([k]) => k === s.source_type)?.[1]} · ตรวจ {s.checked_at}
                    {s.fields.length ? ` · ${s.fields.map((f) => FIELD_TAGS.find(([k]) => k === f)?.[1] ?? f).join(', ')}` : ''}
                  </p>
                </div>
                <button type="button" aria-label="ลบแหล่งข้อมูล" className="flex h-9 w-9 items-center justify-center text-red-600"
                  onClick={async () => { try { await deleteSource(s.id); setSources((xs) => xs.filter((x) => x.id !== s.id)); } catch (e) { toast((e as Error).message, 'error'); } }}>
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-2 rounded-xl border border-dashed border-line p-3">
            <Text label="ลิงก์แหล่งข้อมูล" value={src.url} onChange={(v) => setSrc({ ...src, url: v })} inputMode="url" />
            <div className="grid grid-cols-2 gap-2">
              <Text label="ชื่อแหล่ง" value={src.name} onChange={(v) => setSrc({ ...src, name: v })} placeholder="เช่น เพจทางการ" />
              <label className="block text-sm">ประเภท
                <select className="input mt-1" value={src.type} onChange={(e) => setSrc({ ...src, type: e.target.value as SourceType })}>
                  {SOURCE_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
            </div>
            <div className="text-sm">
              <p className="mb-1">ข้อมูลที่ยืนยันจากแหล่งนี้</p>
              <div className="flex flex-wrap gap-1">
                {FIELD_TAGS.map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={src.fields.includes(k)} onClick={() => setSrc({ ...src, fields: pick(src.fields, k) })}
                    className={`min-h-9 rounded-full border px-3 text-xs ${src.fields.includes(k) ? 'border-primary bg-primary text-on-primary' : 'border-line'}`}>{l}</button>
                ))}
              </div>
            </div>
            <label className="block text-sm">วันที่ตรวจ
              <input type="date" max={todayIso()} className="input mt-1" value={src.checked} onChange={(e) => setSrc({ ...src, checked: e.target.value })} />
            </label>
            <Button variant="secondary" className="w-full" icon={<Plus size={18} />} onClick={() => void addSrc()}>เพิ่มแหล่งข้อมูล</Button>
          </div>
        </Section>
      )}
      {isNew && <p className="text-sm text-muted">บันทึกก่อน แล้วจึงเพิ่มแหล่งข้อมูลได้</p>}

      {!isNew && (
        <button type="button" onClick={() => setConfirmDel(true)} className="inline-flex min-h-10 items-center gap-1 text-sm text-red-600">
          <Trash2 size={16} /> ลบสถานที่นี้
        </button>
      )}

      {err && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-800">{err}</p>}

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[560] border-t border-line bg-surface/95 p-3 backdrop-blur lg:bottom-0 lg:left-60">
        <Button className="mx-auto w-full max-w-md" icon={<Save size={20} />} disabled={busy} onClick={() => void save()}>
          {busy ? 'กำลังบันทึก…' : fromSubmission ? 'อนุมัติและเพิ่มสถานที่' : 'บันทึก'}
        </Button>
      </div>

      <ConfirmDialog open={confirmDel} danger busy={busy} title="ลบสถานที่ถาวร?" confirmText="ลบถาวร"
        message={'• แหล่งข้อมูลและสิ่งอำนวยความสะดวกจะถูกลบ\n• สถานะ/รายการโปรดของผู้ใช้สำหรับที่นี่จะหายไป\n• ในทริปและความทรงจำของผู้ใช้จะยังเห็นชื่อเดิม แต่ไม่เชื่อมกับสถานที่นี้แล้ว\n\nถ้าแค่ไม่อยากให้เห็น ให้ปิด “แสดงให้ผู้ใช้เห็น” แทน'}
        onCancel={() => setConfirmDel(false)}
        onConfirm={async () => {
          setBusy(true);
          try { await deletePlace(id as string); toast('ลบแล้ว', 'success'); nav('/admin/places', { replace: true }); }
          catch (e) { toast((e as Error).message, 'error'); setBusy(false); }
        }} />
    </div>
  );
}
