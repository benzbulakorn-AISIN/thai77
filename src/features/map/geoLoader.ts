import type { FeatureCollection, Geometry } from 'geojson';

export type ProvinceGeoProps = { pcode: string; name_th: string; name_en: string };
export type DistrictGeoProps = { pcode: string; province_pcode: string; name_th: string; name_en: string };

// Data layer: boundary files live in public/geo (built by scripts/build-geo.mjs).
// Swap the files without touching UI code.
const cache = new Map<string, Promise<unknown>>();

function load<T>(file: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}geo/${file}`;
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`โหลดไฟล์แผนที่ ${file} ไม่สำเร็จ (${r.status})`);
        return r.json();
      })
      .catch((e) => {
        cache.delete(url);
        throw e;
      });
    cache.set(url, p);
  }
  return p as Promise<T>;
}

export const loadProvinceShapes = () => load<FeatureCollection<Geometry, ProvinceGeoProps>>('provinces.geojson');
export const loadDistrictShapes = (provincePcode: string) =>
  load<FeatureCollection<Geometry, DistrictGeoProps>>(`districts/${provincePcode}.geojson`);
