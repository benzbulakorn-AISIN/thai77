import { useEffect, useState } from 'react';
import { LocateFixed, MapPin, Save, Trash2 } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useReference } from '../provinces/useGeoData';
import type { Category } from '../places/types';
import { locatePoint, parseLatLng } from '../map/locate';
import { districtIdByPcode, type UserPlace, type UserPlaceInput } from './userPlacesApi';

type Props = {
  open: boolean;
  place: UserPlace | null;
  categories: Category[];
  /** coordinates to start with when adding a NEW place (e.g. a point tapped on the map) */
  initialCoords?: string;
  onClose: () => void;
  onSave: (v: UserPlaceInput, id: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const numOrNull = (s: string) => {
  const t = s.replace(/[,\s฿]/g, '');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : NaN;
};

export function UserPlaceSheet({ open, place, categories, initialCoords, onClose, onSave, onDelete }: Props) {
  const { provinces } = useReference();
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [cat, setCat] = useState('');
  const [coords, setCoords] = useState('');
  const [provinceId, setProvinceId] = useState('');
  const [district, setDistrict] = useState<{ id: string; name_th: string } | null>(null);
  const [desc, setDesc] = useState('');
  const [address, setAddress] = useState('');
  const [minutes, setMinutes] = useState('');
  const [cost, setCost] = useState('');
  const [gmaps, setGmaps] = useState('');
  const [notes, setNotes] = useState('');
  const [submit, setSubmit] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locInfo, setLocInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(place?.name_th ?? '');
    setNameEn(place?.name_en ?? '');
    setCat(place?.category_id ?? categories.find((c) => c.slug === 'other')?.id ?? '');
    setCoords(place?.lat != null && place?.lng != null ? `${place.lat}, ${place.lng}` : initialCoords ?? '');
    setProvinceId(place?.province_id ?? '');
    setDistrict(place?.district_id ? { id: place.district_id, name_th: '' } : null);
    setDesc(place?.short_description ?? '');
    setAddress(place?.address ?? '');
    setMinutes(place?.suggested_minutes != null ? String(place.suggested_minutes) : '');
    setCost(place?.est_cost_per_person != null ? String(place.est_cost_per_person) : '');
    setGmaps(place?.google_maps_url ?? '');
    setNotes(place?.notes ?? '');
    setSubmit(place?.submission === 'submitted');
    setLocInfo(null);
    setErr(null);
  }, [open, place, categories, initialCoords]);

  // auto-detect province/district from coordinates (point-in-polygon on the boundary files)
  useEffect(() => {
    if (!open) return;
    const ll = parseLatLng(coords);
    if (!ll) { setLocInfo(coords.trim() ? 'พิกัดไม่ถูกต้อง' : null); return; }
    let alive = true;
    const t = setTimeout(async () => {
      setLocating(true);
      const r = await locatePoint(ll.lat, ll.lng);
      if (!alive) return;
      setLocating(false);
      if (!r) { setLocInfo('พิกัดอยู่นอกประเทศไทย หรือหาจังหวัดไม่พบ — เลือกจังหวัดเอง'); setDistrict(null); return; }
      const prov = provinces.find((p) => p.pcode === r.provincePcode);
      if (prov) setProvinceId(prov.id);
      const d = r.districtPcode ? await districtIdByPcode(r.districtPcode) : null;
      if (!alive) return;
      setDistrict(d);
      setLocInfo(`📍 ${prov?.name_th ?? ''}${d ? ` · ${d.name_th}` : ''}`);
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [coords, open, provinces]);

  if (!open) return null;

  const useHere = () => {
    if (!navigator.geolocation) { setErr('อุปกรณ์นี้หาตำแหน่งไม่ได้'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`),
      () => setErr('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const save = async () => {
    const nm = name.trim();
    if (!nm) { setErr('กรอกชื่อสถานที่'); return; }
    const ll = coords.trim() ? parseLatLng(coords) : null;
    if (coords.trim() && !ll) { setErr('พิกัดไม่ถูกต้อง เช่น 13.7563, 100.5018 หรือวางลิงก์ Google Maps'); return; }
    const m = numOrNull(minutes), c = numOrNull(cost);
    if (Number.isNaN(m) || (m != null && (m < 5 || m > 1440))) { setErr('เวลาที่ใช้ 5–1440 นาที'); return; }
    if (Number.isNaN(c)) { setErr('ค่าใช้จ่ายไม่ถูกต้อง'); return; }
    const url = gmaps.trim();
    if (url && !/^https?:\/\/\S+$/i.test(url)) { setErr('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://'); return; }
    // keep district only if it belongs to the chosen province (auto-detected from the same coordinates)
    const v: UserPlaceInput = {
      name_th: nm.slice(0, 200),
      name_en: nameEn.trim().slice(0, 200) || null,
      province_id: provinceId || null,
      district_id: ll && district ? district.id : null,
      category_id: cat || null,
      short_description: desc.trim().slice(0, 500) || null,
      lat: ll?.lat ?? null,
      lng: ll?.lng ?? null,
      address: address.trim().slice(0, 500) || null,
      suggested_minutes: m == null ? null : Math.round(m),
      est_cost_per_person: c,
      google_maps_url: url || null,
      notes: notes.trim().slice(0, 2000) || null,
      submission: submit ? 'submitted' : place?.submission === 'approved' ? 'approved' : 'private',
    };
    setBusy(true);
    setErr(null);
    try { await onSave(v, place?.id ?? null); onClose(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <BottomSheet open onClose={onClose} title={place ? 'แก้ไขสถานที่ส่วนตัว' : 'เพิ่มสถานที่ส่วนตัว'}
      footer={<Button className="w-full" icon={<Save size={20} />} disabled={busy || locating} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>}>
      <label className="block text-sm">ชื่อสถานที่ *
        <input className="input mt-1" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-sm">ชื่อภาษาอังกฤษ
        <input className="input mt-1" maxLength={200} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </label>
      <label className="block text-sm">หมวดหมู่
        <select className="input mt-1" value={cat} onChange={(e) => setCat(e.target.value)}>
          {categories.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name_th}</option>)}
        </select>
      </label>

      <div className="text-sm">
        <label htmlFor="up-coords">พิกัด (วางลิงก์ Google Maps ได้)</label>
        <div className="mt-1 flex gap-2">
          <input id="up-coords" className="input" placeholder="13.7563, 100.5018" value={coords} onChange={(e) => setCoords(e.target.value)} />
          <Button variant="secondary" icon={<LocateFixed size={18} />} onClick={useHere} aria-label="ใช้ตำแหน่งปัจจุบัน">ที่นี่</Button>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted"><MapPin size={12} /> {locating ? 'กำลังหาจังหวัด…' : locInfo ?? 'ใส่พิกัดเพื่อหาจังหวัด/อำเภอให้อัตโนมัติ และใช้จัดเส้นทาง'}</p>
      </div>

      <label className="block text-sm">จังหวัด
        <select className="input mt-1" value={provinceId} onChange={(e) => { setProvinceId(e.target.value); setDistrict(null); }}>
          <option value="">ไม่ระบุ</option>
          {provinces.map((p) => <option key={p.id} value={p.id}>{p.name_th}</option>)}
        </select>
      </label>

      <label className="block text-sm">คำอธิบายสั้น
        <textarea className="input mt-1 min-h-16 py-2" maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </label>
      <label className="block text-sm">ที่อยู่
        <input className="input mt-1" maxLength={500} value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">เวลาที่ใช้ (นาที)
          <input inputMode="numeric" className="input mt-1" placeholder="60" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>
        <label className="block text-sm">ค่าใช้จ่าย/คน (บาท)
          <input inputMode="decimal" className="input mt-1" value={cost} onChange={(e) => setCost(e.target.value)} />
        </label>
      </div>
      <label className="block text-sm">ลิงก์ Google Maps / เว็บไซต์
        <input className="input mt-1" inputMode="url" value={gmaps} onChange={(e) => setGmaps(e.target.value)} />
      </label>
      <label className="block text-sm">บันทึกส่วนตัว
        <textarea className="input mt-1 min-h-16 py-2" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={submit} onChange={(e) => setSubmit(e.target.checked)} />
        เสนอให้ Admin เพิ่มเป็นสถานที่ส่วนกลาง (ไม่รวมบันทึกส่วนตัว)
      </label>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {place && (
        <button type="button" onClick={() => setConfirm(true)} className="inline-flex min-h-10 items-center gap-1 text-sm text-red-600">
          <Trash2 size={16} /> ลบสถานที่นี้
        </button>
      )}
      <ConfirmDialog open={confirm} danger busy={busy} title="ลบสถานที่ส่วนตัว?" confirmText="ลบ"
        message={`ลบ “${place?.name_th ?? ''}” ถาวร\n• ในทริปจะยังเห็นชื่อเดิม แต่จะไม่เชื่อมกับสถานที่นี้แล้ว\n• ความทรงจำที่บันทึกไว้จะไม่ถูกลบ`}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          if (!place) return;
          setBusy(true);
          try { await onDelete(place.id); setConfirm(false); onClose(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
        }} />
    </BottomSheet>
  );
}
