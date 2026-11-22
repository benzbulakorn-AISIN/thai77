import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyzeLandmarkBundle, landmarkMappingCsv, parseLandmarkBundle, summarizeLandmarkLinks,
  type LandmarkLinkCtx,
} from '../../src/features/admin/landmarkImportModel';

const manifestPath = new URL('../../data/landmarks/north/northern_landmark_link_manifest.json', import.meta.url);
const raw = readFileSync(manifestPath, 'utf8');

function contextForBundle(): LandmarkLinkCtx {
  const bundle = parseLandmarkBundle('northern_landmark_link_manifest.json', raw);
  const pcodeToId = new Map<string, string>();
  const provinces = [...new Set(bundle.landmarks.map((x) => x.province_pcode))].map((pcode, i) => {
    const id = `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
    pcodeToId.set(pcode, id);
    return { id, pcode, name_th: bundle.landmarks.find((x) => x.province_pcode === pcode)!.province_name_th };
  });
  const places = bundle.landmarks.map((item, i) => ({
    id: item.production_place_id ?? `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    name_th: item.place_name_th,
    province_id: pcodeToId.get(item.province_pcode)!,
  }));
  return { provinces, places };
}

describe('Northern Landmark link bundle', () => {
  it('parses the supplied 18-row bundle without allowing publication or approved images', () => {
    const bundle = parseLandmarkBundle('northern_landmark_link_manifest.json', raw);
    expect(bundle.region).toBe('north');
    expect(bundle.landmarks).toHaveLength(18);
    expect(bundle.landmarks.every((x) => x.landmark_status === 'pending' && x.is_published === false)).toBe(true);
    expect(bundle.landmarks.every((x) => x.image.image_status !== ('approved' as never))).toBe(true);
    expect(bundle.landmarks.filter((x) => x.production_place_id)).toHaveLength(2);
    expect(bundle.landmarks.flatMap((x) => x.sources)).toHaveLength(22);
  });

  it('resolves 2 preserved IDs and 16 exact-name rows only after real places exist', () => {
    const bundle = parseLandmarkBundle('northern_landmark_link_manifest.json', raw);
    const analyzed = analyzeLandmarkBundle(bundle, contextForBundle());
    expect(summarizeLandmarkLinks(analyzed)).toEqual({ total: 18, ready: 18, error: 0, fixedId: 2, exactName: 16 });
    expect(analyzed.every((x) => x.placeId && x.kind === 'ready')).toBe(true);
    const csv = landmarkMappingCsv(analyzed);
    expect(csv).toContain('production_place_id');
    expect(csv.match(/ready_pending_link/g)).toHaveLength(18);
  });

  it('stops when a new place has not been imported yet and never fabricates an ID', () => {
    const bundle = parseLandmarkBundle('northern_landmark_link_manifest.json', raw);
    const ctx = contextForBundle();
    const firstWithoutFixedId = bundle.landmarks.find((x) => !x.production_place_id)!;
    ctx.places = ctx.places.filter((p) => p.name_th !== firstWithoutFixedId.place_name_th);
    const analyzed = analyzeLandmarkBundle(bundle, ctx);
    const missing = analyzed.find((x) => x.item.place_key === firstWithoutFixedId.place_key)!;
    expect(missing.kind).toBe('error');
    expect(missing.placeId).toBeNull();
    expect(missing.errors.join(' ')).toContain('นำเข้า places ก่อน');
  });

  it('refuses published rows and refuses image approval through the link file', () => {
    const badStatus = JSON.parse(raw);
    badStatus.landmarks[0].landmark_status = 'published';
    badStatus.landmarks[0].is_published = true;
    expect(() => parseLandmarkBundle('x.json', JSON.stringify(badStatus))).toThrow(/pending/);

    const badImage = JSON.parse(raw);
    badImage.landmarks[0].image.image_status = 'approved';
    expect(() => parseLandmarkBundle('x.json', JSON.stringify(badImage))).toThrow(/ห้ามอนุมัติรูป/);
  });

  it('refuses ambiguous exact-name matches and requires a real production_place_id', () => {
    const bundle = parseLandmarkBundle('northern_landmark_link_manifest.json', raw);
    const ctx = contextForBundle();
    const target = bundle.landmarks.find((x) => !x.production_place_id)!;
    const original = ctx.places.find((p) => p.name_th === target.place_name_th)!;
    ctx.places.push({ ...original, id: '30000000-0000-4000-8000-000000000001' });
    const analyzed = analyzeLandmarkBundle(bundle, ctx);
    const row = analyzed.find((x) => x.item.place_key === target.place_key)!;
    expect(row.kind).toBe('error');
    expect(row.errors.join(' ')).toContain('มากกว่า 1 แห่ง');
  });
});
