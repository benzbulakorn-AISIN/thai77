import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Smartphone, Trash2, WifiOff } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { IOS_STEPS } from './installModel';
import { promptInstall, useInstallState } from './installStore';
import { fetchBuildInfo, formatBuildInfo, type BuildInfo } from './buildInfo';
import { usePwa } from './pwaStore';
import { removeWorkersAndCaches } from './registerSW';

/** Profile page: install the app, offline status, version, and the "reset app" escape hatch. */
export function InstallCard() {
  const toast = useToast();
  const state = useInstallState();
  const pwa = usePwa();
  const [build, setBuild] = useState<BuildInfo | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void fetchBuildInfo(import.meta.env.BASE_URL).then(setBuild); }, []);

  const install = async () => {
    const r = await promptInstall();
    if (r === 'accepted') toast('ติดตั้งแล้ว — เปิดได้จากไอคอนบนหน้าจอหลัก', 'success');
    else if (r === 'unavailable') toast('เบราว์เซอร์ยังไม่พร้อมให้ติดตั้ง ลองอีกครั้งในอีกสักครู่', 'info');
  };

  const reset = async () => {
    setBusy(true);
    await removeWorkersAndCaches();
    toast('ล้างแคชของแอปแล้ว กำลังโหลดใหม่…', 'success');
    setTimeout(() => window.location.reload(), 700);
  };

  const offline = pwa.disabled ? 'ปิดอยู่ (สวิตช์ฉุกเฉิน)' : pwa.offlineReady ? 'พร้อม — เปิดแอปได้แม้ไม่มีอินเทอร์เน็ต' : pwa.supported ? 'ยังไม่พร้อม (เปิดเว็บตอนมีอินเทอร์เน็ตอีกครั้ง)' : 'เบราว์เซอร์นี้ไม่รองรับ';

  return (
    <section aria-label="ติดตั้งแอป" className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <h2 className="flex items-center gap-2 font-semibold"><Smartphone size={18} /> ติดตั้งแอป</h2>

      {state === 'installed' && (
        <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400"><CheckCircle2 size={18} /> ติดตั้งแล้ว — คุณกำลังใช้งานจากไอคอนบนหน้าจอหลัก</p>
      )}

      {state === 'prompt' && (
        <div className="space-y-2">
          <p className="text-sm text-muted">ใช้งานเต็มจอ เปิดจากหน้าจอหลักได้เลย และเปิดแอปได้แม้ไม่มีอินเทอร์เน็ต (ข้อมูลทริปยังต้องใช้อินเทอร์เน็ต)</p>
          <Button className="w-full" icon={<Download size={20} />} onClick={() => void install()}>ติดตั้งแอป</Button>
        </div>
      )}

      {state === 'ios' && (
        <div className="space-y-2 text-sm">
          <p className="text-muted">iPhone / iPad ไม่มีปุ่มติดตั้งอัตโนมัติ ทำตามนี้ใน Safari:</p>
          <ol className="list-inside list-decimal space-y-1">{IOS_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
          <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">แอปที่ติดตั้งจะแยกพื้นที่เก็บข้อมูลจาก Safari — ต้องเข้าสู่ระบบใหม่ในแอป และข้อมูลที่บันทึกไว้ในฐานะผู้เยี่ยมชมจะไม่ตามไปด้วย</p>
        </div>
      )}

      {state === 'in-app' && (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">เปิดลิงก์นี้ในเบราว์เซอร์จริงก่อน (Chrome หรือ Safari) — เบราว์เซอร์ในตัวของ LINE / Facebook ติดตั้งแอปไม่ได้ กดเมนู ⋯ แล้วเลือก “เปิดใน Chrome / Safari”</p>
      )}

      {state === 'unsupported' && (
        <p className="text-sm text-muted">เบราว์เซอร์นี้ยังไม่มีปุ่มติดตั้ง — ลองเมนูของเบราว์เซอร์ (⋮ หรือ ⋯ → “ติดตั้งแอป” / “เพิ่มลงในหน้าจอหลัก”) หรือเปิดด้วย Chrome / Edge / Safari</p>
      )}

      <dl className="space-y-1 border-t border-line pt-3 text-xs text-muted">
        <div className="flex items-start gap-2"><WifiOff size={14} className="mt-0.5 shrink-0" /><div><dt className="inline">โหมดออฟไลน์: </dt><dd className="inline">{offline}</dd></div></div>
        <div><dt className="inline">เวอร์ชัน: </dt><dd className="inline">{build ? formatBuildInfo(build) : '—'}</dd></div>
      </dl>

      <button type="button" onClick={() => setConfirmReset(true)} disabled={busy}
        className="inline-flex min-h-11 items-center gap-1 text-sm text-muted underline disabled:opacity-50">
        <Trash2 size={14} /> หน้าเว็บค้างเก่า? ล้างแคชของแอป
      </button>

      <ConfirmDialog open={confirmReset} busy={busy} title="ล้างแคชของแอป?" confirmText="ล้างแคช"
        message={'ลบไฟล์ของแอปที่เก็บไว้ในเครื่องแล้วโหลดใหม่\n• ไม่ลบข้อมูลของคุณ (ทริป ความทรงจำ สถานที่ที่บันทึกไว้ในเครื่อง) และไม่ออกจากระบบ\n• ใช้เมื่อเว็บแสดงเวอร์ชันเก่าหรือหน้าจอผิดปกติ'}
        onCancel={() => setConfirmReset(false)} onConfirm={() => void reset()} />
    </section>
  );
}
