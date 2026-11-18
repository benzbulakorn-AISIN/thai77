import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Download, FileUp, History, RotateCcw, TriangleAlert, Upload, XCircle } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthProvider';
import { decodeText, downloadText } from '../../features/admin/csv';
import {
  analyze, COLUMNS, MAX_BYTES, MAX_ROWS, parseFile, recordCoords, summarize, type Analyzed, type ImportCtx, type ImportMode,
  type Located, type Parsed,
} from '../../features/admin/importModel';
import { exportPlacesCsv, listImportLogs, loadImportContext, runImport, templateCsv, type ImportLog, type ImportResult } from '../../features/admin/importApi';
import { locatePoint } from '../../features/map/locate';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

type Step = 'pick' | 'checking' | 'preview' | 'running' | 'done';
type Filter = 'all' | 'new' | 'match' | 'error' | 'warn';
const PREVIEW_LIMIT = 200;

export function AdminImportPage() {
  const { user } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [ctx, setCtx] = useState<ImportCtx | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [rows, setRows] = useState<Analyzed[]>([]);
  const [mode, setMode] = useState<ImportMode>('new_only');
  const [filter, setFilter] = useState<Filter>('all');
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [logs, setLogs] = useState<ImportLog[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadCtx = () => loadImportContext().then((c) => { setCtx(c); setCtxError(null); }).catch((e: Error) => setCtxError(e.message));
  const loadLogs = () => listImportLogs().then(setLogs).catch(() => setLogs([]));
  useEffect(() => { void loadCtx(); void loadLogs(); }, []);

  const sum = useMemo(() => summarize(rows, mode), [rows, mode]);
  const shown = useMemo(() => rows.filter((r) => filter === 'all' || (filter === 'warn' ? r.warnings.length > 0 : r.kind === filter)), [rows, filter]);

  const reset = () => {
    setStep('pick'); setParsed(null); setRows([]); setResult(null); setFileName(''); setFilter('all');
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFile = async (file: File | undefined) => {
    if (!file || !ctx) return;
    if (!/\.(csv|json|txt)$/i.test(file.name)) { toast('รองรับเฉพาะไฟล์ .csv หรือ .json', 'error'); return; }
    if (file.size > MAX_BYTES) { toast('ไฟล์ใหญ่เกิน 2 MB — แบ่งเป็นหลายไฟล์', 'error'); return; }
    setFileName(file.name);
    setStep('checking');
    try {
      const { text, encoding } = decodeText(await file.arrayBuffer());
      const p = parseFile(file.name, text);
      if (!p.records.length) throw new Error('ไม่พบข้อมูลในไฟล์');
      if (p.records.length > MAX_ROWS) throw new Error(`ไฟล์มี ${p.records.length} แถว — นำเข้าได้ครั้งละไม่เกิน ${MAX_ROWS} แถว`);
      if (encoding === 'windows-874') toast('ไฟล์เป็นภาษาไทยแบบ Windows (ANSI) — แปลงให้แล้ว', 'info');
      // locate province/district from coordinates (boundary files)
      const located: (Located | undefined)[] = [];
      for (let i = 0; i < p.records.length; i++) {
        setProgress([i, p.records.length]);
        const c = recordCoords(p.records[i]);
        located.push(c ? await locatePoint(c.lat, c.lng) : undefined);
      }
      setParsed(p);
      setRows(analyze(p.records, ctx, located, p.lineOffset));
      setStep('preview');
    } catch (e) {
      toast((e as Error).message, 'error');
      reset();
    }
  };

  const start = async () => {
    if (!user || !parsed) return;
    setConfirm(false);
    setStep('running');
    try {
      const r = await runImport({ rows, mode, userId: user.id, fileName, format: parsed.format, onProgress: (d, t) => setProgress([d, t]) });
      setResult(r);
      setStep('done');
      void loadLogs();
      void loadCtx(); // refresh duplicate detection for the next file
    } catch (e) {
      toast((e as Error).message, 'error');
      setStep('preview');
    }
  };

  const doExport = async () => {
    if (!ctx) return;
    setExporting(true);
    try {
      const { csv, count } = await exportPlacesCsv(ctx);
      downloadText(`thai77-places-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast(`Export ${count} สถานที่แล้ว`, 'success');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setExporting(false); }
  };

  if (ctxError) return <div className="space-y-2"><p className="text-red-600">{ctxError}</p><Button onClick={() => void loadCtx()}>ลองใหม่</Button></div>;
  if (!ctx) return <Skeleton className="h-64" />;

  const pct = progress[1] ? Math.round((progress[0] / progress[1]) * 100) : 0;
  const actionable = sum.insert + sum.update;

  return (
    <div className="space-y-4">
      {step === 'pick' && (
        <>
          <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-semibold">นำเข้าสถานที่จาก CSV / JSON</h2>
            <ol className="list-inside list-decimal space-y-1 text-sm text-muted">
              <li>ดาวน์โหลด Template หรือ Export ข้อมูลเดิมไปแก้ใน Excel / Google Sheets</li>
              <li>บันทึกเป็น <b>CSV UTF-8</b> (ไฟล์ ANSI ภาษาไทยก็อ่านได้)</li>
              <li>อัปโหลด → ตรวจ Preview → ยืนยัน</li>
            </ol>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={<Download size={18} />} onClick={() => downloadText('thai77-template.csv', templateCsv())}>Template</Button>
              <Button variant="secondary" icon={<Download size={18} />} disabled={exporting} onClick={() => void doExport()}>
                {exporting ? 'กำลัง Export…' : `Export (${ctx.existing.length})`}
              </Button>
            </div>
            <Button className="w-full" icon={<FileUp size={20} />} onClick={() => fileRef.current?.click()}>เลือกไฟล์</Button>
            <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
            <p className="text-xs text-muted">ไม่เกิน {MAX_ROWS} แถว / 2 MB ต่อไฟล์ · ไฟล์ JSON ใน data/seed/places ก็นำเข้าได้</p>
          </section>

          <details className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <summary className="cursor-pointer font-semibold">คอลัมน์ที่รองรับ ({COLUMNS.length})</summary>
            <table className="mt-3 w-full text-left text-xs">
              <tbody className="divide-y divide-line">
                {COLUMNS.map(([k, d]) => <tr key={k}><td className="py-1 pr-2 font-mono">{k}</td><td className="py-1 text-muted">{d}</td></tr>)}
              </tbody>
            </table>
            <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-muted">
              <li>เว้นว่าง = ไม่ทราบ — ห้ามเดาเวลาเปิด-ปิดหรือราคา</li>
              <li>“verified” ต้องมี source_url (หรือมีแหล่งข้อมูลอยู่แล้ว) มิฉะนั้นจะเป็น “pending”</li>
              <li>สถานที่ซ้ำ = id ตรงกัน, ชื่อซ้ำในจังหวัดเดียวกัน หรือพิกัดห่างไม่เกิน 100 ม. และชื่อคล้ายกัน</li>
            </ul>
          </details>
        </>
      )}

      {(step === 'checking' || step === 'running') && (
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-6 text-center" aria-live="polite">
          <p className="font-semibold">{step === 'checking' ? 'กำลังตรวจไฟล์…' : 'กำลังนำเข้า… อย่าปิดหน้านี้'}</p>
          <div className="h-3 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
          <p className="text-sm text-muted">{progress[0]}/{progress[1]}</p>
        </section>
      )}

      {step === 'preview' && parsed && (
        <>
          <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <p className="font-semibold">{fileName} <span className="text-sm font-normal text-muted">· {parsed.format.toUpperCase()} · {sum.total} แถว</span></p>
            {parsed.unknown.length > 0 && <p className="text-xs text-amber-700">ไม่รู้จักคอลัมน์: {parsed.unknown.join(', ')} (จะถูกข้าม)</p>}
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div className="rounded-xl bg-green-100 p-2 text-green-900"><p className="text-xl font-bold">{sum.insert}</p><p className="text-xs">เพิ่มใหม่</p></div>
              <div className="rounded-xl bg-sky-100 p-2 text-sky-900"><p className="text-xl font-bold">{mode === 'merge' ? sum.update : sum.skip}</p><p className="text-xs">{mode === 'merge' ? 'อัปเดตของเดิม' : 'ซ้ำ — ข้าม'}</p></div>
              <div className="rounded-xl bg-amber-100 p-2 text-amber-900"><p className="text-xl font-bold">{sum.warn}</p><p className="text-xs">มีคำเตือน</p></div>
              <div className="rounded-xl bg-red-100 p-2 text-red-900"><p className="text-xl font-bold">{sum.error}</p><p className="text-xs">ผิดพลาด — ข้าม</p></div>
            </div>
            <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line text-sm" role="radiogroup" aria-label="วิธีจัดการรายการซ้ำ">
              <button type="button" role="radio" aria-checked={mode === 'new_only'} onClick={() => setMode('new_only')}
                className={`min-h-12 px-2 ${mode === 'new_only' ? 'bg-primary text-on-primary' : ''}`}>เพิ่มเฉพาะใหม่<br /><span className="text-xs opacity-80">ข้ามรายการซ้ำ</span></button>
              <button type="button" role="radio" aria-checked={mode === 'merge'} onClick={() => setMode('merge')}
                className={`min-h-12 px-2 ${mode === 'merge' ? 'bg-primary text-on-primary' : ''}`}>เพิ่ม + อัปเดต<br /><span className="text-xs opacity-80">ทับเฉพาะช่องที่มีค่า</span></button>
            </div>
          </section>

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {([['all', `ทั้งหมด ${sum.total}`], ['new', `ใหม่ ${sum.insert}`], ['match', `ซ้ำ ${rows.filter((r) => r.kind === 'match').length}`], ['warn', `คำเตือน ${sum.warn}`], ['error', `ผิดพลาด ${sum.error}`]] as [Filter, string][]).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)}
                className={`min-h-10 shrink-0 rounded-full border px-4 text-sm ${filter === k ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'}`}>{l}</button>
            ))}
          </div>

          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {shown.slice(0, PREVIEW_LIMIT).map((r) => (
              <li key={r.line} className="space-y-1 p-3 text-sm">
                <p className="flex items-center gap-2">
                  {r.kind === 'error' ? <XCircle size={16} className="shrink-0 text-red-600" />
                    : r.kind === 'match' ? <RotateCcw size={16} className="shrink-0 text-sky-600" />
                      : <CheckCircle2 size={16} className="shrink-0 text-green-600" />}
                  <span className="w-14 shrink-0 text-xs text-muted">แถว {r.line}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                  {r.kind === 'match' && r.matchId && (
                    <Link to={`/admin/places/${r.matchId}`} className="shrink-0 text-xs text-primary underline">ของเดิม</Link>
                  )}
                </p>
                {r.kind === 'match' && <p className="pl-6 text-xs text-sky-700">ซ้ำ: {r.matchReason}{mode === 'merge' ? ` · อัปเดต ${Object.keys(r.patch).length} ช่อง` : ' · จะข้าม'}</p>}
                {r.errors.map((e) => <p key={e} className="pl-6 text-xs text-red-700">✗ {e}</p>)}
                {r.warnings.map((w) => <p key={w} className="pl-6 text-xs text-amber-700">⚠ {w}</p>)}
              </li>
            ))}
            {shown.length === 0 && <li className="p-4 text-center text-sm text-muted">ไม่มีรายการ</li>}
          </ul>
          {shown.length > PREVIEW_LIMIT && <p className="text-center text-xs text-muted">แสดง {PREVIEW_LIMIT} จาก {shown.length} แถว</p>}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" className="border border-line" onClick={reset}>ยกเลิก</Button>
            <Button icon={<Upload size={20} />} disabled={actionable === 0} onClick={() => setConfirm(true)}>นำเข้า {actionable} รายการ</Button>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <p className="flex items-center gap-2 text-lg font-semibold">
            {result.failed ? <TriangleAlert className="text-amber-600" /> : <CheckCircle2 className="text-green-600" />} นำเข้าเสร็จแล้ว
          </p>
          <p className="text-sm">เพิ่ม {result.inserted} · อัปเดต {result.updated} · ข้าม {result.skipped} · ไม่สำเร็จ {result.failed}</p>
          {result.errors.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-red-700">รายการที่มีปัญหา ({result.errors.length})</summary>
              <ul className="mt-2 space-y-1">{result.errors.map((e, i) => <li key={i}>แถว {e.line}: {e.message}</li>)}</ul>
            </details>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Link to="/admin/places"><Button variant="secondary" className="w-full">ดูสถานที่</Button></Link>
            <Button onClick={reset} icon={<FileUp size={18} />}>นำเข้าไฟล์อื่น</Button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-2 flex items-center gap-2 font-semibold"><History size={18} /> ประวัติการนำเข้า</h2>
        {!logs ? <Skeleton className="h-16" /> : logs.length === 0 ? <p className="text-sm text-muted">ยังไม่มี</p> : (
          <ul className="divide-y divide-line text-sm">
            {logs.map((l) => (
              <li key={l.id} className="py-2">
                <p className="flex justify-between gap-2">
                  <span className="truncate">{l.file_name ?? '—'}</span>
                  <span className="shrink-0 text-xs text-muted">{new Date(l.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </p>
                <p className="text-xs text-muted">
                  {l.mode === 'merge' ? 'เพิ่ม+อัปเดต' : 'เพิ่มเฉพาะใหม่'} · {l.total_rows} แถว · เพิ่ม {l.inserted} · อัปเดต {l.updated} · ข้าม {l.skipped}
                  {Array.isArray(l.errors) && l.errors.length > 0 && <span className="text-red-700"> · ปัญหา {l.errors.length}</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog open={confirm} title="ยืนยันการนำเข้า?" confirmText="นำเข้า"
        message={`• เพิ่มใหม่ ${sum.insert} รายการ${mode === 'merge' ? `\n• อัปเดตของเดิม ${sum.update} รายการ (ทับเฉพาะช่องที่มีค่าในไฟล์)` : ''}\n• ข้าม ${sum.skip + sum.error} รายการ\n\nแนะนำให้ Export เก็บไว้ก่อน เผื่อต้องย้อนกลับ`}
        onCancel={() => setConfirm(false)} onConfirm={() => void start()} />
    </div>
  );
}
