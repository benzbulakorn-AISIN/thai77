import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { applyUpdate } from './registerSW';
import { usePwa } from './pwaStore';

/** "a new version is ready": asks first, never swaps versions in the middle of use (a half-filled form would be lost) */
export function UpdateBanner() {
  const { updateReady } = usePwa();
  const [later, setLater] = useState(false);
  if (!updateReady || later) return null;
  return (
    <div role="status" aria-live="polite"
      className="fixed inset-x-0 top-0 z-[950] flex justify-center px-3 pt-[calc(0.5rem+env(safe-area-inset-top))]">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-primary bg-surface p-3 shadow-lg">
        <RefreshCw size={20} className="shrink-0 text-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm"><b>มีเวอร์ชันใหม่</b><span className="block text-xs text-muted">กดอัปเดตเมื่อบันทึกงานที่ค้างอยู่แล้ว</span></p>
        <button type="button" onClick={applyUpdate} className="min-h-11 shrink-0 rounded-xl bg-primary px-4 text-sm font-medium text-on-primary">อัปเดต</button>
        <button type="button" onClick={() => setLater(true)} className="min-h-11 shrink-0 rounded-xl px-2 text-sm text-muted">ภายหลัง</button>
      </div>
    </div>
  );
}
