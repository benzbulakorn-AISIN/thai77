import { Bookmark, CircleCheck, CircleDashed, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ui/Toast';
import type { MyPlaceState, UserStatus } from './types';

type Props = {
  state: MyPlaceState;
  signedIn: boolean;
  onStatus: (s: UserStatus) => Promise<void>;
  onFavorite: () => Promise<boolean>;
  compact?: boolean;
};

const OPTIONS: { s: UserStatus; label: string; Icon: typeof Bookmark }[] = [
  { s: 'none', label: 'ยังไม่สนใจ', Icon: CircleDashed },
  { s: 'want', label: 'อยากไป', Icon: Bookmark },
  { s: 'visited', label: 'ไปมาแล้ว', Icon: CircleCheck },
];

/** Segmented status + favorite heart. "อยู่ในแผนทริป" is set by the Trip Cart (Part 4.3). */
export function StatusControl({ state, signedIn, onStatus, onFavorite, compact = false }: Props) {
  const toast = useToast();
  const nav = useNavigate();

  const guard = async (fn: () => Promise<unknown>, ok?: string) => {
    if (!signedIn) { toast('เข้าสู่ระบบก่อนเพื่อบันทึก', 'info'); nav('/auth/login'); return; }
    try { await fn(); if (ok) toast(ok, 'success'); } catch { toast('บันทึกไม่สำเร็จ ลองใหม่', 'error'); }
  };

  const h = compact ? 'min-h-10 text-xs' : 'min-h-12 text-sm';
  return (
    <div className="flex items-stretch gap-2">
      <div className="grid flex-1 grid-cols-3 overflow-hidden rounded-xl border border-line" role="group" aria-label="สถานะ">
        {OPTIONS.map(({ s, label, Icon }) => {
          const active = state.status === s || (s === 'want' && state.status === 'planned');
          return (
            <button key={s} type="button" aria-pressed={active}
              onClick={(e) => { e.stopPropagation(); void guard(() => onStatus(s)); }}
              className={`flex ${h} items-center justify-center gap-1 px-1 ${active ? 'bg-primary text-on-primary' : 'bg-surface'}`}>
              <Icon size={compact ? 14 : 16} />
              <span className="truncate">{s === 'want' && state.status === 'planned' ? 'ในแผนทริป' : label}</span>
            </button>
          );
        })}
      </div>
      <button type="button" aria-label={state.favorite ? 'เอาออกจากโปรด' : 'เพิ่มเป็นสถานที่โปรด'} aria-pressed={state.favorite}
        onClick={(e) => { e.stopPropagation(); void guard(async () => { const on = await onFavorite(); toast(on ? 'เพิ่มในสถานที่โปรดแล้ว' : 'เอาออกจากโปรดแล้ว', 'success'); }); }}
        className={`flex ${compact ? 'w-10' : 'w-12'} shrink-0 items-center justify-center rounded-xl border border-line bg-surface`}>
        <Heart size={compact ? 16 : 20} className={state.favorite ? 'fill-rose-500 text-rose-500' : 'text-muted'} />
      </button>
    </div>
  );
}
