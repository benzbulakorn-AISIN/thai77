import { haversineKm, type LatLng } from './provider';

/**
 * "เส้นทางแนะนำเบื้องต้น": Nearest Neighbor + 2-opt on straight-line distance.
 * Not guaranteed optimal. Returns the visiting order as indices into `points`.
 *  - start: fixed departure point (not part of points). If omitted, the best starting point is searched.
 *  - end:   fixed final point (not part of points), e.g. return home.
 */
export function orderStops(points: LatLng[], start?: LatLng | null, end?: LatLng | null): number[] {
  const n = points.length;
  if (n <= 1) return points.map((_, i) => i);
  const d = (a: LatLng, b: LatLng) => haversineKm(a, b);

  const pathLen = (order: number[]) => {
    let s = 0;
    let prev: LatLng | null = start ?? null;
    for (const i of order) {
      if (prev) s += d(prev, points[i]);
      prev = points[i];
    }
    if (end && prev) s += d(prev, end);
    return s;
  };

  const nn = (first: number | null) => {
    const left = new Set(points.map((_, i) => i));
    const order: number[] = [];
    let cur: LatLng;
    if (first !== null) { order.push(first); left.delete(first); cur = points[first]; } else cur = start as LatLng;
    while (left.size) {
      let best = -1, bd = Infinity;
      for (const i of left) {
        const x = d(cur, points[i]);
        if (x < bd) { bd = x; best = i; }
      }
      order.push(best); left.delete(best); cur = points[best];
    }
    return order;
  };

  let order: number[];
  if (start) order = nn(null);
  else {
    order = nn(0);
    let bl = pathLen(order);
    for (let f = 1; f < n; f++) {
      const o = nn(f);
      const l = pathLen(o);
      if (l < bl) { bl = l; order = o; }
    }
  }

  // 2-opt: reverse segments while it shortens the path
  let improved = true;
  let guard = 0;
  let best = pathLen(order);
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const cand = order.slice(0, i).concat(order.slice(i, k + 1).reverse(), order.slice(k + 1));
        const l = pathLen(cand);
        if (l + 1e-9 < best) { best = l; order = cand; improved = true; }
      }
    }
  }
  return order;
}
