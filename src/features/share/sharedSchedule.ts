import { scheduleDay, type DayResult } from '../routing/scheduler';
import { toMin } from '../routing/time';
import { toSchedInputs, type SharedDay, type SharedTrip } from './sharedTripModel';

export type SharedDayView = { day: SharedDay; result: DayResult };

/**
 * Times for the viewer, computed in the viewer's browser from the shared items.
 * No start / end point is used, so each day starts with its first item at the day's start time
 * (the owner's own screen also counts the drive from home, hence small differences).
 */
export function buildSharedDayViews(trip: SharedTrip): SharedDayView[] {
  const endMin = toMin(trip.dayEnd, 20 * 60);
  return trip.days.map((day) => ({
    day,
    result: scheduleDay(toSchedInputs(day), {
      date: day.date,
      startMin: toMin(day.startTime, 7 * 60),
      endMin,
      origin: null,
      destination: null,
      mode: trip.mode,
      roadFactor: trip.roadFactor,
    }),
  }));
}
