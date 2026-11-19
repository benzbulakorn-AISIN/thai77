import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Bike, Bus, Car, Flag, Footprints, GripVertical, Info, Navigation, TriangleAlert, type LucideIcon } from 'lucide-react';
import { fmtDuration, fmtMin } from '../routing/time';
import { MODE_LABEL } from '../routing/provider';
import { ItemIcon, ITEM_COLOR } from './itemIcons';
import { legSummary, type Leg } from './travelText';
import type { DayView } from './schedule';
import type { SchedEntry } from '../routing/scheduler';
import type { TravelMode, TripItem } from './types';

const MODE_ICON: Record<TravelMode, LucideIcon> = { car: Car, motorcycle: Bike, walk: Footprints, public_transport: Bus };

type Props = {
  view: DayView;
  /** how the trip travels (icon + wording of the legs); defaults to car */
  mode?: TravelMode;
  onOpen: (item: TripItem) => void;
  onReorder: (orderedIds: string[]) => void;
};

/** one leg between two stops: icon, distance · time, and whether it is an estimate / typed in / has a buffer */
function LegLine({ leg, mode }: { leg: Leg | null; mode: TravelMode }) {
  if (!leg) return null;
  const s = legSummary(leg, MODE_LABEL[mode]);
  if (!s.main && !s.buffer) return null;
  const Icon = MODE_ICON[mode];
  return (
    <div role="note" aria-label={s.a11y}
      className="ml-6 flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 border-dashed border-line py-2 pl-5 text-xs">
      {s.main && (
        <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${s.long ? 'text-amber-700 dark:text-amber-400' : 'text-fg'}`}>
          <Icon size={15} aria-hidden="true" /> {s.main}
        </span>
      )}
      {s.main && (
        <span className={`rounded-full px-2 py-0.5 ${leg.estimated ? 'bg-surface-2 text-muted' : 'bg-primary text-on-primary'}`}>{s.source}</span>
      )}
      {s.long && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">เดินทางนาน</span>}
      {s.buffer && <span className="text-muted">{s.buffer}</span>}
    </div>
  );
}

function Row({ item, e, mode, onOpen }: { item: TripItem; e: SchedEntry; mode: TravelMode; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const color = ITEM_COLOR[item.item_type];
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative ${isDragging ? 'z-10 opacity-80' : ''}`}>
      <LegLine leg={e.travel ? { km: e.travel.km, min: e.travel.min, estimated: e.travel.estimated, bufferMin: e.travel.bufferMin } : null} mode={mode} />
      <div className={`flex items-stretch gap-2 rounded-2xl border bg-surface ${e.warnings.length ? 'border-red-400' : 'border-line'} ${isDragging ? 'shadow-lg' : ''}`}>
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left">
          <div className="w-14 shrink-0 pt-0.5 text-right">
            <p className="text-sm font-bold">{fmtMin(e.start)}</p>
            <p className="text-xs text-muted">{fmtMin(e.end)}</p>
          </div>
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }}>
            <ItemIcon type={item.item_type} size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-tight">{item.title}</p>
            <p className="text-xs text-muted">
              {fmtDuration(e.end - e.start)}
              {item.is_locked_time && ' · 🔒 ล็อกเวลา'}
              {item.lat == null && item.item_type === 'place' && ' · ไม่มีพิกัด'}
            </p>
            {e.warnings.map((w) => (
              <p key={w} className="mt-1 inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs text-red-800"><TriangleAlert size={12} /> {w}</p>
            ))}
            {e.notes.map((n) => (
              <p key={n} className="mt-1 mr-1 inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted"><Info size={12} /> {n}</p>
            ))}
          </div>
        </button>
        <button type="button" aria-label={`ลากเพื่อย้าย ${item.title}`} {...attributes} {...listeners}
          className="flex w-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-r-2xl text-muted hover:bg-surface-2 active:cursor-grabbing">
          <GripVertical size={20} />
        </button>
      </div>
    </li>
  );
}

export function TimelineView({ view, mode = 'car', onOpen, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = view.items.map((i) => i.id);
  const r = view.result;

  const onDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };

  return (
    <div>
      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-white"><Navigation size={16} /></span>
        <p className="text-sm"><b>{fmtMin(r.depart)}</b> ออกเดินทาง{view.originLabel ? `จาก ${view.originLabel}` : ''}</p>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="space-y-0">
            {view.items.map((item, i) => <Row key={item.id} item={item} e={r.entries[i]} mode={mode} onOpen={() => onOpen(item)} />)}
          </ol>
        </SortableContext>
      </DndContext>
      {r.returnLeg && (
        <>
          <LegLine leg={{ km: r.returnLeg.km, min: r.returnLeg.min, estimated: r.returnLeg.estimated }} mode={mode} />
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-white"><Flag size={16} /></span>
            <p className="text-sm"><b>{fmtMin(r.finish)}</b> {view.destinationLabel ?? 'ถึงปลายทาง'}</p>
          </div>
        </>
      )}
    </div>
  );
}
