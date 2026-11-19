import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Eye, ExternalLink, Link2, Send, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { copyText } from './clipboard';
import { createShare, listShares, previewShare, revokeShare } from './shareApi';
import {
  EXPIRY_OPTIONS, MAX_ACTIVE_LINKS, MESSAGE_MAX, NAME_MAX, SHARER_MAX, activeShares, buildShareUrl, canCreateMore, defaultShareForm,
  messageCount, optionLabels, shareStatus, sortShares, tokenTail, validateShareForm, type FormField, type ShareForm, type ShareRow,
} from './shareModel';
import { expiryText, type SharedTrip } from './sharedTripModel';
import { SharedTripView } from './SharedTripView';
import { fmtDateTh } from '../routing/time';

type Props = { open: boolean; tripId: string; tripName: string; onClose: () => void };

const linkFor = (token: string) => buildShareUrl(window.location.origin, window.location.pathname, token);
const thaiDay = (iso: string) => {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? fmtDateTh(d, true) : '';
};

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-12 items-start gap-3 py-1 text-sm">
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="block">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}

export function ShareSheet({ open, tripId, tripName, onClose }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<ShareForm>(() => defaultShareForm(tripName));
  const [fieldError, setFieldError] = useState<{ field: FormField; error: string } | null>(null);
  const [view, setView] = useState<'form' | 'preview'>('form');
  const [preview, setPreview] = useState<SharedTrip | null>(null);
  const [shares, setShares] = useState<ShareRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; copied: boolean } | null>(null);
  const [busy, setBusy] = useState<'preview' | 'create' | 'revoke' | null>(null);
  const [revoking, setRevoking] = useState<ShareRow | null>(null);
  const urlInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try { setShares(await listShares(tripId)); setListError(null); }
    catch (e) { setListError((e as Error).message); }
  }, [tripId]);

  useEffect(() => {
    if (!open) return;
    setForm(defaultShareForm(tripName));
    setFieldError(null); setView('form'); setPreview(null); setCreated(null); setBusy(null); setShares(null);
    void reload();
  }, [open, tripId, tripName, reload]);

  if (!open) return null;

  const now = Date.now();
  const list = shares ?? [];
  const canCreate = shares !== null && canCreateMore(list, now);
  const active = activeShares(list, now);
  const sorted = sortShares(list, now);
  const set = <K extends keyof ShareForm>(k: K, v: ShareForm[K]) => { setForm((f) => ({ ...f, [k]: v })); setFieldError(null); };
  const msgLen = messageCount(form.message);

  const check = () => {
    const r = validateShareForm(tripId, form);
    if (!r.ok) { setFieldError({ field: r.field, error: r.error }); return null; }
    setFieldError(null);
    return r.params;
  };

  const doPreview = async () => {
    const params = check();
    if (!params) return;
    setBusy('preview');
    try {
      const r = await previewShare(params);
      if (!r.ok) { toast('ดูตัวอย่างไม่สำเร็จ ลองใหม่อีกครั้ง', 'error'); return; }
      setPreview(r.trip);
      setView('preview');
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(null); }
  };

  const doCreate = async () => {
    const params = check();
    if (!params) { setView('form'); return; }
    setBusy('create');
    try {
      const row = await createShare(params);
      const url = linkFor(row.token);
      if (!url) throw new Error('สร้างลิงก์ไม่สำเร็จ');
      const copied = await copyText(url);
      setCreated({ url, copied });
      setView('form');
      toast(copied ? 'สร้างลิงก์แล้ว และคัดลอกให้แล้ว' : 'สร้างลิงก์แล้ว — กด “คัดลอก” ด้านบน', 'success');
      await reload();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(null); }
  };

  const copyRow = async (r: ShareRow) => {
    const url = linkFor(r.token);
    if (!url) return;
    const ok = await copyText(url);
    toast(ok ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกไม่ได้ — กด “เปิดดู” แล้วคัดลอกจากแถบที่อยู่', ok ? 'success' : 'info');
  };

  const nativeShare = async (url: string) => {
    try { await navigator.share({ title: form.displayName || tripName, url }); } catch { /* cancelled */ }
  };
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const doRevoke = async () => {
    if (!revoking) return;
    setBusy('revoke');
    try {
      await revokeShare(revoking.id);
      toast('ปิดลิงก์แล้ว — ผู้ที่มีลิงก์นี้เปิดดูไม่ได้อีก', 'success');
      if (created && linkFor(revoking.token) === created.url) setCreated(null);
      setRevoking(null);
      await reload();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(null); }
  };

  const footer = view === 'preview' ? (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="ghost" className="border border-line" icon={<ArrowLeft size={18} />} onClick={() => setView('form')} disabled={busy !== null}>กลับไปแก้ไข</Button>
      <Button icon={<Link2 size={20} />} onClick={() => void doCreate()} disabled={busy !== null || !canCreate}>{busy === 'create' ? 'กำลังสร้าง…' : 'สร้างลิงก์'}</Button>
    </div>
  ) : (
    <Button className="w-full" icon={<Link2 size={20} />} onClick={() => void doCreate()} disabled={busy !== null || !canCreate}>
      {busy === 'create' ? 'กำลังสร้าง…' : 'สร้างลิงก์'}
    </Button>
  );

  return (
    <>
      <BottomSheet open onClose={() => { if (busy === null) onClose(); }} title={view === 'preview' ? 'ตัวอย่างที่ผู้ดูจะเห็น' : 'แชร์ทริป (อ่านอย่างเดียว)'} footer={footer}>
        {view === 'preview' && preview ? (
          <SharedTripView trip={preview} preview />
        ) : (
          <div className="space-y-4">
            {created && (
              <section aria-label="ลิงก์ที่เพิ่งสร้าง" className="space-y-2 rounded-2xl border border-green-500 bg-green-50 p-3 text-green-950 dark:bg-green-950 dark:text-green-50">
                <p className="flex items-center gap-2 font-semibold"><Check size={18} /> สร้างลิงก์แล้ว</p>
                <input ref={urlInput} readOnly value={created.url} aria-label="ลิงก์แชร์" onFocus={(e) => e.currentTarget.select()} className="input text-sm text-fg" />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" icon={<Copy size={18} />}
                    onClick={async () => { const ok = await copyText(created.url); if (!ok) urlInput.current?.select(); toast(ok ? 'คัดลอกลิงก์แล้ว' : 'กดค้างที่ช่องลิงก์แล้วเลือกคัดลอก', ok ? 'success' : 'info'); }}>คัดลอก</Button>
                  {canNativeShare && <Button variant="secondary" icon={<Send size={18} />} onClick={() => void nativeShare(created.url)}>ส่งต่อ</Button>}
                </div>
              </section>
            )}

            <section aria-label="สิ่งที่จะแชร์" className="space-y-2 rounded-2xl border border-line bg-surface-2 p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-primary" /> สิ่งที่ผู้ดูจะเห็น</p>
              <p><b>แชร์:</b> ชื่อที่แสดง · ลำดับกิจกรรมแต่ละวัน · ชื่อและตำแหน่งสถานที่ส่วนกลาง · ระยะเวลา (เวลาเป็นค่าประมาณ)</p>
              <p><b>ไม่แชร์เสมอ:</b> จุดเริ่มต้น/บ้าน · งบและค่าใช้จ่าย · หมายเหตุ · จำนวนคน · รูปปก · ข้อมูลละเอียดของที่พัก · สถานที่ส่วนตัว (ขึ้นเป็น “สถานที่ส่วนตัว”)</p>
              <p className="text-xs text-muted">ใครมีลิงก์ก็เปิดดูได้โดยไม่ต้อง Login ปิดลิงก์ได้ทุกเมื่อ แต่ภาพที่คนแคปไปแล้วเรียกคืนไม่ได้ · วันที่กับสถานที่บอกได้ว่าคุณไม่อยู่บ้านช่วงไหน จึงมีตัวเลือกซ่อนวันที่</p>
            </section>

            <div className="space-y-3">
              <label className="block text-sm">ชื่อที่แสดง
                <input className="input mt-1" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} aria-invalid={fieldError?.field === 'displayName'} />
                <span className="block text-xs text-muted">ชื่อทริปอาจมีชื่อคน — แก้ได้ตรงนี้ (ไม่เกิน {NAME_MAX} ตัวอักษร)</span>
                {fieldError?.field === 'displayName' && <span role="alert" className="block text-xs text-red-600">{fieldError.error}</span>}
              </label>
              <label className="block text-sm">ชื่อผู้แชร์ (ไม่บังคับ)
                <input className="input mt-1" value={form.sharerName} onChange={(e) => set('sharerName', e.target.value)} placeholder="เว้นว่าง = ไม่แสดงชื่อ" aria-invalid={fieldError?.field === 'sharerName'} />
                <span className="block text-xs text-muted">ไม่ใช้ชื่อบัญชีให้เอง · ไม่เกิน {SHARER_MAX} ตัวอักษร</span>
                {fieldError?.field === 'sharerName' && <span role="alert" className="block text-xs text-red-600">{fieldError.error}</span>}
              </label>
              <label className="block text-sm">ข้อความถึงผู้ดู (ไม่บังคับ)
                <textarea className="input mt-1 min-h-20 py-2" value={form.message} onChange={(e) => set('message', e.target.value)} aria-invalid={fieldError?.field === 'message'} />
                <span className={`block text-xs ${msgLen > MESSAGE_MAX ? 'text-red-600' : 'text-muted'}`}>{msgLen}/{MESSAGE_MAX}</span>
                {fieldError?.field === 'message' && <span role="alert" className="block text-xs text-red-600">{fieldError.error}</span>}
              </label>

              <fieldset>
                <legend className="mb-1 text-sm">อายุของลิงก์</legend>
                <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="อายุของลิงก์">
                  {EXPIRY_OPTIONS.map((o) => (
                    <button key={String(o.days)} type="button" role="radio" aria-checked={form.expiresDays === o.days} onClick={() => set('expiresDays', o.days)}
                      className={`min-h-12 rounded-xl border px-1 text-xs ${form.expiresDays === o.days ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'}`}>{o.label}</button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="rounded-2xl border border-line p-3">
                <legend className="px-1 text-sm">รายละเอียดเพิ่มเติม</legend>
                <Toggle checked={form.showDates} onChange={(v) => set('showDates', v)} label="แสดงวันที่จริง" hint="ปิด = แสดงเป็น “วัน 1, 2, 3” แทน" />
                <Toggle checked={form.showLodgingNames} onChange={(v) => set('showLodgingNames', v)} label="แสดงชื่อที่พัก" hint="เฉพาะชื่อ — ที่อยู่ ราคา เลขจอง ตำแหน่ง ไม่แชร์เด็ดขาด" />
                <Toggle checked={form.showCustomTitles} onChange={(v) => set('showCustomTitles', v)} label="แสดงชื่อกิจกรรมที่พิมพ์เอง" hint="เช่น ชื่อร้านอาหาร (ถ้าปิด จะขึ้นแค่ “มื้ออาหาร”)" />
              </fieldset>
            </div>

            <Button variant="secondary" className="w-full" icon={<Eye size={18} />} onClick={() => void doPreview()} disabled={busy !== null || !canCreate}>
              {busy === 'preview' ? 'กำลังสร้างตัวอย่าง…' : 'ดูตัวอย่างที่ผู้ดูจะเห็น'}
            </Button>
            {shares !== null && !canCreate && (
              <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" /> มีลิงก์ที่ใช้งานอยู่ครบ {MAX_ACTIVE_LINKS} ลิงก์แล้ว — ปิดลิงก์เก่าก่อนจึงจะสร้างหรือดูตัวอย่างได้
              </p>
            )}

            <section aria-label="ลิงก์ของทริปนี้" className="space-y-2">
              <h3 className="font-semibold">ลิงก์ของทริปนี้ <span className="text-sm font-normal text-muted">(ใช้งานอยู่ {active.length}/{MAX_ACTIVE_LINKS})</span></h3>
              {listError && <p className="text-sm text-red-600">{listError} <button type="button" className="underline" onClick={() => void reload()}>ลองใหม่</button></p>}
              {shares === null && !listError && <Skeleton className="h-16" />}
              {shares !== null && sorted.length === 0 && <p className="text-sm text-muted">ยังไม่มีลิงก์ — กด “สร้างลิงก์” ด้านล่าง</p>}
              <ul className="space-y-2">
                {sorted.map((r) => {
                  const st = shareStatus(r, now);
                  const url = linkFor(r.token);
                  const opts = optionLabels(r);
                  return (
                    <li key={r.id} className={`rounded-2xl border p-3 text-sm ${st === 'active' ? 'border-line bg-surface' : 'border-line bg-surface-2 text-muted'}`}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{r.display_name} <span className="font-normal text-muted">{tokenTail(r.token)}</span></p>
                          <p className="text-xs text-muted">
                            สร้างเมื่อ {thaiDay(r.created_at)} · {st === 'revoked' ? 'ปิดแล้ว' : st === 'expired' ? 'หมดอายุแล้ว' : expiryText(r.expires_at) ?? 'ไม่หมดอายุ'}
                          </p>
                          {opts.length > 0 && <p className="text-xs text-muted">{opts.join(' · ')}</p>}
                        </div>
                      </div>
                      {st === 'active' && url && (
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <button type="button" onClick={() => void copyRow(r)} className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-line text-xs"><Copy size={14} /> คัดลอก</button>
                          <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-line text-xs"><ExternalLink size={14} /> เปิดดู</a>
                          <button type="button" onClick={() => setRevoking(r)} className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-red-300 text-xs text-red-700"><Trash2 size={14} /> ปิดลิงก์</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog open={revoking !== null} danger busy={busy === 'revoke'} title="ปิดลิงก์นี้?" confirmText="ปิดลิงก์"
        message={`ผู้ที่มีลิงก์ “${revoking?.display_name ?? ''}” จะเปิดดูไม่ได้ทันที\nเปิดกลับมาไม่ได้ ต้องสร้างลิงก์ใหม่ (ได้ลิงก์ใหม่ ไม่ซ้ำเดิม)\nภาพที่คนแคปไปแล้วเรียกคืนไม่ได้`}
        onCancel={() => setRevoking(null)} onConfirm={() => void doRevoke()} />
    </>
  );
}
