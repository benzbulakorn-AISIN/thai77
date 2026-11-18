import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { escapeHtml } from '../../lib/escapeHtml';

export type RoutePoint = { lat: number; lng: number; label: string; kind: 'start' | 'stop' | 'end'; n?: number; color?: string };

const TILE_URL = (import.meta.env.VITE_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Numbered stops joined by straight dashed lines (the route is an estimate, not real roads). */
export function RouteMap({ points, className = '' }: { points: RoutePoint[]; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const group = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomSnap: 0.25 });
    L.tileLayer(TILE_URL, { attribution: ATTR, maxZoom: 19 }).addTo(m);
    m.setView([13.5, 100.9], 6);
    group.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; group.current = null; };
  }, []);

  const key = points.map((p) => `${p.lat},${p.lng},${p.n ?? ''},${p.kind}`).join('|');
  useEffect(() => {
    const m = map.current, g = group.current;
    if (!m || !g) return;
    g.clearLayers();
    if (!points.length) return;
    L.polyline(points.map((p) => [p.lat, p.lng] as [number, number]), { color: '#0369A1', weight: 3, dashArray: '6 8', opacity: 0.8 }).addTo(g);
    points.forEach((p) => {
      const text = p.kind === 'start' ? '🏁' : p.kind === 'end' ? '⛳' : String(p.n ?? '');
      const icon = L.divIcon({
        className: 'route-pin',
        html: `<span style="background:${p.color ?? '#0369A1'}">${escapeHtml(text)}</span>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      });
      L.marker([p.lat, p.lng], { icon, keyboard: false }).bindTooltip(escapeHtml(p.label), { direction: 'top', className: 'geo-tip' }).addTo(g);
    });
    m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [30, 30], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={el} className={`relative z-0 w-full overflow-hidden rounded-2xl border border-line ${className}`} />;
}
