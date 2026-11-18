import { CircleCheck, Clock, FlaskConical, TriangleAlert } from 'lucide-react';
import type { Place } from './types';

export function VerificationBadge({ place, small = false }: { place: Pick<Place, 'verification' | 'is_demo'>; small?: boolean }) {
  const cls = `inline-flex items-center gap-1 rounded-full px-2 ${small ? 'py-0 text-[11px]' : 'py-0.5 text-xs'}`;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {place.is_demo && <span className={`${cls} bg-violet-100 text-violet-800`}><FlaskConical size={12} /> Demo</span>}
      {place.verification === 'verified' && <span className={`${cls} bg-green-100 text-green-800`}><CircleCheck size={12} /> ตรวจแล้ว</span>}
      {place.verification === 'pending' && <span className={`${cls} bg-amber-100 text-amber-900`}><TriangleAlert size={12} /> รอตรวจสอบ</span>}
      {place.verification === 'outdated' && <span className={`${cls} bg-slate-200 text-slate-800`}><Clock size={12} /> ข้อมูลเก่า</span>}
    </span>
  );
}
