import { Bookmark, CircleCheck, CircleDashed, Heart } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { AUTH_LOADING_ERROR, GUEST_FULL_ERROR, GUEST_NOTICE, MAX_GUEST_ENTRIES } from '../guest/guestModel';
import { guestStore } from '../guest/guestStore';
import type { MyPlaceState, UserStatus } from './types';

type Props = {
  state: MyPlaceState;
  /** false = guest: saving still works, but only on this device */
  signedIn: boolean;
  onStatus: (s: UserStatus) => Promise<void>;
  onFavorite: () => Promise<boolean>;
  compact?: boolean;
  dense?: boolean;
};

const OPTIONS: { s: UserStatus; label: string; Icon: typeof Bookmark }[] = [
  { s: 'none', label: 'ยังไม่สนใจ', Icon: CircleDashed },
  { s: 'want', label: 'อยากไป', Icon: Bookmark },
  { s: 'visited', label: 'ไปมาแล้ว', Icon: CircleCheck },
];

// the long explanation is shown once per page load; later saves only show a short message
let guestNoticeShown = false;

/** Segmented status + favorite heart. "อยู่ในแผนทริป" is set by the Trip Cart (Part 4.3). */
export function StatusControl({ state, signedIn, onStatus, onFavorite, compact = false, dense = false }: Props) {
  const toast = useToast();

  const guard = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (signedIn) { if (ok) toast(ok, 'success'); return; }
      if (!guestStore.getSnapshot().persisted) { toast('เครื่องนี้ไม่ยอมให้บันทึกถาวร — ข้อมูลจะหายเมื่อปิดหน้านี้ เข้าสู่ระบบเพื่อเก็บถาวร', 'info'); return; }
      if (!guestNoticeShown) { guestNoticeShown = true; toast(GUEST_NOTICE, 'info'); return; }
      if (ok) toast(ok, 'success');
    } catch (e) {
      const m = (e as Error)?.message;
      if (m === AUTH_LOADING_ERROR) toast('กำลังตรวจสอบบัญชี รอสักครู่แล้วลองใหม่', 'info');
      else if (m === GUEST_FULL_ERROR) toast(`เก็บในเครื่องได้สูงสุด ${MAX_GUEST_ENTRIES} แห่ง — เข้าสู่ระบบเพื่อเก็บเพิ่ม`, 'error');
      else toast('บันทึกไม่สำเร็จ ลองใหม่', 'error');
    }
  };

  const h = dense ? 'min-h-9 text-xs' : compact ? 'min-h-10 text-xs' : 'min-h-12 text-sm';
  return (
    <div className="flex items-stretch gap-2">
      <div className="grid flex-1 grid-cols-3 overflow-hidden rounded-xl border border-line" role="group" aria-label="สถานะ">
        {OPTIONS.map(({ s, label, Icon }) => {
          const active = state.status === s || (s === 'want' && state.status === 'planned');
          return (
            <button key={s} type="button" aria-pressed={active}
              aria-label={s === 'want' && state.status === 'planned' ? 'อยู่ในแผนทริป' : label}
              title={s === 'want' && state.status === 'planned' ? 'อยู่ในแผนทริป' : label}
              onClick={(e) => { e.stopPropagation(); void guard(() => onStatus(s)); }}
              className={`flex ${h} items-center justify-center gap-1 px-1 ${active ? 'bg-primary text-on-primary' : 'bg-surface'}`}>
              <Icon size={compact ? 14 : 16} />
              {!dense && <span className="truncate">{s === 'want' && state.status === 'planned' ? 'ในแผนทริป' : label}</span>}
            </button>
          );
        })}
      </div>
      <button type="button" aria-label={state.favorite ? 'เอาออกจากโปรด' : 'เพิ่มเป็นสถานที่โปรด'} aria-pressed={state.favorite}
        onClick={(e) => { e.stopPropagation(); void guard(async () => { const on = await onFavorite(); toast(on ? 'เพิ่มในสถานที่โปรดแล้ว' : 'เอาออกจากโปรดแล้ว', 'success'); }); }}
        title={state.favorite ? 'เอาออกจากโปรด' : 'เพิ่มเป็นสถานที่โปรด'}
        className={`flex ${dense ? 'w-9' : compact ? 'w-10' : 'w-12'} shrink-0 items-center justify-center rounded-xl border border-line bg-surface`}>
        <Heart size={compact ? 16 : 20} className={state.favorite ? 'fill-rose-500 text-rose-500' : 'text-muted'} />
      </button>
    </div>
  );
}
