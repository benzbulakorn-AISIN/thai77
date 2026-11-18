import { listTrips, loadTrip } from '../trips/tripsApi';
import { computeTrip } from '../trips/schedule';
import { fmtMin } from '../routing/time';
import { ITEM_TYPE_LABEL } from '../trips/types';
import { toCsv } from '../admin/csv';

/** One row per timeline item (times are the planner's estimates). */
export async function buildTripsCsv(): Promise<{ csv: string; trips: number; rows: number }> {
  const header = ['ทริป', 'วันที่', 'วันที่ในทริป', 'เริ่ม', 'จบ', 'ประเภท', 'กิจกรรม', 'ละติจูด', 'ลองจิจูด',
    'ระยะเดินทางมาจุดนี้ (กม. ประมาณ)', 'ค่าใช้จ่ายประมาณ', 'หมายเหตุ'];
  const rows: (string | number | null)[][] = [];
  const trips = await listTrips();
  for (const s of trips) {
    const t = await loadTrip(s.id);
    if (!t) continue;
    const views = computeTrip(t.trip, t.days, t.items);
    for (const v of views) {
      v.items.forEach((it, k) => {
        const e = v.result.entries[k];
        rows.push([
          t.trip.name, v.day.date ?? '', v.day.day_index, fmtMin(e.start), fmtMin(e.end), ITEM_TYPE_LABEL[it.item_type], it.title,
          it.lat, it.lng, e.travel ? Math.round(e.travel.km * 10) / 10 : '', it.est_cost, it.notes ?? '',
        ]);
      });
    }
    t.items.filter((i) => !i.day_id).forEach((it) => rows.push([
      t.trip.name, '', 'ยังไม่จัดวัน', '', '', ITEM_TYPE_LABEL[it.item_type], it.title, it.lat, it.lng, '', it.est_cost, it.notes ?? '',
    ]));
  }
  return { csv: toCsv([header, ...rows]), trips: trips.length, rows: rows.length };
}
