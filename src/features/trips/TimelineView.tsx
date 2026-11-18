import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Car, Flag, GripVertical, Info, Navigation, TriangleAlert } from 'lucide-react';
import { fmtDuration, fmtMin } from '../routing/time';
import { ItemIcon, ITEM_COLOR } from './itemIcons';
import type { DayView } from './schedule';
import type { SchedEntry } from '../routing/scheduler';
import type { TripItem } from './types';

type Props = {
  view: DayView;
  onOpen: (item: TripItem) => void;
  onReorder: (orderedIds: string[]) => void;
};

function TravelLine({ e }: { e: SchedEntry }) {
  if (!e.travel) return null;
  const parts: string[] = [];
  if (e.travel.km > 0.05) parts.push(`~${e.travel.km.toFixed(e.travel.km < 10 ? 1 : 0)} กม.`);
  if (e.travel.min > 0) parts.push(`~${fmtDuration(e.travel.min)}${e.travel.estimated ? '' : ' (กำหนดเอง)'}`);
  if (e.travel.bufferMin) parts.push(`เผื่อ ${e.travel.bufferMin} น.`);
  if (!parts.length) return null;
  return (
    <div className="ml-6 flex items-center gap-2 border-l-2 border-dashed border-line py-1 pl-5 text-xs text-muted">
      <Car size={14} /> {parts.join(' · ')}
    </div>
  );
}

function Row({ item, e, onOpen }: { item: TripItem; e: SchedEntry; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const color = ITEM_COLOR[item.item_type];
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative ${isDragging ? 'z-10 opacity-80' : ''}`}>
      <TravelLine e={e} />
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

export function TimelineView({ view, onOpen, onReorder }: Props) {
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
            {view.items.map((item, i) => <Row key={item.id} item={item} e={r.entries[i]} onOpen={() => onOpen(item)} />)}
          </ol>
        </SortableContext>
      </DndContext>
      {r.returnLeg && (
        <>
          <div className="ml-6 flex items-center gap-2 border-l-2 border-dashed border-line py-1 pl-5 text-xs text-muted">
            <Car size={14} /> ~{r.returnLeg.km.toFixed(0)} กม. · ~{fmtDuration(r.returnLeg.min)}
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-white"><Flag size={16} /></span>
            <p className="text-sm"><b>{fmtMin(r.finish)}</b> {view.destinationLabel ?? 'ถึงปลายทาง'}</p>
          </div>
        </>
      )}
    </div>
  );
}
