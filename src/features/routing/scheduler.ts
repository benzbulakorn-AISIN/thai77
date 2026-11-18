import { haversineProvider, SPEED_KMH, type LatLng, type Leg } from './provider';
import { parseOpeningHours } from './openingHours';
import { fmtMin, roundUp5, weekdayMon0 } from './time';
import type { TravelMode, TripItemType } from '../trips/types';

export const BUFFER_MIN = 15; // breathing room after each place

export type SchedInput = {
  id: string;
  type: TripItemType;
  title: string;
  lat: number | null;
  lng: number | null;
  durationMin: number;
  lockedStartMin: number | null;
  /** soft lower bound, e.g. lunch not before 11:30 */
  earliestStartMin?: number | null;
  travelOverrideMin: number | null;
  openingHoursText: string | null | undefined;
};

export type SchedEntry = {
  id: string;
  travel: (Leg & { bufferMin: number }) | null;
  arrive: number;
  start: number;
  end: number;
  waitMin: number;
  warnings: string[];
  notes: string[];
};

export type DayResult = {
  depart: number;
  entries: SchedEntry[];
  returnLeg: Leg | null;
  finish: number;
  totalKm: number;
  totalTravelMin: number;
  overflowMin: number;
  lastPoint: LatLng | null;
};

export type DayOptions = {
  date: string | null;
  startMin: number;
  endMin: number;
  origin: LatLng | null;
  destination: LatLng | null;
  mode: TravelMode;
  roadFactor: number;
};

const has = (p: { lat: number | null; lng: number | null }): p is { lat: number; lng: number } =>
  p.lat != null && p.lng != null;

export function scheduleDay(items: SchedInput[], o: DayOptions): DayResult {
  const provider = haversineProvider(o.roadFactor);
  let t = o.startMin;
  let pos: LatLng | null = o.origin;
  let prevWasPlace = false;
  let totalKm = 0, totalTravel = 0;
  const entries: SchedEntry[] = [];

  for (const it of items) {
    const warnings: string[] = [];
    const notes: string[] = [];
    let travel: SchedEntry['travel'] = null;
    const buffer = prevWasPlace ? BUFFER_MIN : 0;

    if (it.travelOverrideMin != null) {
      travel = { km: pos && has(it) ? provider.leg(pos, it, o.mode).km : 0, min: it.travelOverrideMin, estimated: false, bufferMin: buffer };
    } else if (pos && has(it)) {
      travel = { ...provider.leg(pos, it, o.mode), bufferMin: buffer };
    } else if (buffer) {
      travel = { km: 0, min: 0, estimated: true, bufferMin: buffer };
    }
    if (travel) { t += travel.min + travel.bufferMin; totalKm += travel.km; totalTravel += travel.min; }
    if (has(it)) pos = { lat: it.lat, lng: it.lng };

    const arrive = t;
    let start = roundUp5(arrive);

    if (it.earliestStartMin != null && it.lockedStartMin == null && start < it.earliestStartMin) {
      start = it.earliestStartMin;
    }
    if (it.lockedStartMin != null) {
      if (start < it.lockedStartMin) start = it.lockedStartMin;
      else if (start > it.lockedStartMin) warnings.push(`เวลาซ้อน: ถึงช้ากว่าที่กำหนด ${start - it.lockedStartMin} นาที`);
    }

    let end = start + Math.max(0, it.durationMin);

    if (it.type === 'place') {
      const week = parseOpeningHours(it.openingHoursText);
      if (!week || !o.date) {
        notes.push('ไม่ทราบเวลาเปิด-ปิด');
      } else {
        const ranges = week[weekdayMon0(o.date)];
        if (!ranges.length) warnings.push('ปิดในวันนี้');
        else {
          const r = ranges.find(([, e]) => e > start) ?? null;
          if (!r) warnings.push(`ไปถึงหลังเวลาปิด (${fmtMin(ranges[ranges.length - 1][1])})`);
          else {
            if (start < r[0] && it.lockedStartMin == null) {
              notes.push(`รอเปิด ${fmtMin(r[0])}`);
              start = r[0];
              end = start + Math.max(0, it.durationMin);
            } else if (start < r[0]) warnings.push(`ยังไม่เปิด (เปิด ${fmtMin(r[0])})`);
            if (end > r[1]) warnings.push(`เกินเวลาปิด (${fmtMin(r[1])})`);
          }
        }
      }
    }

    entries.push({ id: it.id, travel, arrive, start, end, waitMin: Math.max(0, start - arrive), warnings, notes });
    t = end;
    prevWasPlace = it.type === 'place';
  }

  let returnLeg: Leg | null = null;
  if (o.destination && pos) {
    returnLeg = provider.leg(pos, o.destination, o.mode);
    t += returnLeg.min;
    totalKm += returnLeg.km;
    totalTravel += returnLeg.min;
  }
  return {
    depart: o.startMin,
    entries,
    returnLeg,
    finish: t,
    totalKm,
    totalTravelMin: totalTravel,
    overflowMin: Math.max(0, t - o.endMin),
    lastPoint: pos,
  };
}

export const speedNote = (mode: TravelMode, factor: number) =>
  `ประมาณจากระยะเส้นตรง × ${factor.toFixed(2).replace(/0$/, '')} · ความเร็วเฉลี่ย ${SPEED_KMH[mode]} กม./ชม.`;
