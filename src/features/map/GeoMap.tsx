import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { geometryArea, labelPoint } from './labelPoint';
import { escapeHtml } from '../../lib/escapeHtml';

const TILE_URL = (import.meta.env.VITE_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const GEO_ATTR = 'ขอบเขต: <a href="https://data.humdata.org/dataset/cod-ab-tha">OCHA COD-AB</a> / กรมแผนที่ทหาร';
const THAILAND: L.LatLngBoundsExpression = [[5.6, 97.3], [20.5, 105.7]];

type Props<P> = {
  data: FeatureCollection<Geometry, P> | null;
  getId: (p: P) => string;
  getStyle: (p: P, selected: boolean) => L.PathOptions;
  getTooltip: (p: P) => string;
  /** text shown permanently on the shape; null = no label */
  getLabel?: (p: P) => string | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** tap the already-selected shape again */
  onOpen?: (id: string) => void;
  /** fit view to these ids (null/empty = all features) */
  fitIds?: string[] | null;
  /** show OpenStreetMap background */
  tiles?: boolean;
  className?: string;
};

type ShapeLayer = L.Polygon & { feature?: Feature<Geometry, unknown> };
type LabelItem = { id: string; props: unknown; area: number; marker: L.Marker };

export function GeoMap<P>(props: Props<P>) {
  const { data, fitIds, tiles = true, className = '' } = props;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.GeoJSON | null>(null);
  const labels = useRef<LabelItem[]>([]);
  const labelGroup = useRef<L.LayerGroup | null>(null);
  const latest = useRef(props);
  latest.current = props;

  /** show as many labels as fit without overlapping; selected + larger shapes first */
  const layoutLabels = () => {
    const cur = latest.current;
    const items = [...labels.current].sort((a, b) => {
      const sa = a.id === cur.selectedId ? 1 : 0, sb = b.id === cur.selectedId ? 1 : 0;
      return sb - sa || b.area - a.area;
    });
    const placed: DOMRect[] = [];
    for (const it of items) {
      const node = it.marker.getElement();
      const span = node?.firstElementChild as HTMLElement | null | undefined;
      if (!node || !span) continue;
      const text = cur.getLabel ? cur.getLabel(it.props as P) : null;
      if (!text) { node.style.visibility = 'hidden'; continue; }
      if (span.textContent !== text) span.textContent = text;
      span.classList.toggle('is-selected', it.id === cur.selectedId);
      const r = span.getBoundingClientRect();
      const hit = placed.some((q) => r.left < q.right + 2 && r.right + 2 > q.left && r.top < q.bottom && r.bottom > q.top);
      node.style.visibility = hit && it.id !== cur.selectedId ? 'hidden' : 'visible';
      if (!hit || it.id === cur.selectedId) placed.push(r);
    }
  };
  const layoutRef = useRef(layoutLabels);
  layoutRef.current = layoutLabels;

  // create map once
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomSnap: 0.25, minZoom: 4, maxZoom: 18 });
    if (tiles) L.tileLayer(TILE_URL, { attribution: OSM_ATTR, maxZoom: 19, className: 'geo-tiles' }).addTo(m);
    m.attributionControl.addAttribution(GEO_ATTR);
    m.fitBounds(THAILAND);
    labelGroup.current = L.layerGroup().addTo(m);
    m.on('zoomend moveend', () => layoutRef.current());
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      layer.current = null;
      labelGroup.current = null;
      labels.current = [];
    };
    // tiles is fixed for the lifetime of the map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (re)build shape + label layers when data changes
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layer.current?.remove();
    layer.current = null;
    labelGroup.current?.clearLayers();
    labels.current = [];
    if (!data) return;
    const g = L.geoJSON(data as FeatureCollection<Geometry, P>, {
      style: (f) => {
        const p = f!.properties as P;
        const cur = latest.current;
        return cur.getStyle(p, cur.getId(p) === cur.selectedId);
      },
      onEachFeature: (f, lyr) => {
        const p = f.properties as P;
        lyr.bindTooltip(() => latest.current.getTooltip(p), { sticky: true, direction: 'top', className: 'geo-tip' });
        lyr.on('click', () => {
          const cur = latest.current;
          const id = cur.getId(p);
          if (id === cur.selectedId) cur.onOpen?.(id);
          else cur.onSelect?.(id);
        });
        if (latest.current.getLabel && f.geometry) {
          const pt = labelPoint(f.geometry);
          if (pt) {
            const text = latest.current.getLabel(p) ?? '';
            const marker = L.marker(pt, {
              interactive: false,
              keyboard: false,
              icon: L.divIcon({ className: 'geo-label', html: `<span>${escapeHtml(text)}</span>`, iconSize: [0, 0] }),
            });
            labelGroup.current?.addLayer(marker);
            labels.current.push({ id: latest.current.getId(p), props: p, area: geometryArea(f.geometry), marker });
          }
        }
      },
    }).addTo(m);
    layer.current = g;
    requestAnimationFrame(() => layoutRef.current());
  }, [data]);

  // restyle + relabel on every render (cheap: <= ~80 shapes)
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
    layoutLabels();
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

  return (
    <div
      ref={el}
      className={`geo-map relative z-0 w-full overflow-hidden rounded-2xl border border-line ${tiles ? '' : 'no-tiles'} ${className}`}
    />
  );
}
