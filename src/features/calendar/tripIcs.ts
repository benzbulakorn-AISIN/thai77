import { downloadText } from '../admin/csv';
import { MODE_LABEL } from '../routing/provider';
import { computeTrip, type DayView } from '../trips/schedule';
import { ITEM_TYPE_LABEL, type Trip, type TripDay, type TripItem } from '../trips/types';
import { buildTripCalendar, buildTripsCalendar, icsFileName, type IcsDay, type IcsTrip } from './ics';

export const ICS_MIME = 'text/calendar;charset=utf-8';

/** timeline of the trip (as shown on screen) -> the shape the .ics writer needs */
export function toIcsDays(views: DayView[]): IcsDay[] {
  return views.map((v) => ({
    date: v.day.date,
    dayIndex: v.day.day_index,
    items: v.items.map((it, k) => {
      const e = v.result.entries[k];
      return {
        id: it.id,
        title: it.title,
        kind: ITEM_TYPE_LABEL[it.item_type],
        lat: it.lat,
        lng: it.lng,
        notes: it.notes,
        start: e.start,
        end: e.end,
        travelKm: e.travel ? e.travel.km : null,
        travelMin: e.travel ? e.travel.min : null,
        travelEstimated: e.travel ? e.travel.estimated : true,
      };
    }),
  }));
}

export function buildTripIcs(trip: Trip, days: TripDay[], items: TripItem[], now = new Date()): string {
  const views = computeTrip(trip, days, items);
  return buildTripCalendar({
    trip: { id: trip.id, name: trip.name, start_date: trip.start_date, end_date: trip.end_date, travelers: trip.travelers },
    days: toIcsDays(views),
    modeLabel: MODE_LABEL[trip.mode] ?? '',
    now,
  });
}

export function buildAllTripsIcs(trips: IcsTrip[], now = new Date()): string {
  return buildTripsCalendar(trips, now);
}

export function downloadIcs(fileName: string, text: string) {
  downloadText(fileName, text, ICS_MIME);
}

export { icsFileName };
