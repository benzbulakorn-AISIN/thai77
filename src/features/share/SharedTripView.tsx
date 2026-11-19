import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bike, Bus, Car, ExternalLink, Footprints, Info, Map as MapIcon, MessageSquareQuote, TriangleAlert, type LucideIcon } from 'lucide-react';
import { AutoCover } from '../../components/ui/AutoCover';
import { EmptyState } from '../../components/ui/EmptyState';
import { fmtDuration, fmtMin } from '../routing/time';
import { MODE_LABEL } from '../routing/provider';
import { ItemIcon, ITEM_COLOR } from '../trips/itemIcons';
import { RouteMap, type RoutePoint } from '../trips/RouteMap';
import { legSummary } from '../trips/travelText';
import type { TravelMode } from '../trips/types';
import { buildSharedDayViews } from './sharedSchedule';
import { dayHeading, expiryText, isNoiseNote, mapStops, subtitleText, type SharedTrip } from './sharedTripModel';

const MODE_ICON: Record<TravelMode, LucideIcon> = { car: Car, motorcycle: Bike, walk: Footprints, public_transport: Bus };

type Props = {
  trip: SharedTrip;
  /** owner's preview: adds a banner, hides the "create your own" footer text */
  preview?: boolean;
};

/** Read-only trip, exactly as a viewer sees it. Used by the public page and by the owner's preview. */
export function SharedTripView({ trip, preview = false }: Props) {
  const views = useMemo(() => buildSharedDayViews(trip), [trip]);
  const [dayIdx, setDayIdx] = useState(0);
  const [showMap, setShowMap] = useState(false);
  const view = views[Math.min(dayIdx, Math.max(0, views.length - 1))];
  const ModeIcon = MODE_ICON[trip.mode];
  const expiry = expiryText(trip.expiresAt);
  const stops = view ? mapStops(view.day) : [];
  const points: RoutePoint[] = stops.map((s) => ({ lat: s.lat, lng: s.lng, label: s.label, kind: 'stop', n: s.n }));
  const Heading = preview ? 'h3' : 'h1';

  return (
    <article className="space-y-4">
      {preview && (
        <p role="note" className="rounded-xl border border-primary bg-surface-2 p-3 text-sm">
          <b>ตัวอย่าง</b> — ผู้ดูจะเห็นแบบนี้ทุกประการ (ยังไม่ได้สร้างลิงก์ ไม่มีใครเห็นนอกจากคุณ)
        </p>
      )}

      <header className="space-y-3">
        <AutoCover seed={trip.title} icon="MapPin" ratio="3/1" title={trip.title} subtitle={subtitleText(trip)} />
        <Heading className="sr-only">{trip.title}</Heading>
        {trip.sharer && <p className="text-sm text-muted">แชร์โดย <b className="text-fg">{trip.sharer}</b></p>}
        {trip.message && (
          <blockquote className="flex gap-2 rounded-2xl border border-line bg-surface p-3 text-sm">
            <MessageSquareQuote size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="whitespace-pre-line break-words">{trip.message}</span>
          </blockquote>
        )}
        {trip.provinces.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="จังหวัดในทริป">
            {trip.provinces.map((p) => (
              <li key={p.slug}>
                <Link to={`/province/${p.slug}`} className="inline-flex min-h-10 items-center rounded-full border border-line bg-surface px-4 text-sm">{p.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </header>

      {views.length === 0 ? (
        <EmptyState icon={<Info size={36} />} title="ทริปนี้ยังไม่มีแผนรายวัน" />
      ) : (
        <>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="เลือกวัน">
            {views.map((v, i) => (
              <button key={v.day.dayIndex} type="button" role="tab" aria-selected={i === dayIdx}
                onClick={() => { setDayIdx(i); setShowMap(false); }}
                className={`min-h-12 shrink-0 rounded-xl border px-3 text-left text-sm ${i === dayIdx ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'}`}>
                <span className="block font-semibold">วัน {v.day.dayIndex}{v.day.isRestDay ? ' 🛌' : ''}</span>
                {v.day.date && <span className="block text-xs opacity-80">{dayHeading(v.day).split(' · ')[1]}</span>}
              </button>
            ))}
          </div>

          {view && (
            <section role="tabpanel" aria-label={dayHeading(view.day)} className="space-y-3">
              <h2 className="font-semibold">{dayHeading(view.day)}{view.day.isRestDay ? ' · วันพัก' : ''}</h2>

              {view.day.items.length === 0 ? (
                <EmptyState icon={<Info size={32} />} title={view.day.isRestDay ? 'วันพัก 🛌' : 'ยังไม่มีกิจกรรมในวันนี้'} />
              ) : (
                <>
                  {stops.length > 0 && (
                    <button type="button" aria-pressed={showMap} onClick={() => setShowMap((v) => !v)}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm ${showMap ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'}`}>
                      <MapIcon size={16} /> {showMap ? 'ซ่อนแผนที่' : `ดูแผนที่ (${stops.length} จุด)`}
                    </button>
                  )}
                  {showMap && points.length > 0 && <RouteMap points={points} className="h-[50vh] min-h-[300px]" />}

                  <ol className="space-y-0">
                    {view.day.items.map((it, k) => {
                      const e = view.result.entries[k];
                      const leg = e.travel ? legSummary({ km: e.travel.km, min: e.travel.min, estimated: e.travel.estimated, bufferMin: e.travel.bufferMin }, MODE_LABEL[trip.mode]) : null;
                      const notes = e.notes.filter((n) => !isNoiseNote(n));
                      return (
                        <li key={`${view.day.dayIndex}-${k}`}>
                          {leg && (leg.main || leg.buffer) && (
                            <div role="note" aria-label={leg.a11y} className="ml-6 flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 border-dashed border-line py-2 pl-5 text-xs">
                              {leg.main && (
                                <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${leg.long ? 'text-amber-700 dark:text-amber-400' : 'text-fg'}`}>
                                  <ModeIcon size={15} aria-hidden="true" /> {leg.main}
                                </span>
                              )}
                              {leg.main && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">{leg.source}</span>}
                              {leg.long && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">เดินทางนาน</span>}
                              {leg.buffer && <span className="text-muted">{leg.buffer}</span>}
                            </div>
                          )}
                          <div className={`flex items-start gap-3 rounded-2xl border bg-surface p-3 ${e.warnings.length ? 'border-red-400' : 'border-line'}`}>
                            <div className="w-14 shrink-0 pt-0.5 text-right">
                              <p className="text-sm font-bold">{fmtMin(e.start)}</p>
                              <p className="text-xs text-muted">{fmtMin(e.end)}</p>
                            </div>
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: ITEM_COLOR[it.kind] }}>
                              <ItemIcon type={it.kind} size={16} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium leading-tight">
                                {it.placeId ? <Link to={`/place/${it.placeId}`} className="underline decoration-dotted underline-offset-2">{it.title}</Link> : it.title}
                              </p>
                              <p className="text-xs text-muted">{fmtDuration(e.end - e.start)}{it.lockedStart ? ' · 🔒 เวลาที่กำหนด' : ''}</p>
                              {e.warnings.map((w) => (
                                <p key={w} className="mt-1 inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs text-red-800"><TriangleAlert size={12} /> {w}</p>
                              ))}
                              {notes.map((n) => (
                                <p key={n} className="mr-1 mt-1 inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted"><Info size={12} /> {n}</p>
                              ))}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  <p className="text-xs text-muted">
                    วันนี้ ~{view.result.totalKm.toFixed(0)} กม. · เดินทาง ~{fmtDuration(view.result.totalTravelMin)} · จบ {fmtMin(view.result.finish)}
                  </p>
                  {view.result.overflowMin > 0 && (
                    <p className="flex items-center gap-2 rounded-xl bg-red-100 p-3 text-sm text-red-800">
                      <TriangleAlert size={16} /> วันนี้แน่นเกินไป เกินเวลาเลิกเที่ยว {fmtDuration(view.result.overflowMin)}
                    </p>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}

      <footer className="space-y-1 border-t border-line pt-3 text-xs text-muted">
        <p className="inline-flex items-center gap-1"><ModeIcon size={13} aria-hidden="true" /> เดินทางด้วย{MODE_LABEL[trip.mode]}</p>
        <p>เวลาและระยะทางเป็นค่าประมาณจากลำดับในแผน (ระยะเส้นตรง × ตัวคูณ) ไม่ใช่เส้นทางถนนจริง และอาจต่างจากที่เจ้าของทริปเห็นเล็กน้อย เพราะไม่รวมการเดินทางจากจุดเริ่มต้น</p>
        <p>เวลาเปิด-ปิดและราคาอาจเปลี่ยนแปลง ควรตรวจสอบก่อนเดินทาง · ตำแหน่งที่แสดงเป็นเฉพาะสถานที่ส่วนกลางของแอป</p>
        {expiry && <p>{expiry}</p>}
        {!preview && (
          <p className="inline-flex items-center gap-1">
            <ExternalLink size={12} aria-hidden="true" /> ทริปนี้แชร์แบบอ่านอย่างเดียวผ่านแอป เที่ยวไทย 77
          </p>
        )}
      </footer>
    </article>
  );
}
