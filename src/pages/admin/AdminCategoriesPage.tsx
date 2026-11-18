import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Save, Trash2 } from 'lucide-react';
import {
  categoryUsage, deleteCategory, listAllCategories, saveCategory, swapCategoryOrder, type AdminCategory,
} from '../../features/admin/adminApi';
import { clearCategoryCache } from '../../features/places/placesApi';
import { CategoryIcon, ICON_NAMES } from '../../features/places/categoryIcons';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

type Draft = { name_th: string; name_en: string; icon: string; color: string; is_active: boolean };
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export function AdminCategoriesPage() {
  const toast = useToast();
  const [cats, setCats] = useState<AdminCategory[] | null>(null);
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null);
  const [d, setD] = useState<Draft>({ name_th: '', name_en: '', icon: 'MapPin', color: '#64748B', is_active: true });
  const [del, setDel] = useState<{ cat: AdminCategory; used: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => listAllCategories().then(setCats).catch((e: Error) => toast(e.message, 'error'));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = async () => { clearCategoryCache(); await load(); };

  const open = (c: AdminCategory | 'new') => {
    setEditing(c);
    setErr(null);
    setD(c === 'new'
      ? { name_th: '', name_en: '', icon: 'MapPin', color: '#64748B', is_active: true }
      : { name_th: c.name_th, name_en: c.name_en ?? '', icon: c.icon, color: c.color, is_active: c.is_active });
  };

  const save = async () => {
    if (!d.name_th.trim()) { setErr('กรอกชื่อหมวด'); return; }
    if (!/^#[0-9A-Fa-f]{6}$/.test(d.color)) { setErr('สีไม่ถูกต้อง'); return; }
    setBusy(true);
    try {
      const isNew = editing === 'new';
      const base = isNew ? null : (editing as AdminCategory);
      await saveCategory(base?.id ?? null, {
        slug: base?.slug ?? (slugify(d.name_en) || `cat-${Date.now().toString(36)}`),
        name_th: d.name_th.trim().slice(0, 60),
        name_en: d.name_en.trim().slice(0, 60) || null,
        icon: ICON_NAMES.includes(d.icon) ? d.icon : 'MapPin',
        color: d.color.toUpperCase(),
        sort_order: base?.sort_order ?? Math.max(0, ...(cats ?? []).map((c) => c.sort_order)) + 1,
        is_active: d.is_active,
      });
      toast('บันทึกแล้ว', 'success');
      setEditing(null);
      await changed();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const move = async (i: number, dir: -1 | 1) => {
    if (!cats) return;
    const j = i + dir;
    if (j < 0 || j >= cats.length) return;
    try { await swapCategoryOrder(cats[i], cats[j]); await changed(); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const toggleActive = async (c: AdminCategory) => {
    try {
      const { id, ...rest } = c;
      await saveCategory(id, { ...rest, is_active: !c.is_active });
      await changed();
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  if (!cats) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">หมวดที่ปิดจะไม่แสดงในตัวกรองของผู้ใช้ · ลบได้เฉพาะหมวดที่ไม่มีสถานที่ใช้อยู่</p>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {cats.map((c, i) => (
          <li key={c.id} className={`flex items-center gap-2 p-2 ${c.is_active ? '' : 'opacity-50'}`}>
            <button type="button" onClick={() => open(c)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: c.color }}>
                <CategoryIcon name={c.icon} size={20} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.name_th}</span>
                <span className="block truncate text-xs text-muted">{c.slug}</span>
              </span>
            </button>
            <button type="button" aria-label={c.is_active ? 'ปิดการแสดง' : 'เปิดการแสดง'} onClick={() => void toggleActive(c)} className="flex h-10 w-9 items-center justify-center">
              {c.is_active ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <button type="button" aria-label="เลื่อนขึ้น" disabled={i === 0} onClick={() => void move(i, -1)} className="flex h-10 w-9 items-center justify-center disabled:opacity-30"><ArrowUp size={18} /></button>
            <button type="button" aria-label="เลื่อนลง" disabled={i === cats.length - 1} onClick={() => void move(i, 1)} className="flex h-10 w-9 items-center justify-center disabled:opacity-30"><ArrowDown size={18} /></button>
          </li>
        ))}
      </ul>
      <Button className="w-full" icon={<Plus size={20} />} onClick={() => open('new')}>เพิ่มหมวดหมู่</Button>

      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'เพิ่มหมวดหมู่' : 'แก้ไขหมวดหมู่'}
        footer={<Button className="w-full" icon={<Save size={20} />} disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>}>
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-white" style={{ background: d.color }}><CategoryIcon name={d.icon} size={28} /></span>
          <span className="font-semibold">{d.name_th || 'ตัวอย่าง'}</span>
        </div>
        <label className="block text-sm">ชื่อภาษาไทย *
          <input className="input mt-1" maxLength={60} value={d.name_th} onChange={(e) => setD({ ...d, name_th: e.target.value })} />
        </label>
        <label className="block text-sm">ชื่อภาษาอังกฤษ
          <input className="input mt-1" maxLength={60} value={d.name_en} onChange={(e) => setD({ ...d, name_en: e.target.value })} />
        </label>
        <label className="flex items-center gap-3 text-sm">สี
          <input type="color" className="h-11 w-16 cursor-pointer rounded-lg border border-line" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} />
          <span className="text-muted">{d.color.toUpperCase()}</span>
        </label>
        <div className="text-sm">
          <p className="mb-1">ไอคอน</p>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {ICON_NAMES.map((n) => (
              <button key={n} type="button" aria-label={n} aria-pressed={d.icon === n} onClick={() => setD({ ...d, icon: n })}
                className={`flex h-11 items-center justify-center rounded-xl border ${d.icon === n ? 'border-primary ring-2 ring-primary' : 'border-line'}`}>
                <CategoryIcon name={n} size={20} />
              </button>
            ))}
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={d.is_active} onChange={(e) => setD({ ...d, is_active: e.target.checked })} /> แสดงหมวดนี้
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        {editing && editing !== 'new' && (
          <button type="button" className="inline-flex min-h-10 items-center gap-1 text-sm text-red-600"
            onClick={async () => { const used = await categoryUsage(editing.id); setDel({ cat: editing, used }); }}>
            <Trash2 size={16} /> ลบหมวดนี้
          </button>
        )}
      </BottomSheet>

      <ConfirmDialog open={del !== null} danger busy={busy}
        title={del && del.used > 0 ? 'ลบไม่ได้' : 'ลบหมวดหมู่?'}
        confirmText={del && del.used > 0 ? 'ปิดการแสดงแทน' : 'ลบ'}
        message={del ? (del.used > 0
          ? `หมวด “${del.cat.name_th}” ยังมีสถานที่ใช้อยู่ ${del.used} แห่ง\nย้ายสถานที่ไปหมวดอื่นก่อน หรือปิดการแสดงหมวดนี้แทน`
          : `ลบหมวด “${del.cat.name_th}” ถาวร`) : ''}
        onCancel={() => setDel(null)}
        onConfirm={async () => {
          if (!del) return;
          setBusy(true);
          try {
            if (del.used > 0) { if (del.cat.is_active) await toggleActive(del.cat); }
            else { await deleteCategory(del.cat.id); await changed(); }
            toast('เรียบร้อย', 'success');
            setDel(null); setEditing(null);
          } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
        }} />
    </div>
  );
}
