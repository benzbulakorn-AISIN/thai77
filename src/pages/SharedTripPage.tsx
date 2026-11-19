import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Eye, Link2, MapPinned, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { fetchSharedTrip } from '../features/share/shareApi';
import { parseShareToken } from '../features/share/shareModel';
import { SharedTripView } from '../features/share/SharedTripView';
import type { SharedTrip } from '../features/share/sharedTripModel';
import { t } from '../i18n/th';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; trip: SharedTrip }
  | { kind: 'gone' }
  | { kind: 'unsupported' }
  | { kind: 'error' };

const BUTTON = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-medium';

/**
 * Public, read-only page for a share link:  #/s/<token>
 * No menu of the app, no sign-in, nothing stored. A link that does not work (never existed / closed / expired)
 * always looks the same, so nobody can tell which it was.
 */
export function SharedTripPage() {
  const { token: raw } = useParams();
  const token = useMemo(() => parseShareToken(raw), [raw]);
  const [state, setState] = useState<State>({ kind: token ? 'loading' : 'gone' });
  const [attempt, setAttempt] = useState(0);

  // keep search engines away and do not send a Referer from this page; restore everything when leaving
  useEffect(() => {
    const metas = [['robots', 'noindex,nofollow'], ['referrer', 'no-referrer']].map(([name, content]) => {
      const m = document.createElement('meta');
      m.name = name; m.content = content;
      document.head.appendChild(m);
      return m;
    });
    const before = document.title;
    return () => { metas.forEach((m) => m.remove()); document.title = before; };
  }, []);

  useEffect(() => {
    if (!token) { setState({ kind: 'gone' }); return; }
    let alive = true;
    setState({ kind: 'loading' });
    fetchSharedTrip(token).then((r) => {
      if (!alive) return;
      if (r.ok) { setState({ kind: 'ok', trip: r.trip }); document.title = `${r.trip.title} · ${t.appName}`; }
      else if (r.reason === 'unsupported') setState({ kind: 'unsupported' });
      else if (r.reason === 'unavailable' || r.reason === 'invalid') setState({ kind: 'gone' });
      else setState({ kind: 'error' });
    });
    return () => { alive = false; };
  }, [token, attempt]);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-[500] flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
        <Link to="/" aria-label={t.appName} className="flex min-w-0 flex-1 items-center gap-2">
          <MapPinned className="shrink-0 text-primary" size={22} />
          <span className="truncate text-base font-bold">{t.appName}</span>
        </Link>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-muted"><Eye size={13} aria-hidden="true" /> อ่านอย่างเดียว</span>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4">
        {state.kind === 'loading' && (
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <Skeleton className="h-32" /><Skeleton className="h-12" /><Skeleton className="h-24" /><Skeleton className="h-24" />
          </div>
        )}

        {state.kind === 'ok' && (
          <>
            <SharedTripView trip={state.trip} />
            <div className="mt-6 rounded-2xl border border-line bg-surface p-4 text-center">
              <p className="mb-3 text-sm">อยากวางแผนเที่ยวทั่วไทยแบบนี้บ้าง?</p>
              <Link to="/" className={`${BUTTON} w-full bg-primary text-on-primary`}>สร้างแผนทริปของคุณเอง</Link>
            </div>
          </>
        )}

        {state.kind === 'gone' && (
          <EmptyState icon={<Link2 size={40} />} title="ลิงก์นี้ใช้ไม่ได้แล้ว"
            text="ลิงก์อาจถูกปิดโดยผู้แชร์ หมดอายุ หรือพิมพ์ไม่ครบ — ลองขอลิงก์ใหม่จากผู้แชร์"
            action={<Link to="/" className="text-primary underline">ไปที่หน้าแรกของแอป</Link>} />
        )}

        {state.kind === 'unsupported' && (
          <EmptyState icon={<TriangleAlert size={40} />} title="ต้องรีเฟรชหน้าเว็บก่อน"
            text="ลิงก์นี้สร้างจากแอปเวอร์ชันใหม่กว่า กด Ctrl+F5 (หรือดึงหน้าลงเพื่อรีเฟรช) แล้วเปิดใหม่"
            action={<button type="button" onClick={() => window.location.reload()} className={`${BUTTON} border border-primary text-primary`}><RefreshCw size={18} /> รีเฟรช</button>} />
        )}

        {state.kind === 'error' && (
          <EmptyState icon={<WifiOff size={40} />} title="โหลดทริปไม่สำเร็จ" text="ตรวจอินเทอร์เน็ตแล้วลองใหม่"
            action={<button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${BUTTON} border border-primary text-primary`}><RefreshCw size={18} /> ลองใหม่</button>} />
        )}
      </main>
    </div>
  );
}
