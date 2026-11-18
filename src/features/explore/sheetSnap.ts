// Bottom sheet with 3 levels (hidden / half / full). Pure maths so it can be tested without a browser.
export type Snap = 'hidden' | 'half' | 'full';
export const SNAP_ORDER: Snap[] = ['hidden', 'half', 'full'];
export type SnapHeights = Record<Snap, number>;

/** pixel height of each level for a container of the given height */
export function snapHeights(containerH: number): SnapHeights {
  const h = Math.max(240, Math.round(Number.isFinite(containerH) ? containerH : 0));
  const full = Math.max(h - 16, 200);
  const half = Math.min(Math.max(Math.round(h * 0.46), 220), Math.round(full * 0.72));
  const hidden = Math.min(84, half - 40);
  return { hidden, half, full };
}

export function nearestSnap(height: number, heights: SnapHeights): Snap {
  let best: Snap = 'half';
  let d = Infinity;
  for (const s of SNAP_ORDER) {
    const x = Math.abs(heights[s] - height);
    if (x < d) { d = x; best = s; }
  }
  return best;
}

/** tap on the handle: hidden -> half -> full -> half */
export function cycleSnap(s: Snap): Snap {
  return s === 'hidden' ? 'half' : s === 'half' ? 'full' : 'half';
}

export const clampHeight = (h: number, heights: SnapHeights) => Math.max(heights.hidden * 0.85, Math.min(heights.full, h));

export const FLICK_PX_PER_MS = 0.5;

/**
 * Where the sheet settles after a drag.
 *  dy: pixels moved since pointer down (positive = dragged down)
 *  velocity: px/ms, negative = moving up
 * A quick flick moves exactly one level; a slow drag goes to the nearest level.
 */
export function snapFromDrag(o: { from: Snap; startHeight: number; dy: number; velocity: number; heights: SnapHeights }): Snap {
  if (Math.abs(o.velocity) >= FLICK_PX_PER_MS && Math.abs(o.dy) >= 12) {
    const i = SNAP_ORDER.indexOf(o.from);
    return SNAP_ORDER[o.velocity < 0 ? Math.min(i + 1, SNAP_ORDER.length - 1) : Math.max(i - 1, 0)];
  }
  return nearestSnap(o.startHeight - o.dy, o.heights);
}
