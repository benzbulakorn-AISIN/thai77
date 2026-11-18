import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { clampHeight, cycleSnap, snapFromDrag, snapHeights, type Snap } from '../../features/explore/sheetSnap';

type Props = {
  snap: Snap;
  onSnapChange: (s: Snap) => void;
  /** height of the area the sheet sits in (px) */
  containerHeight: number;
  title: string;
  subtitle?: string;
  /** accessible name of the whole panel */
  label: string;
  children: ReactNode;
  footer?: ReactNode;
  /** positioning: on phones it is pinned to the bottom, on large screens the caller turns it into a side panel */
  className?: string;
};

type Drag = { y: number; startH: number; from: Snap; lastY: number; lastT: number; v: number; moved: boolean };

/**
 * Bottom sheet with 3 levels. Drag the header (or tap it / press Enter on the arrow button) to change level.
 * On large screens (lg) the drag header is hidden by the caller's classes and the panel is a normal column.
 */
export function BottomSheet3({ snap, onSnapChange, containerHeight, title, subtitle, label, children, footer, className = '' }: Props) {
  const heights = snapHeights(containerHeight);
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const height = dragH ?? heights[snap];
  const showBody = dragH !== null ? dragH > heights.hidden + 24 : snap !== 'hidden';

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, startH: heights[snap], from: snap, lastY: e.clientY, lastT: performance.now(), v: 0, moved: false };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 4) d.moved = true;
    const now = performance.now();
    if (now - d.lastT >= 8) {
      d.v = (e.clientY - d.lastY) / (now - d.lastT);
      d.lastY = e.clientY;
      d.lastT = now;
    }
    if (d.moved) setDragH(clampHeight(d.startH - dy, heights));
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    setDragH(null);
    if (!d.moved) { onSnapChange(cycleSnap(snap)); return; }
    onSnapChange(snapFromDrag({ from: d.from, startHeight: d.startH, dy: e.clientY - d.y, velocity: d.v, heights }));
  };
  const onCancel = () => { drag.current = null; setDragH(null); };
  // keyboard activation of the arrow button (mouse / touch taps are handled by pointer events above)
  const onKeyClick = (e: MouseEvent<HTMLButtonElement>) => { if (e.detail === 0) onSnapChange(cycleSnap(snap)); };

  return (
    <section
      aria-label={label}
      style={{ '--sheet-h': `${Math.round(height)}px` } as CSSProperties}
      className={`flex h-[var(--sheet-h)] flex-col overflow-hidden rounded-t-2xl border-t border-line bg-surface shadow-[0_-8px_24px_rgb(0_0_0/0.18)] lg:h-auto lg:rounded-none lg:shadow-none ${dragH === null ? 'transition-[height] duration-200' : ''} ${className}`}
    >
      <div
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
        className="shrink-0 touch-none select-none px-4 pb-1 pt-2 lg:touch-auto"
      >
        <span aria-hidden="true" className="mx-auto mb-2 block h-1.5 w-12 rounded-full bg-line lg:hidden" />
        <div className="flex min-h-10 items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold leading-tight">{title}</h2>
            {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onKeyClick} aria-expanded={snap !== 'hidden'} aria-label="ขยายหรือย่อแผง"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 lg:hidden">
            <ChevronsUpDown size={20} />
          </button>
        </div>
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 ${showBody ? '' : 'max-lg:hidden'}`}>{children}</div>
      {footer && (
        <div className={`shrink-0 border-t border-line px-4 pb-7 pt-3 lg:pb-3 ${showBody ? '' : 'max-lg:hidden'}`}>{footer}</div>
      )}
    </section>
  );
}
