import { STATUS_LABEL, statusColor, type MapStatus } from './colors';

const ORDER: MapStatus[] = ['none', 'planned', 'visited', 'goal'];

export function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="คำอธิบายสี">
      {ORDER.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-sm border border-black/10" style={{ background: statusColor(s) }} />
          {STATUS_LABEL[s]}
        </span>
      ))}
    </div>
  );
}
