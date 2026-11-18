import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

const TILE_URL = (import.meta.env.VITE_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · ' +
  'ขอบเขต: <a href="https://data.humdata.org/dataset/cod-ab-tha">OCHA COD-AB</a> / กรมแผนที่ทหาร';
const THAILAND: L.LatLngBoundsExpression = [[5.6, 97.3], [20.5, 105.7]];

type Props<P> = {
  data: FeatureCollection<Geometry, P> | null;
  getId: (p: P) => string;
  getStyle: (p: P, selected: boolean) => L.PathOptions;
  getTooltip: (p: P) => string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** tap the already-selected shape again */
  onOpen?: (id: string) => void;
  /** fit view to these ids (null/empty = all features) */
  fitIds?: string[] | null;
  className?: string;
};

type ShapeLayer = L.Polygon & { feature?: Feature<Geometry, unknown> };

export function GeoMap<P>(props: Props<P>) {
  const { data, fitIds, className = '' } = props;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.GeoJSON | null>(null);
  const latest = useRef(props);
  latest.current = props;

  // create map once
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomSnap: 0.25, minZoom: 4, maxZoom: 18, attributionControl: true });
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    m.fitBounds(THAILAND);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  // (re)build shape layer when data changes
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layer.current?.remove();
    layer.current = null;
    if (!data) return;
    const g = L.geoJSON(data as FeatureCollection<Geometry, P>, {
      style: (f) => {
        const p = f!.properties as P;
        const cur = latest.current;
        return cur.getStyle(p, cur.getId(p) === cur.selectedId);
      },
      onEachFeature: (f, lyr) => {
        const p = f.properties as P;
        lyr.bindTooltip(() => latest.current.getTooltip(p), { sticky: true, direction: 'top' });
        lyr.on('click', () => {
          const cur = latest.current;
          const id = cur.getId(p);
          lyr.openTooltip();
          if (id === cur.selectedId) cur.onOpen?.(id);
          else cur.onSelect?.(id);
        });
      },
    }).addTo(m);
    layer.current = g;
  }, [data]);

  // restyle on every render (cheap: <= ~80 shapes)
  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    const cur = latest.current;
    g.eachLayer((l) => {
      const s = l as ShapeLayer;
      const p = s.feature?.properties as P | undefined;
      if (!p) return;
      const sel = cur.getId(p) === cur.selectedId;
      s.setStyle(cur.getStyle(p, sel));
      if (sel) s.bringToFront();
    });
  });

  // fit bounds
  const fitKey = fitIds?.join(',') ?? '';
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    const ids = fitKey ? new Set(fitKey.split(',')) : null;
    let b: L.LatLngBounds | null = null;
    g.eachLayer((l) => {
      const s = l as ShapeLayer;
      const p = s.feature?.properties as P | undefined;
      if (!p || (ids && !ids.has(latest.current.getId(p)))) return;
      const lb = s.getBounds();
      b = b ? b.extend(lb) : L.latLngBounds(lb.getSouthWest(), lb.getNorthEast());
    });
    if (b) m.fitBounds(b, { padding: [12, 12] });
  }, [fitKey, data]);

  return <div ref={el} className={`relative z-0 w-full overflow-hidden rounded-2xl border border-line ${className}`} />;
}
